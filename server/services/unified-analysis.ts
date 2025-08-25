// server/services/unified-analysis.ts

import { promises as fs } from "fs";
import * as path from "path";
import OpenAI from "openai";
import crypto from "crypto";
import { embedImageToVectorCached, EMB_DIM } from "./embeddings";
import { storage } from "../storage";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "server", "uploads");

// absolutize any local path using PUBLIC_BASE_URL
const toAbs = (u: any) => {
  if (typeof u !== "string" || !u) return u;
  if (/^(https?:|data:)/i.test(u)) return u;
  const base = process.env.PUBLIC_BASE_URL || "";
  // if we still don't have a base, leave as-is and let caller fail fast
  if (!base) return u;
  if (u.startsWith("/")) return `${base}${u}`;
  return `${base}/${u}`;
};

// --- NEW: helpers to turn local/same-origin URLs into data:image/...;base64 ---
const SERVER_ROOT = path.join(process.cwd(), "server");

function guessMimeByExt(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function urlToLocalPath(u: string): string | null {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  // convert absolute same-origin → relative
  if (base && u.startsWith(base + "/")) u = u.slice(base.length);
  if (!u.startsWith("/")) return null;

  if (u.startsWith("/uploads/"))      return path.join(SERVER_ROOT, "uploads", u.replace(/^\/uploads\//, ""));
  if (u.startsWith("/depthmaps/"))    return path.join(SERVER_ROOT, "depthmaps", u.replace(/^\/depthmaps\//, ""));
  if (u.startsWith("/edgemaps/"))     return path.join(SERVER_ROOT, "edgemaps", u.replace(/^\/edgemaps\//, ""));
  if (u.startsWith("/gradientmaps/")) return path.join(SERVER_ROOT, "gradientmaps", u.replace(/^\/gradientmaps\//, ""));
  return null;
}

async function toOpenAIImageUrl(u?: string | null): Promise<string | null> {
  if (!u || typeof u !== "string") return null;
  if (/^data:/i.test(u)) return u; // already a data URL

  if (/^https?:\/\//i.test(u)) {
    // If it’s our own origin, convert; external URLs pass through
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
    if (base && u.startsWith(base + "/")) {
      const p = urlToLocalPath(u);
      if (!p) return u;
      const mime = guessMimeByExt(p);
      if (!/^image\//.test(mime)) return null;
      const buf = await fs.readFile(p);
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    return u;
  }

  // server-relative like /uploads/...
  const p = urlToLocalPath(u);
  if (!p) return null;
  const mime = guessMimeByExt(p);
  if (!/^image\//.test(mime)) return null;
  const buf = await fs.readFile(p);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** ---------- Types ---------- */
type VisualLinks = {
  original: string | null;
  depth?: string | null;
  edge?: string | null;
  gradient?: string | null;
};

type SimilarItem = {
  id: string;
  label?: string;
  links: { original: string; depth?: string | null; edge?: string | null; gradient?: string | null };
  url?: string | null;
};

type AnalysisResult = {
  sessionPrediction: "Asia" | "London" | "New York" | string | null;
  directionBias: "long" | "short" | "neutral" | string | null;
  confidence: number | string | null;
  reasoning: string | null;
  targetVisuals: {
    original?: string | null;
    depth?: string | null;
    edge?: string | null;
    gradient?: string | null;
    depthMapPath?: string | null;
    edgeMapPath?: string | null;
    gradientMapPath?: string | null;
  };
  similarImages: Array<any>;
  model?: string | null;
  tokens?: number | null;
  similarUsed?: boolean;
};

/** ---------- Small helpers ---------- */

// Build OpenAI "image_url" content parts
function toImagePart(url?: string | null) {
  if (!url) return null;
  const abs = toAbs(url); // ensure absolute (https://...) for OpenAI
  return {
    type: "image_url",
    image_url: { url: abs },
  } as const;
}

// Push only if non-null
function pushIf<T>(arr: T[], part: T | null | undefined) {
  if (part) arr.push(part as T);
}

// Discover sibling maps (depth/edge/gradient) next to an original image path under /public/uploads
async function discoverMapsFor(originalUrl: string) {
  try {
    if (!originalUrl || originalUrl.startsWith("data:")) {
      // Cannot discover siblings for data URLs
      return { depth: null, edge: null, gradient: null };
  }
    const uploadsDir = UPLOADS_DIR;
    const name = path.basename(originalUrl);
    const base = name.replace(/\.(png|jpg|jpeg|webp)$/i, "");

    const entries = await fs.readdir(uploadsDir);
    const pick = (keyword: string) => {
      const match = entries.find(
        (n) =>
          (n.startsWith(base) || n.includes(base)) &&
          n.toLowerCase().includes(keyword)
      );
      return match ? `/uploads/${match}` : null;
    };

    return {
      depth: pick("depth"),
      edge: pick("edge"),
      gradient: pick("gradient"),
    };
  } catch {
    return { depth: null, edge: null, gradient: null };
  }
}

// Vector/RAG-based similar finder: embed target → query DB → exclude self
async function findSimilarCharts(images: string[], limit = 3): Promise<SimilarItem[]> {
  // Expect first image to be the target original
  const targetUrl = images?.[0];
  if (!targetUrl) return [];

  // Convert abs URL (/uploads/foo.png or https://.../uploads/foo.png) → local disk path
  const filename = path.basename(targetUrl);
  const localPath = path.join(UPLOADS_DIR, filename);

  // If file doesn’t exist locally, bail
  try { await fs.access(localPath); } catch { return []; }

  // Create/cached CLIP embedding for target
  let vec: Float32Array | number[] | undefined;
  try {
    const buf = await fs.readFile(localPath);
    const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
    vec = await embedImageToVectorCached(localPath, sha);
  } catch (e) {
    console.warn("[unified] embedImageToVectorCached failed:", e);
    return [];
  }

  if (!vec || (vec as any).length !== EMB_DIM) return [];

  // Query nearest neighbors from DB
  const neighbors = await storage.findSimilarCharts(Array.from(vec as number[]), Math.max(1, limit + 1));

  // Map to UI shape, skipping the uploaded chart itself (same filename)
  const out: SimilarItem[] = [];
  for (const { chart, similarity } of neighbors) {
    if (chart.filename === filename) continue; // exclude self

    const original = `/uploads/${chart.filename}`;
    out.push({
      id: String(chart.id),
      label: `${chart.originalName || chart.filename} (${Math.round(similarity * 100)}%)`,
      links: {
        original,
        depth: chart.depthMapPath || null,
        edge: chart.edgeMapPath || null,
        gradient: chart.gradientMapPath || null,
      },
      url: original,
    });

    if (out.length >= limit) break;
  }

  return out;
}

/** ---------- Core analysis ---------- */

export async function generateAnalysis(opts: {
  prompt?: string;
  images?: string[]; // [original, depth, edge, gradient] or just [original]
  systemPrompt?: string;
  wantSimilar?: boolean;
}): Promise<AnalysisResult> {
  const prompt = (opts.prompt ?? "").trim();
  const images = Array.isArray(opts.images) ? opts.images.filter(Boolean) : [];
  const wantSimilar = Boolean(opts.wantSimilar);
  const system =
    (opts.systemPrompt ?? "").trim() ||
    "You are a strict, JSON-only analyst for market charts.";

  // Build the user content parts (text + image_url parts)
  const userContent: Array<any> = [];

  // Minimal cue text so the user message always has text
  userContent.push({
    type: "text",
    text: prompt || "[AUTOGEN] Use systemPrompt + images + similar charts.",
  });

  // Target visuals in fixed order
  const targetVisuals: VisualLinks = {
    original: images[0] ?? null,
    depth: images[1] ?? null,
    edge: images[2] ?? null,
    gradient: images[3] ?? null,
  };

  // Force absolute URLs for target visuals up front
targetVisuals.original = toAbs(targetVisuals.original);
targetVisuals.depth    = toAbs(targetVisuals.depth);
targetVisuals.edge     = toAbs(targetVisuals.edge);
targetVisuals.gradient = toAbs(targetVisuals.gradient);
  
  // If only original provided, try to discover siblings on disk
  if (
    targetVisuals.original &&
    !targetVisuals.depth &&
    !targetVisuals.edge &&
    !targetVisuals.gradient
  ) {
    const discovered = await discoverMapsFor(targetVisuals.original);
    targetVisuals.depth = targetVisuals.depth || discovered.depth;
    targetVisuals.edge = targetVisuals.edge || discovered.edge;
    targetVisuals.gradient = targetVisuals.gradient || discovered.gradient;
  }

  // Push target visuals (order matters)
  pushIf(userContent, toImagePart(targetVisuals.original));
  pushIf(userContent, toImagePart(targetVisuals.depth));
  pushIf(userContent, toImagePart(targetVisuals.edge));
  pushIf(userContent, toImagePart(targetVisuals.gradient));

  // Similar charts with maps
  let similarCharts: SimilarItem[] = [];
  if (wantSimilar) {
    similarCharts = await findSimilarCharts(images, 3);
    console.log("[unified] similarCharts found:", similarCharts.length);

    if (similarCharts.length > 0) {
      userContent.push({
        type: "text",
        text:
          "SIMILAR_COUNT=" +
          similarCharts.length +
          ". For each similar item, images appear in this fixed order: original, depth, edge, gradient.",
      });
      for (const s of similarCharts) {
        userContent.push({
          type: "text",
          text: `Similar: ${s.label || s.id}`,
        });
        pushIf(userContent, toImagePart(s.links.original));
        pushIf(userContent, toImagePart(s.links.depth));
        pushIf(userContent, toImagePart(s.links.edge));
        pushIf(userContent, toImagePart(s.links.gradient));
      }
    }
  }

  // JSON instruction (strict)
  const jsonInstruction = `
Return ONLY a JSON object with these keys:

{
  "sessionPrediction": "Asia" | "London" | "New York" | null,
  "directionBias": "long" | "short" | "neutral" | null,
  "confidence": number | string | null,
  "reasoning": string | null,
  "similarImages": (any[]) | null,
  "targetVisuals": {
    "depthMapPath"?: string,
    "edgeMapPath"?: string,
    "gradientMapPath"?: string
  }
}

Rules:
- Base your reasoning ONLY on the provided visuals (target + similar) in this order: original, depth, edge, gradient.
- Be specific: reference EMA colors (20 red, 50 blue, 96 green, 200 purple), compression on edge map, and gradient slope.
- Do not output prose outside the JSON. No markdown. No backticks.
- If visual evidence is mixed, still choose the most probable session and bias and explain the key contradicting signals.
- Explicitly reference which layer(s) informed each point (e.g., "edge: compression", "gradient: positive slope", "EMA20 > EMA50").
`.trim();

  userContent.push({ type: "text", text: jsonInstruction });

  // --- OpenAI call (JSON only) ---
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 1600,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent as any },
    ],
  });

  // Preview a safe slice of the response
  console.log(
    "[openai] preview:",
    (completion?.choices?.[0]?.message?.content || "").slice(0, 160)
  );

  // Parse JSON result safely
  const rawText = completion?.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.warn("[unified] JSON parse failed; returning minimal object.");
    parsed = {};
  }

  // If model didn't include similarImages and you want them in UI, backfill from discovered similars
  if (
    wantSimilar &&
    (!Array.isArray(parsed?.similarImages) || parsed.similarImages.length === 0)
  ) {
    parsed.similarImages = similarCharts.map((s) => ({
      id: s.id,
      label: s.label,
      original: s.links?.original ?? null,
      depth: s.links?.depth ?? null,
      edge: s.links?.edge ?? null,
      gradient: s.links?.gradient ?? null,
      url: s.url ?? null,
    }));
  }

  // Prefer model-provided visuals if present; otherwise use our exact paths
  const returnedTargetVisuals =
    parsed?.targetVisuals &&
    (parsed.targetVisuals.depthMapPath ||
      parsed.targetVisuals.edgeMapPath ||
      parsed.targetVisuals.gradientMapPath)
      ? parsed.targetVisuals
      : {
          original: targetVisuals.original || null,
          depth: targetVisuals.depth || null,
          edge: targetVisuals.edge || null,
          gradient: targetVisuals.gradient || null,
        };

  // Final normalized object
  return {
    sessionPrediction: parsed?.sessionPrediction ?? null,
    directionBias: parsed?.directionBias ?? null,
    confidence: parsed?.confidence ?? null,
    reasoning: parsed?.reasoning ?? null,
    targetVisuals: returnedTargetVisuals,
    similarImages: parsed?.similarImages ?? [],
    model: completion?.model ?? "gpt-4o",
    tokens: completion?.usage?.total_tokens ?? null,
    similarUsed: (similarCharts?.length ?? 0) > 0,
  };
}

// Some callers import `.run(...)`; keep that API stable.
export async function run(opts: Parameters<typeof generateAnalysis>[0]) {
  return generateAnalysis(opts);
}

export default { generateAnalysis, run };

// server/services/unified-analysis.ts
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type GenerateAnalysisParams = {
  prompt: string;            // user typed text (question/instructions)
  images: string[];          // base64 data URLs from the client
  systemPrompt?: string;     // <-- your Current Prompt from the UI
  wantSimilar?: boolean;     // ask backend to return 3 similar charts
};

// --- basic similar finder: return objects with original + sibling maps if found ---
async function findSimilarCharts(_images: string[], limit = 3): Promise<Array<{
  id: string;
  label?: string;
  links: { original: string; depth?: string | null; edge?: string | null; gradient?: string | null; };
  url?: string | null;
}>> {
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true });

    const files = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .filter(n => /\.(png|jpg|jpeg|webp)$/i.test(n))
      .sort((a, b) => b.localeCompare(a));

    const picks = files.slice(0, limit).map(n => `/uploads/${n}`);

    const results = [];
    for (const orig of picks) {
      const maps = await (async () => {
        try {
          const name = path.basename(orig);
          const base = name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
          const names = entries.filter(e => e.isFile()).map(e => e.name);

          const find = (kw: string) => {
            const match = names.find(m =>
              (m.startsWith(base) || m.includes(base)) && m.toLowerCase().includes(kw)
            );
            return match ? `/uploads/${match}` : null;
          };

          return {
            depth: find("depth"),
            edge: find("edge"),
            gradient: find("gradient"),
          };
        } catch { return { depth: null, edge: null, gradient: null }; }
      })();

      results.push({
        id: path.basename(orig),
        label: path.basename(orig),
        links: { original: orig, ...maps },
        url: orig,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function generateAnalysis({
  prompt,
  images,
  systemPrompt = "",
  wantSimilar = true,
}: GenerateAnalysisParams): Promise<any> {
  if (!images?.length) {
    throw new Error("No images provided for analysis.");
  }

  // 1) Build SYSTEM message from your Current Prompt (falls back if empty)
  const system =
    (systemPrompt || "").trim() ||
    "You are a financial chart analysis expert. Analyze the chart images and return a short session prediction, direction bias (long/short/neutral), numeric confidence (0..1 or %), and a concise reasoning.";

  // 2) Build USER content (text + multiple images)
  const userText = (prompt || "").trim();
  const userContent: Array<any> = [];
  // Helpers to build OpenAI "image_url" parts and to discover sibling maps on disk
  function toImagePart(url?: string) {
    if (!url) return null;
    return {
      type: "image_url",
      image_url: { url }
    } as const;
  }
  function pushIf(arr: any[], part: any) {
    if (part) arr.push(part);
  }
  async function discoverMapsFor(originalUrl: string) {
    try {
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      const name = path.basename(originalUrl);
      const base = name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
      const entries = await fs.readdir(uploadsDir);

      const pick = (keyword: string) => {
        const match = entries.find(n =>
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
  
  if (userText) {
    userContent.push({ type: "text", text: userText });
  } else {
    userContent.push({
      type: "text",
      text: "Analyze the provided chart(s) using the system instructions.",
    });
  }

    // Build target visuals: [original, depth, edge, gradient] or discover siblings
  const targetVisuals = {
    original: images[0] || null,
    depth: images[1] || null,
    edge: images[2] || null,
    gradient: images[3] || null,
  };

  // If only original was passed, try to discover sibling map files
  if (targetVisuals.original && !targetVisuals.depth && !targetVisuals.edge && !targetVisuals.gradient) {
    const discovered = await discoverMapsFor(targetVisuals.original);
    targetVisuals.depth = targetVisuals.depth || discovered.depth;
    targetVisuals.edge = targetVisuals.edge || discovered.edge;
    targetVisuals.gradient = targetVisuals.gradient || discovered.gradient;
  }

  // Push target visuals to the user content (order matters)
  pushIf(userContent, toImagePart(targetVisuals.original));
  pushIf(userContent, toImagePart(targetVisuals.depth));
  pushIf(userContent, toImagePart(targetVisuals.edge));
  pushIf(userContent, toImagePart(targetVisuals.gradient));
  // --- Similar charts (original + depth + edge + gradient) ---
  let similarCharts: Array<{
    id: string;
    label?: string;
    links: { original: string; depth?: string | null; edge?: string | null; gradient?: string | null; };
    url?: string | null;
  }> = [];

  if (wantSimilar) {
    // Use our disk-based fallback (you can replace with your real retriever later)
    similarCharts = await findSimilarCharts(images, 3);

    if (similarCharts.length > 0) {
      userContent.push({
        type: "text",
        text: `SIMILAR_COUNT=${similarCharts.length}. For each similar item, images appear in this fixed order: original, depth, edge, gradient.`,
      });

      for (const s of similarCharts) {
        // lightweight tag so the model can reference it
        userContent.push({ type: "text", text: `Similar: ${s.label || s.id}` });
        pushIf(userContent, toImagePart(s.links.original));
        pushIf(userContent, toImagePart(s.links.depth));
        pushIf(userContent, toImagePart(s.links.edge));
        pushIf(userContent, toImagePart(s.links.gradient));
      }
    }
  }
  
    // 3) Instruct the model to return strict JSON the UI expects
  const jsonInstruction = `
Return ONLY a JSON object with the following keys:

{
  "sessionPrediction": string | null,
  "directionBias": "long" | "short" | "neutral" | null,
  "confidence": number | string | null,
  "reasoning": string | null,

  // You may fill these from your analysis of the target + similar visuals,
  // but the server will also backfill if missing.
  "similarImages": (any[]) | null,
  "targetVisuals": {
    "depthMapPath"?: string,
    "edgeMapPath"?: string,
    "gradientMapPath"?: string
  }
}
`.trim();

  userContent.push({ type: "text", text: jsonInstruction });

  // 4) Call GPT-4o (not mini) in JSON mode for higher quality
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent as any },
    ],
  });

  const rawText = completion.choices?.[0]?.message?.content || "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }

    // 5) If similarImages absent/empty, backfill from disk with maps
  if (wantSimilar && (!Array.isArray(parsed?.similarImages) || parsed.similarImages.length === 0)) {
    parsed.similarImages = await findSimilarCharts(images, 3);
  }

  // 6) Ensure keys exist (the UI’s normalizer will clean the rest)
  return {
    sessionPrediction: parsed?.sessionPrediction ?? null,
    directionBias: parsed?.directionBias ?? null,
    confidence: parsed?.confidence ?? null,
    reasoning: parsed?.reasoning ?? null,
    similarImages: parsed?.similarImages ?? [],
    targetVisuals: parsed?.targetVisuals ?? {},
  };
}

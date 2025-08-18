// server/routes/analysis.ts
import express from "express";
import { generateAnalysis } from "../services/unified-analysis";
import { normalizeForWire } from "../services/normalizeForWire";

const router = express.Router();

/**
 * Accepts ANY of these bodies:
 *  A) { text, images[], systemPrompt?, wantSimilar? }
 *  B) { content: [{type:'text'| 'image_url', ...}], systemPrompt?, wantSimilar? }
 *  C) { messages: [{role:'system'|'user', content:[...] }], wantSimilar? }
 */
router.post("/analyze", async (req, res) => {
  try {
    const body = req.body ?? {};

    let systemPrompt: string =
      (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) || "";
    const wantSimilar: boolean = Boolean(body.wantSimilar);

    // Always build these two for generateAnalysis(...)
    let promptText = typeof body.text === "string" ? body.text : "";
    let images: string[] = Array.isArray(body.images) ? body.images.slice() : [];

    // --- Shape B: { content: [...] }
    if (Array.isArray(body.content)) {
      for (const part of body.content) {
        if (part?.type === "text" && !promptText && typeof part.text === "string") {
          promptText = part.text;
        }
        if (
          part?.type === "image_url" &&
          part.image_url &&
          typeof part.image_url.url === "string"
        ) {
          images.push(part.image_url.url);
        }
      }
    }

    // --- Shape C: { messages: [...] }
    if (Array.isArray(body.messages)) {
      for (const m of body.messages) {
        const role = m?.role;
        const content = Array.isArray(m?.content) ? m.content : [];

        if (role === "system" && !systemPrompt) {
          const t = content.find((c: any) => c?.type === "text" && typeof c.text === "string");
          if (t) systemPrompt = t.text;
        }

        if (role === "user") {
          for (const c of content) {
            if (!promptText && c?.type === "text" && typeof c.text === "string") {
              promptText = c.text;
            }
            if (
              c?.type === "image_url" &&
              c.image_url &&
              typeof c.image_url.url === "string"
            ) {
              images.push(c.image_url.url);
            }
          }
        }
      }
    }

    // Extra fallback names some clients might send
    if (!images.length && Array.isArray(body.dataUrls)) images = body.dataUrls.slice();
    if (!images.length && Array.isArray(body.dataUrlPreviews)) images = body.dataUrlPreviews.slice();

    // Final safety
    images = (images || []).filter((u) => typeof u === "string" && u.length > 0);

    // Call your real model function
    const raw = await generateAnalysis({
      prompt: promptText || "",
      images,
      systemPrompt,
      wantSimilar,
    });

    // Normalize for the UI
    const data = normalizeForWire(raw, raw?.reasoning ?? "");
    res.json({ result: data });
  } catch (err: any) {
    console.error("analyze error:", err?.stack || err);
    res.status(400).json({ error: err?.message || "Analyze failed." });
  }
});

export default router;

// server/routes/analysis.ts
import { Router } from "express";
import { normalizeForWire } from "../services/normalizeForWire";
import { generateAnalysis } from "../services/unified-analysis";

export const analysisRouter = Router();

// POST /api/chat/analyze
analysisRouter.post("/chat/analyze", async (req, res) => {
  try {
    const body = req.body || {};

    // ---- Accept BOTH schemas ----
    // A) New schema (what your client sends now)
    //    { text: string, images: string[], systemPrompt?: string, wantSimilar?: boolean }
    let promptText: string = body.text ?? body.prompt ?? body.message ?? "";

    let images: string[] = Array.isArray(body.images)
      ? body.images
      : Array.isArray(body.dataUrlPreviews)
      ? body.dataUrlPreviews
      : Array.isArray(body.dataUrls)
      ? body.dataUrls
      : [];

    // B) Old "vision content" schema (fallback)
    //    { content: [{ type:'text', text:'...' }, { type:'image_url', image_url:{ url:'...' }}, ...] }
    if ((!images || images.length === 0) && Array.isArray(body.content)) {
      for (const item of body.content) {
        if (item?.type === "text" && typeof item.text === "string" && !promptText) {
          promptText = item.text;
        }
        if (
          item?.type === "image_url" &&
          item?.image_url &&
          typeof item.image_url.url === "string"
        ) {
          images.push(item.image_url.url);
        }
      }
    }

    // Optional extras from the new client
    const systemPrompt: string = body.systemPrompt ?? "";
    const wantSimilar: boolean = body.wantSimilar ?? true;

    // Minimal validation
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error:
          "No images provided. Send { images: [...] } or a vision-style { content: [...] } array.",
      });
    }

    // Call the real analysis
    const raw = await generateAnalysis({
      prompt: promptText,
      images,
      systemPrompt,
      wantSimilar,
    });

    // Normalize to the wire schema expected by the UI
    const data = normalizeForWire(raw);

    return res.json({ result: data });
  } catch (err: any) {
    console.error("analyze error:", err?.stack || err);
    return res.status(500).json({
      result: {
        sessionPrediction: null,
        directionBias: null,
        confidence: null,
        reasoning: "Server error while analyzing chart.",
        similarImages: [],
        targetVisuals: {},
      },
      error: "analyze_failed",
    });
  }
});

// server/routes/analysis.ts
import { Router } from "express";
import { normalizeForWire } from "../services/normalizeForWire";
import { generateAnalysis } from "../services/unified-analysis";

const router = Router();

/**
 * Accept BOTH payload shapes:
 *  A) { text, images, systemPrompt?, wantSimilar? }
 *  B) { messages: [ {role, content:[{type:'text'| 'image_url', ...}] } ], wantSimilar? }
 * And convert to { prompt, images, systemPrompt, wantSimilar } for generateAnalysis()
 */
function toUnifiedInputs(body: any) {
  // New shape: messages array
  if (Array.isArray(body?.messages)) {
    let systemPrompt = "";
    let prompt = "";
    const images: string[] = [];

    for (const msg of body.messages) {
      if (!msg?.content || !Array.isArray(msg.content)) continue;

      // system -> pick first text
      if (msg.role === "system") {
        const t = msg.content.find((c: any) => c?.type === "text")?.text;
        if (t) systemPrompt = String(t);
      }

      // user -> collect text + images
      if (msg.role === "user") {
        for (const c of msg.content) {
          if (c?.type === "text" && c.text) {
            prompt += (prompt ? "\n\n" : "") + String(c.text);
          }
          if (c?.type === "image_url" && c.image_url?.url) {
            images.push(String(c.image_url.url));
          }
        }
      }
    }

    const wantSimilar = body?.wantSimilar !== false; // default true
    return { prompt, images, systemPrompt, wantSimilar };
  }

  // Legacy shape: { text, images, systemPrompt?, wantSimilar? }
  const prompt =
    body?.text ?? body?.prompt ?? body?.message ?? "";
  const images = Array.isArray(body?.images) ? body.images : [];
  const systemPrompt = body?.systemPrompt ?? "";
  const wantSimilar = body?.wantSimilar !== false;

  return { prompt, images, systemPrompt, wantSimilar };
}

router.post("/analyze", async (req, res) => {
  try {
    // Unify inputs (works for both shapes)
    const { prompt, images, systemPrompt, wantSimilar } = toUnifiedInputs(req.body);

    if (!images?.length) {
      return res.status(400).json({ error: "No images provided." });
    }

    // Call your model
    const raw = await generateAnalysis({
      prompt,
      images,
      systemPrompt,
      wantSimilar,
    });

    // Normalize to the UI schema
    const data = normalizeForWire(raw, raw?.reasoning ?? "");
    res.json({ result: data });
  } catch (err: any) {
    console.error("analyze error:", err?.stack || err);
    res.status(500).json({
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

export default router;

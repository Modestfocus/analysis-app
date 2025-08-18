// server/routes/analysis.ts
import { Router, type Request, type Response } from "express";
import { generateAnalysis } from "../services/unified-analysis";

const router = Router();

/**
 * POST /api/chat/analyze
 * Expects body: { text: string, images: string[], systemPrompt?: string, wantSimilar?: boolean }
 * Returns: { result: { sessionPrediction, directionBias, confidence, reasoning, similarImages, targetVisuals } }
 */
router.post("/chat/analyze", async (req: Request, res: Response) => {
  try {
    const { text, images, systemPrompt, wantSimilar } = req.body ?? {};

    const result = await generateAnalysis({
      prompt: typeof text === "string" ? text : "",
      images: Array.isArray(images) ? images : [],
      systemPrompt: typeof systemPrompt === "string" ? systemPrompt : "",
      wantSimilar: Boolean(wantSimilar),
    });

    // The client expects { result: {...} }
    res.json({ result });
  } catch (err: any) {
    console.error("analyze error", err);
    res.status(500).json({
      result: {
        sessionPrediction: null,
        directionBias: "neutral",
        confidence: null,
        reasoning: err?.message || "Server error while analyzing chart.",
        similarImages: [],
        targetVisuals: {},
      },
      error: "analyze_failed",
    });
  }
});

export default router;

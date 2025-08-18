// server/routes/analysis.ts
import { Router } from "express";
import { generateAnalysis } from "../services/unified-analysis";

const router = Router();

/**
 * Accepts TWO payload styles:
 *  A) { messages: [{role, content:[{type:"text"| "image_url", ...}]}], wantSimilar?, systemPrompt? }
 *  B) { text, images[], wantSimilar?, systemPrompt?, dataUrlPreviews?, dataUrls? }  // legacy
 */
router.post("/analyze", async (req, res) => {
  try {
    const body = req.body || {};

    let systemPrompt: string =
      (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) || "";
    let wantSimilar: boolean =
      typeof body.wantSimilar === "boolean" ? body.wantSimilar : true;

    // We'll normalize to these two for generateAnalysis()
    let promptText = "";
    let images: string[] = [];

    // --------- Path A: OpenAI-style messages array ---------
    if (Array.isArray(body.messages)) {
      const sys = body.messages.find((m: any) => m?.role === "system");
      if (sys) {
        if (Array.isArray(sys.content)) {
          const firstText = sys.content.find((c: any) => c?.type === "text");
          if (firstText?.text) systemPrompt ||= String(firstText.text);
        } else if (typeof sys.content === "string") {
          systemPrompt ||= sys.content;
        }
      }

      const user = body.messages.find((m: any) => m?.role === "user");
      if (user) {
        const contentArray = Array.isArray(user.content)
          ? user.content
          : [{ type: "text", text: user.content }];

        // combine all text parts into one prompt string
        promptText =
          contentArray
            .filter((c: any) => c?.type === "text" && typeof c.text === "string")
            .map((c: any) => c.text)
            .join("\n")
            .trim() || "";

        // extract all image urls
        images = contentArray
          .filter((c: any) => c?.type === "image_url")
          .map((c: any) => c?.image_url?.url || c?.image_url)
          .filter(Boolean);
      }
    }

    // --------- Path B: legacy payload { text, images } ---------
    if (!images.length && Array.isArray(body.images)) {
      images = body.images;
    }
    if (!promptText && typeof body.text === "string") {
      promptText = body.text;
    }

    // Also accept common legacy aliases your client used earlier
    if (!images.length && Array.isArray(body.dataUrlPreviews)) {
      images = body.dataUrlPreviews;
    }
    if (!images.length && Array.isArray(body.dataUrls)) {
      images = body.dataUrls;
    }

    // Guardrails
    if (!Array.isArray(images) || images.length === 0) {
      return res
        .status(400)
        .json({ error: "No images provided (images[] is required)." });
    }

    // Optional: ignore obviously bogus data URLs (like tiny 'AAAA' test)
    images = images.filter((u) => {
      if (typeof u !== "string") return false;
      if (u.startsWith("data:")) return u.length > 100; // drop 1-byte tests
      return true;
    });
    if (images.length === 0) {
      return res.status(400).json({
        error:
          "All provided images were invalid/empty. Send real data URLs or reachable URLs.",
      });
    }

    // Call your real analysis
    const result = await generateAnalysis({
      prompt: promptText,
      images,
      systemPrompt,
      wantSimilar,
    });

    res.json({ result });
  } catch (err: any) {
    console.error("analyze error:", err?.stack || err);
    res
      .status(500)
      .json({ error: err?.message || "Server error while analyzing chart." });
  }
});

export default router;

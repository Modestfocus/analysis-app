// server/routes/analysis.ts
import { Router, type Request, type Response } from "express";
import { generateAnalysis } from "../services/unified-analysis";

const router = Router();

/**
 * Accepts TWO payload styles:
 *  A) { messages: [{role, content:[{type:"text"| "image_url", ...}]}], wantSimilar?, systemPrompt? }
 *  B) { text, images[], wantSimilar?, systemPrompt?, dataUrlPreviews?, dataUrls? }  // legacy
 */
router.post("/analyze", async (req: Request, res: Response) => {
  res.type("application/json");
  console.log(
    "[analysis-router] USING tolerant router. Body keys:",
    Object.keys(req.body || {})
  );

  try {
    const body = req.body ?? {};

    let systemPrompt: string =
      (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) || "";
    const wantSimilar: boolean =
      typeof body.wantSimilar === "boolean" ? body.wantSimilar : true;

    // Normalized inputs passed to generateAnalysis()
    let promptText = "";
    let images: string[] = [];

    // --------- Path A: OpenAI-style messages array ---------
    if (Array.isArray(body.messages)) {
      const sys = body.messages.find((m: any) => m?.role === "system");
      if (sys) {
        if (Array.isArray(sys.content)) {
          const firstText = sys.content.find((c: any) => c?.type === "text");
          if (firstText?.text) systemPrompt ||= String(firstText.text).trim();
        } else if (typeof sys.content === "string") {
          systemPrompt ||= sys.content.trim();
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

        // extract all image urls (supports { image_url: { url } } OR { image_url: "..." })
        images = contentArray
          .filter((c: any) => c?.type === "image_url")
          .map((c: any) => (c?.image_url?.url ?? c?.image_url) as string)
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

    // Also accept earlier legacy aliases
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

    // Optional: ignore obviously bogus data URLs (e.g., tiny 'AAAA' tests)
    images = images.filter((u) => {
      if (typeof u !== "string") return false;
      // For data URLs require some minimum length to ensure it's not a 1-byte PNG
      if (u.startsWith("data:")) return u.length > 100;
      return true;
    });

    if (images.length === 0) {
      return res.status(400).json({
        error:
          "All provided images were invalid/empty. Send real data URLs or reachable URLs.",
      });
    }

    // Call your analysis service
    const result = await generateAnalysis({
      prompt: promptText,
      images,
      systemPrompt,
      wantSimilar,
    });

    return res.status(200).json({ result });
  } catch (err: any) {
    console.error("analyze error:", err?.stack || err);
    return res
      .status(500)
      .json({ error: err?.message || "Server error while analyzing chart." });
  }
});

// Nice-to-have: GET on /analyze returns a simple hint (prevents SPA from swallowing it)
router.get("/analyze", (_req: Request, res: Response) => {
  res.type("application/json").status(405).json({
    error:
      "POST only. Send either { messages:[...] } (OpenAI style) or { text, images[] } (legacy).",
  });
});

export default router;

// server/routes/analysis.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { generateAnalysis } from "../services/unified-analysis";

const router = Router();

/** Join all text chunks into one prompt string */
function collectTextFromContent(content: any[]): string {
  const texts: string[] = [];
  for (const item of content || []) {
    if (item?.type === "text" && typeof item.text === "string") {
      texts.push(item.text);
    }
  }
  return texts.join("\n").trim();
}

/** Collect image URLs from content array */
function collectImagesFromContent(content: any[]): string[] {
  const urls: string[] = [];
  for (const item of content || []) {
    if (item?.type === "image_url" && item.image_url?.url) {
      urls.push(String(item.image_url.url));
    }
  }
  return urls;
}

/** Coerce ANY of the accepted shapes into a single content[] array */
function coerceToContent(body: any): { content: any[]; systemPrompt?: string; wantSimilar?: boolean } {
  // NEW client shape: { text, images, systemPrompt, wantSimilar }
  if (typeof body?.text === "string" || Array.isArray(body?.images)) {
    const c: any[] = [];
    if (body.text) c.push({ type: "text", text: String(body.text) });
    for (const url of body.images || []) {
      c.push({ type: "image_url", image_url: { url: String(url) } });
    }
    return { content: c, systemPrompt: body.systemPrompt, wantSimilar: body.wantSimilar };
  }

  // OpenAI content array: { content: [...] }
  if (Array.isArray(body?.content)) {
    return { content: body.content, systemPrompt: body.systemPrompt, wantSimilar: body.wantSimilar };
  }

  // OpenAI messages array: { messages: [{role, content:[...]}, ...] }
  if (Array.isArray(body?.messages)) {
    const merged: any[] = [];
    for (const m of body.messages) {
      if (Array.isArray(m?.content)) merged.push(...m.content);
    }
    return { content: merged, systemPrompt: body.systemPrompt, wantSimilar: body.wantSimilar };
  }

  return { content: [] };
}

router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { content, systemPrompt, wantSimilar } = coerceToContent(req.body);

    if (!Array.isArray(content) || content.length === 0) {
      return res.status(400).json({ error: "Invalid request format. Expected text and/or images." });
    }

    const prompt = collectTextFromContent(content);
    const images = collectImagesFromContent(content);

    // Call your model wrapper
    const result = await generateAnalysis({
      prompt,
      images,
      systemPrompt: typeof systemPrompt === "string" ? systemPrompt : "",
      wantSimilar: Boolean(wantSimilar),
    });

    res.json({ result });
  } catch (err: any) {
    console.error("analyze route error:", err?.stack || err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

export default router;

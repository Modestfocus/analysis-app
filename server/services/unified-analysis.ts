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

// --- very simple similar finder: pick 3 recent images from /public/uploads ---
async function findSimilarCharts(_images: string[], limit = 3): Promise<string[]> {
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    const entries = await fs.readdir(uploadsDir, { withFileTypes: true });

    // keep only images we can serve
    const files = entries
      .filter(e => e.isFile())
      .map(e => e.name)
      .filter(n => /\.(png|jpg|jpeg|webp)$/i.test(n))
      .sort((a, b) => b.localeCompare(a)); // crude "recent" ordering by name

    // return absolute paths your client can load (Express is already serving /public)
    const pick = files.slice(0, limit).map(n => `/uploads/${n}`);
    return pick;
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

  if (userText) {
    userContent.push({ type: "text", text: userText });
  } else {
    userContent.push({
      type: "text",
      text: "Analyze the provided chart(s) using the system instructions.",
    });
  }

  for (const url of images) {
    userContent.push({
      type: "image_url",
      image_url: { url },
    });
  }

  // 3) Instruct the model to return strict JSON the UI expects
  const jsonInstruction = `
Return ONLY a JSON object with the following keys:

{
  "sessionPrediction": string | null,
  "directionBias": "long" | "short" | "neutral" | null,
  "confidence": number | string | null,
  "reasoning": string | null,
  "similarImages": (number | string)[] | null,
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

  // 5) If similarImages came back empty, fill with our simple picker
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

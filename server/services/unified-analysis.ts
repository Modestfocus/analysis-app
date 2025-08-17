// server/services/unified-analysis.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type GenerateAnalysisParams = {
  prompt: string;            // user typed text (question/instructions)
  images: string[];          // base64 data URLs from the client
  systemPrompt?: string;     // <-- your Current Prompt from the UI
  wantSimilar?: boolean;     // ask backend to return 3 similar charts
};

// ------------- OPTIONAL: replace with your real vector/DB search -------------
async function findSimilarCharts(_images: string[], _limit = 3): Promise<Array<number | string>> {
  // TODO: hook up your CLIP / DB search here and return chart IDs (preferred) or URLs
  // Return an empty array for now (UI handles both IDs and URLs).
  return [];
}
// -----------------------------------------------------------------------------

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
  const system = (systemPrompt || "").trim() ||
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

  // 3) Instruct the model to return strict JSON
  // We keep keys that your normalizer / AnalysisCard already expect.
  const jsonInstruction = `
Return ONLY a JSON object with the following keys:

{
  "sessionPrediction": string | null, // e.g. "Bullish breakout"
  "directionBias": "long" | "short" | "neutral" | null,
  "confidence": number | string | null, // accept 0..1 or %, we will normalize
  "reasoning": string | null,
  "similarImages": (number | string)[] | null, // chart IDs (preferred) or URLs
  "targetVisuals": {
    "depthMapPath"?: string,
    "edgeMapPath"?: string,
    "gradientMapPath"?: string
  }
}
  `.trim();

  // Put the JSON instruction in the user message as well so JSON mode stays focused.
  userContent.push({ type: "text", text: jsonInstruction });

  // 4) Call GPT-4o in JSON mode
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",                   // works well for structured JSON; upgrade model if you like
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

  // 5) Optionally attach similar charts (IDs or URLs)
  if (wantSimilar && !Array.isArray(parsed?.similarImages)) {
    parsed.similarImages = await findSimilarCharts(images, 3);
  }

  // 6) Ensure all keys exist; the UI's normalizer will do further cleanup
  return {
    sessionPrediction: parsed?.sessionPrediction ?? null,
    directionBias: parsed?.directionBias ?? null,
    confidence: parsed?.confidence ?? null,
    reasoning: parsed?.reasoning ?? null,
    similarImages: parsed?.similarImages ?? [],
    targetVisuals: parsed?.targetVisuals ?? {},
  };
}

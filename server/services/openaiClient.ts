// server/services/openaiClient.ts
import OpenAI from "openai";
import { env } from "../config/env";

/** Normalize possibly-relative image URLs using the incoming request host. */
export function toAbsoluteFromReq(req: any, url: string): string | null {
  if (!url || typeof url !== "string") return null;
  if (/^https?:\/\/\/?/i.test(url)) return url; // already absolute
  if (url.startsWith("/")) {
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = req.headers.host as string;
    return `${proto}://${host}${url}`;
  }
  return null; // skip non-URLs like "x"
}

export type AnalyzeJson = {
  sessionPrediction: string; // e.g. "bullish breakout"
  directionBias: string; // "long" | "short" | "neutral"
  confidence: number; // 0..1
  reasoning: string;
};

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/** Calls OpenAI (Responses API) with system+user text and N image URLs. */
export async function callOpenAIAnalyze(opts: {
  system: string;
  user: string;
  images: string[]; // absolute https URLs; empty is ok
}): Promise<AnalyzeJson & { rawText: string }> {
  // Build user content: text + image attachments
  const userContent: any[] = [{ type: "input_text", text: opts.user }];
  for (const u of opts.images)
    userContent.push({ type: "input_image", image_url: u });

  let resp;
  try {
    resp = await client.responses.create({
      model: "gpt-4o",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: opts.system }],
        },
        { role: "user", content: userContent },
      ],
    });
  } catch (e: any) {
    // 🔎 Log structured error details to your Replit Console
    console.error("[openai]", e.status || "", e.code || "", e.message || "");
    if (e.response?.data) {
      console.error("[openai] DETAILS:", JSON.stringify(e.response.data));
    }
    throw e; // keep bubbling so routes.ts returns a 5xx with requestId
  }

  const rawText = resp.output_text ?? "";
  // Be defensive: try to parse JSON, otherwise wrap it.
  let parsed: Partial<AnalyzeJson> = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {
      sessionPrediction: "",
      directionBias: "neutral",
      confidence: 0,
      reasoning: rawText,
    };
  }

  // Fill any missing fields with safe defaults
  return {
    sessionPrediction: parsed.sessionPrediction ?? "",
    directionBias: parsed.directionBias ?? "neutral",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    reasoning: parsed.reasoning ?? "",
    rawText,
  };
}

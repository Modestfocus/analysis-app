import fs from "fs";
import path from "path";
import { env, isPromptDebugOn } from "../config/env";
import { log } from "../utils/logger";

export type ChartLayers = {
  original: string;
  depth: string;
  edge: string;
  gradient: string;
};

export type SimilarItem = ChartLayers & { meta?: Record<string, unknown> };

export type UnifiedInput = {
  currentPrompt: string;     // dashboard “Current Prompt” → becomes system
  injectText?: string;       // appended into user message; may contain "debugPromptId"
  target: ChartLayers;
  similar?: SimilarItem[];   // up to 3
  bundleContext?: Record<string, unknown>;
  requestId: string;
};

export type BuiltPrompt = {
  system: string;
  user: string;
  attachmentsMeta: { targetCount: number; similarCount: number; totalImages: number };
  debugPromptId?: string;
};

export function buildUnifiedPrompt(input: UnifiedInput): BuiltPrompt {
  const { currentPrompt, injectText, target, similar = [], bundleContext, requestId } = input;

  // Parse a debugPromptId if present inside injectText JSON
  let debugPromptId: string | undefined;
  try {
    const m = injectText?.match(/"debugPromptId"\s*:\s*"([^"]+)"/);
    if (m) debugPromptId = m[1];
  } catch { /* ignore */ }

  const system = currentPrompt.trim();

  const userParts = [
    "Analyze the new chart using ALL visual layers (original, depth, edge, gradient).",
    "Use historical similars strictly as visual references; call out explicit pattern matches.",
    "Return compact JSON: { sessionPrediction, directionBias, confidence, reasoning }.",
    injectText ? `\n---\nInject: ${injectText}` : "",
    bundleContext ? `\n---\nBundleContext: ${JSON.stringify(bundleContext)}` : "",
  ];
  const user = userParts.join("\n");

  const totalImages = 4 + similar.length * 4;
  const attachmentsMeta = { targetCount: 4, similarCount: similar.length * 4, totalImages };

  if (isPromptDebugOn) {
    const payload = { system, user, attachmentsMeta, debugPromptId };
    log("built unified prompt", { tag: "unified", requestId });
    if (env.DEBUG_WRITE_PROMPT === "1") {
      const dir = path.join(process.cwd(), "logs");
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      fs.writeFileSync(path.join(dir, `prompt-${requestId}.json`), JSON.stringify(payload, null, 2));
    } else {
      console.log(payload);
    }
  }

  return { system, user, attachmentsMeta, debugPromptId };
}

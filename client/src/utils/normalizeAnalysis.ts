import type { NormalizedAnalysis } from "../components/AnalysisCard";

type AnyObj = Record<string, any>;

function safeParse<T = AnyObj>(maybeJson: any): T | null {
  if (!maybeJson) return null;
  if (typeof maybeJson === "object") return maybeJson as T;
  try { return JSON.parse(String(maybeJson)) as T; } catch { return null; }
}

/**
 * Accepts either:
 *  - { success, analysis: "<json string>" }
 *  - { success, result: { sessionPrediction, directionBias, ... } }
 *  - or just the JSON string itself
 */
export function normalizeAnalysis(payload: any): NormalizedAnalysis | null {
  if (!payload) return null;

  // 1) prefer payload.result if present
  const fromResult = (payload as AnyObj).result;
  const dataObj = fromResult ?? safeParse((payload as AnyObj).analysis) ?? safeParse(payload);

  if (!dataObj) return null;

  // Pull known fields safely
  const sessionPrediction = dataObj.sessionPrediction ?? "";
  const directionBias = (dataObj.directionBias ?? "neutral") as "long" | "short" | "neutral";
  const confidence = typeof dataObj.confidence === "number" ? dataObj.confidence : 0;
  const reasoning = dataObj.reasoning ?? "";

  // Similar charts can arrive in different shapes; try to extract image URLs
  let similarImages: string[] | undefined;
  if (Array.isArray(dataObj.similarCharts)) {
    similarImages = dataObj.similarCharts
      .map((c: any) => c?.imageUrl || c?.chart?.imageUrl || c?.chart?.filename || c?.image || null)
      .filter(Boolean);
  }

  // Target visuals (you already expose depth/edge/gradient paths)
  const targetVisuals = dataObj.targetVisuals ?? {
    depthMapPath: dataObj.depthMapPath,
    edgeMapPath: dataObj.edgeMapPath,
    gradientMapPath: dataObj.gradientMapPath,
  };

  return {
    sessionPrediction,
    directionBias,
    confidence,
    reasoning,
    similarImages,
    targetVisuals,
  };
}

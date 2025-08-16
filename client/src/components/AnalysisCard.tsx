import React from "react";
import { ArrowUp, ArrowDown, Minus, Info } from "lucide-react";
import type { NormalizedAnalysis } from '../lib/normalize-analysis';

// The normalized shape we want to render
export type NormalizedAnalysis = {
  sessionPrediction: string;     // e.g. "Bullish breakout"
  directionBias: "long" | "short" | "neutral";
  confidence: number;            // 0..1
  reasoning: string;
  similarImages?: string[];      // image URLs (optional)
  targetVisuals?: {
    depthMapPath?: string;
    edgeMapPath?: string;
    gradientMapPath?: string;
  };
};

function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "green" | "red" | "gray" }) {
  const toneClass =
    tone === "green" ? "bg-green-100 text-green-700" :
    tone === "red"   ? "bg-red-100 text-red-700" :
                       "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

export default function AnalysisCard({ data }: { data: NormalizedAnalysis }) {
  if (!data) return null; // or a small skeleton
  const { sessionPrediction, directionBias, confidence, reasoning, similarImages, targetVisuals, _fallback, } = data;

    const safeConfidence =
    typeof confidence === 'number'
      ? Math.max(0, Math.min(100, Math.round(confidence)))
      : null;
  
  const TrendIcon =
    directionBias === "long" ? ArrowUp :
    directionBias === "short" ? ArrowDown :
    Minus;

  const trendTone = directionBias === "long" ? "green" : directionBias === "short" ? "red" : "gray";
  const trendLabel = directionBias === "long" ? "Long bias" : directionBias === "short" ? "Short bias" : "Neutral";

  const confPct = Math.round((confidence || 0) * 100);

  return (
    <div className="bg-white/80 dark:bg-zinc-900/60 backdrop-blur rounded-2xl shadow-sm ring-1 ring-black/5 p-5 space-y-5">
      {/* Title / Trend */}
      <div className="flex items-center gap-3">
        <div
          className={`inline-flex items-center justify-center rounded-xl p-2 ${
            trendTone === "green" ? "bg-green-100 text-green-700" :
            trendTone === "red"   ? "bg-red-100 text-red-700"   :
                                    "bg-gray-100 text-gray-700"
          }`}
          title={trendLabel}
        >
          <TrendIcon size={20} />
        </div>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold leading-tight">
            {sessionPrediction || "No prediction"}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <Pill tone={trendTone as any}>{trendLabel}</Pill>
            <Pill>
              Confidence: <span className="ml-1 font-semibold">{confPct}%</span>
            </Pill>
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full ${
              trendTone === "green" ? "bg-green-500" :
              trendTone === "red"   ? "bg-red-500"   : "bg-gray-500"
            }`}
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>

      {/* Reasoning */}
      {reasoning && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <h3 className="m-0 inline-flex items-center gap-2 text-sm font-semibold">
            <Info size={16} /> Why
          </h3>
          <p className="mt-2 whitespace-pre-wrap">{reasoning}</p>
        </div>
      )}

      {/* Target visual links (if you want quick peek actions) */}
      {(targetVisuals?.depthMapPath || targetVisuals?.edgeMapPath || targetVisuals?.gradientMapPath) && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Target Visuals</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {targetVisuals.depthMapPath && (
              <a className="underline text-blue-600 dark:text-blue-400" href={targetVisuals.depthMapPath} target="_blank" rel="noreferrer">Depth</a>
            )}
            {targetVisuals.edgeMapPath && (
              <a className="underline text-blue-600 dark:text-blue-400" href={targetVisuals.edgeMapPath} target="_blank" rel="noreferrer">Edge</a>
            )}
            {targetVisuals.gradientMapPath && (
              <a className="underline text-blue-600 dark:text-blue-400" href={targetVisuals.gradientMapPath} target="_blank" rel="noreferrer">Gradient</a>
            )}
          </div>
        </div>
      )}

      {/* Similar charts (thumbnails) */}
      {similarImages && similarImages.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Similar Charts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {similarImages.map((src, i) => (
              <img
                key={i}
                src={src}
                className="w-full aspect-video object-cover rounded-lg border border-black/5"
                alt={`Similar chart ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

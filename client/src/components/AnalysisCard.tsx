import React from "react";
import { ArrowUp, ArrowDown, Minus, Info } from "lucide-react";
import type { NormalizedAnalysis } from "../lib/normalize-analysis";

function Pill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-100 text-green-700"
      : tone === "red"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

export default function AnalysisCard({ data }: { data: NormalizedAnalysis }) {
  if (!data) return null; // safety

  const {
    sessionPrediction,
    directionBias,
    confidence,
    reasoning,
    similarImages,
    targetVisuals,
    _fallback,
  } = data;

  // Clamp 0..100 (we also clamp in the normalizer — belt & suspenders)
  const safeConfidence =
    typeof confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(confidence)))
      : null;

  // Normalize bias to lower-case for comparisons
  const bias = String(directionBias || "Neutral").toLowerCase();
  const TrendIcon =
    bias === "long" ? ArrowUp : bias === "short" ? ArrowDown : Minus;
  const trendTone = bias === "long" ? "green" : bias === "short" ? "red" : "gray";
  const trendLabel =
    bias === "long"
      ? "Long bias"
      : bias === "short"
      ? "Short bias"
      : "Neutral";

  // Similar images can be strings or objects with { url }
  const similarSrc = (similarImages || []).map((it: any) =>
    typeof it === "string" ? it : it?.url
  );

  return (
    <div className="bg-white/80 dark:bg-zinc-900/60 backdrop-blur rounded-2xl shadow-sm ring-1 ring-black/5 p-5 space-y-5">
      {/* Title / Trend */}
      <div className="flex items-center gap-3">
        <div
          className={`inline-flex items-center justify-center rounded-xl p-2 ${
            trendTone === "green"
              ? "bg-green-100 text-green-700"
              : trendTone === "red"
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-700"
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

            {/* Confidence pill */}
            <span className="px-2 py-0.5 rounded-full bg-slate-700/70 text-white text-xs">
              Confidence:{" "}
              <span className="ml-1 font-semibold">
                {safeConfidence !== null ? `${safeConfidence}%` : "—"}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full ${
              trendTone === "green"
                ? "bg-green-500"
                : trendTone === "red"
                ? "bg-red-500"
                : "bg-gray-500"
            }`}
            style={{ width: `${safeConfidence ?? 0}%` }}
          />
        </div>
      </div>

      {/* Reasoning */}
      {(reasoning || _fallback) && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <h3 className="m-0 inline-flex items-center gap-2 text-sm font-semibold">
            <Info size={16} /> Why
          </h3>
          <p className="mt-2 whitespace-pre-wrap">
            {reasoning || "(No structured reasoning returned)"}
          </p>
        </div>
      )}

      {/* Target visual links */}
      {(targetVisuals?.depth ||
        targetVisuals?.edge ||
        targetVisuals?.gradient) && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Target Visuals</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {targetVisuals.depth && (
              <a
                className="underline text-blue-600 dark:text-blue-400"
                href={targetVisuals.depth}
                target="_blank"
                rel="noreferrer"
              >
                Depth
              </a>
            )}
            {targetVisuals.edge && (
              <a
                className="underline text-blue-600 dark:text-blue-400"
                href={targetVisuals.edge}
                target="_blank"
                rel="noreferrer"
              >
                Edge
              </a>
            )}
            {targetVisuals.gradient && (
              <a
                className="underline text-blue-600 dark:text-blue-400"
                href={targetVisuals.gradient}
                target="_blank"
                rel="noreferrer"
              >
                Gradient
              </a>
            )}
          </div>
        </div>
      )}

      {/* Similar charts */}
      {similarSrc.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Similar Charts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {similarSrc.map((src, i) =>
              src ? (
                <img
                  key={i}
                  src={src}
                  className="w-full aspect-video object-cover rounded-lg border border-black/5"
                  alt={`Similar chart ${i + 1}`}
                />
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

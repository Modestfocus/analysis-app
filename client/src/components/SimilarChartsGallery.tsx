import React from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// Reuse your existing helper to fetch-by-id when only an id is present
function SimilarChartImage({ chartId, filename }: { chartId: number; filename: string }) {
  const { data: chart, isLoading, error } = useQuery({
    queryKey: ['/api/charts', chartId],
    enabled: !!chartId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error || !chart) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Failed to load chart image</p>
        <p className="text-sm">{filename}</p>
      </div>
    );
  }

  const imageUrl = `/uploads/${(chart as any).filename}`;

  return (
    <div className="space-y-3">
      <img
        src={imageUrl}
        alt={`Chart: ${filename}`}
        className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
      {(chart as any).depthMapPath && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Depth Map Analysis:
          </h5>
          <img
            src={(chart as any).depthMapPath}
            alt={`Depth map for ${filename}`}
            className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
    </div>
  );
}

type Props = {
  /** The raw object we got back from the server (we’ll extract similar arrays from a few possible places) */
  source: any;
  /** Optional title override */
  title?: string;
};

export default function SimilarChartsGallery({ source, title = "Similar Charts" }: Props) {
  // accept multiple shapes: `similarCharts`, `similar`, `result.similarCharts`, `result.similar`
  const similarRaw =
    (source &&
      (source.similarCharts ||
       source.similar ||
       source.result?.similarCharts ||
       source.result?.similar)) || [];

  // Debug: if you’re not seeing tiles, open DevTools to confirm what shape we got
  // eslint-disable-next-line no-console
  console.debug("[SimilarChartsGallery] raw similar:", similarRaw);

  if (!Array.isArray(similarRaw) || similarRaw.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        {title}
      </h4>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {similarRaw.map((s: any, i: number) => {
          const mainUrl =
            s.filePath ||
            s.file_url ||
            (s.chart?.filename ? `/uploads/${s.chart.filename}` :
              s.filename ? `/uploads/${s.filename}` : null);

          const depthUrl    = s.depthMapUrl    || s.depthMapPath    || s.chart?.depthMapPath;
          const edgeUrl     = s.edgeMapUrl     || s.edgeMapPath     || s.chart?.edgeMapPath;
          const gradientUrl = s.gradientMapUrl || s.gradientMapPath || s.chart?.gradientMapPath;

          let simPct: number | undefined;
          if (typeof s.similarity === "number") {
            simPct = s.similarity > 1 ? s.similarity : s.similarity * 100;
          } else if (typeof s.score === "number") {
            simPct = s.score > 1 ? s.score : s.score * 100;
          }

          const chartId = s.id ?? s.chart?.id;
          const nameForAlt = s.filename || s.chart?.originalName || (chartId ? `chart-${chartId}` : `similar-${i}`);

          return (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 p-2 rounded-lg border dark:border-gray-700"
            >
              {mainUrl ? (
                <img
                  src={mainUrl}
                  alt={`Similar: ${nameForAlt}`}
                  className="w-full h-28 object-cover rounded-md border dark:border-gray-600"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : chartId ? (
                <SimilarChartImage chartId={chartId as number} filename={nameForAlt} />
              ) : null}

              {(depthUrl || edgeUrl || gradientUrl) && (
                <div className="flex gap-1 mt-2">
                  {depthUrl && (
                    <img
                      src={depthUrl}
                      alt="depth"
                      className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  {edgeUrl && (
                    <img
                      src={edgeUrl}
                      alt="edge"
                      className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  {gradientUrl && (
                    <img
                      src={gradientUrl}
                      alt="gradient"
                      className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
              )}

              {typeof simPct === "number" && !Number.isNaN(simPct) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Similarity: {simPct.toFixed(1)}%
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

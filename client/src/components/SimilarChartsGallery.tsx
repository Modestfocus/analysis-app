import React from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

/* ------------------------- helpers ------------------------- */
const resolveMainUrl = (item: any): string | null => {
  // If the item itself is a string (filename or full URL)
  if (typeof item === "string") {
    return item.startsWith("/uploads/") || /^https?:\/\//i.test(item)
      ? item
      : `/uploads/${item}`;
  }

  // direct url-ish fields
  const direct =
  item.original ||          // normalized primary image
  item.filePath ||
  item.filepath ||
  item.file_url ||
  item.url ||
  item.imageUrl ||
  item.image_url ||
  item.chart?.filePath ||
  item.chart?.file_url;

  if (typeof direct === "string" && direct.length > 0) {
    if (direct.startsWith("/uploads/") || /^https?:\/\//i.test(direct)) {
      return direct;
    }
    if (direct.includes("/uploads/")) {
      const after = direct.slice(direct.indexOf("/uploads/"));
      return after.startsWith("/uploads/") ? after : `/uploads/${after}`;
    }
  }

  // top-level filename
  if (item.filename && typeof item.filename === "string") {
    if (/^https?:\/\//i.test(item.filename)) return item.filename;
    return item.filename.startsWith("/uploads/")
      ? item.filename
      : `/uploads/${item.filename}`;
  }

  // nested chart.filename
  if (item.chart?.filename && typeof item.chart.filename === "string") {
    if (/^https?:\/\//i.test(item.chart.filename)) return item.chart.filename;
    return item.chart.filename.startsWith("/uploads/")
      ? item.chart.filename
      : `/uploads/${item.chart.filename}`;
  }

  return null;
};

const fixMapUrl = (u?: string): string | undefined => {
  if (!u || typeof u !== "string") return undefined;
  if (u.startsWith("/uploads/") || /^https?:\/\//i.test(u)) return u;
  if (u.includes("/uploads/")) {
    const after = u.slice(u.indexOf("/uploads/"));
    return after.startsWith("/uploads/") ? after : `/uploads/${after}`;
  }
  return `/uploads/${u}`;
};

/* -------------- fetch-by-id thumbnail (single def) --------- */
function SimilarChartImage({
  chartId,
  filename,
}: {
  chartId: number;
  filename: string;
}) {
  const { data: chart, isLoading, error } = useQuery({
    queryKey: ["/api/charts", chartId],
    queryFn: async () => {
      const r = await fetch(`/api/charts/${chartId}`);
      if (!r.ok) throw new Error("Failed to fetch chart");
      return r.json();
    },
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
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
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
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
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
  // accept multiple shapes, including normalized `similarImages`
  const similarRaw =
    (source &&
      (source.similarImages ||                      // normalized shape
       source.similarCharts ||
       source.similar ||
       source.result?.similarImages ||              // raw-in-result
       source.result?.similarCharts ||
       source.result?.similar)) || [];

  // Debug
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
          const mainUrl = resolveMainUrl(s);

          // also accept s.maps.{depth,edge,gradient}
          const depthUrl = (typeof s === "object" && s)
  ? fixMapUrl(
      s.depthMapUrl ||
      s.depthMapPath ||
      s.chart?.depthMapPath ||
      s.maps?.depth
    )
  : undefined;

const edgeUrl = (typeof s === "object" && s)
  ? fixMapUrl(
      s.edgeMapUrl ||
      s.edgeMapPath ||
      s.chart?.edgeMapPath ||
      s.maps?.edge
    )
  : undefined;

const gradientUrl = (typeof s === "object" && s)
  ? fixMapUrl(
      s.gradientMapUrl ||
      s.gradientMapPath ||
      s.chart?.gradientMapPath ||
      s.maps?.gradient
    )
  : undefined;

          let simPct: number | undefined;
if (typeof s === "object" && s) {
  if (typeof s.similarity === "number") {
    simPct = s.similarity > 1 ? s.similarity : s.similarity * 100;
  } else if (typeof s.score === "number") {
    simPct = s.score > 1 ? s.score : s.score * 100;
  }
}

const chartId =
  (typeof s === "object" && s) ? (s.id ?? s.chart?.id) : undefined;

const nameForAlt =
  (typeof s === "string")
    ? s
    : (s.filename ||
       s.chart?.originalName ||
       (chartId ? `chart-${chartId}` : `similar-${i}`));
      
          return (
            <div
              key={s.id ?? i}
              className="bg-white dark:bg-gray-800 p-2 rounded-lg border dark:border-gray-700"
            >
              {mainUrl ? (
                <a href={mainUrl} target="_blank" rel="noreferrer">
                  <img
                    src={mainUrl}
                    alt={`Similar: ${nameForAlt}`}
                    className="w-full h-28 object-cover rounded-md border dark:border-gray-600"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </a>
              ) : chartId ? (
                <SimilarChartImage
                  chartId={chartId as number}
                  filename={nameForAlt}
                />
              ) : null}

              {(depthUrl || edgeUrl || gradientUrl) && (
                <div className="flex gap-1 mt-2">
                  {depthUrl && (
                    <a href={depthUrl} target="_blank" rel="noreferrer" title="Depth">
                      <img
                        src={depthUrl}
                        alt="depth"
                        className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
                  )}
                  {edgeUrl && (
                    <a href={edgeUrl} target="_blank" rel="noreferrer" title="Edge">
                      <img
                        src={edgeUrl}
                        alt="edge"
                        className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
                  )}
                  {gradientUrl && (
                    <a
                      href={gradientUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Gradient"
                    >
                      <img
                        src={gradientUrl}
                        alt="gradient"
                        className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </a>
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

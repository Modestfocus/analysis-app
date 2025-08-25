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
          // Robust resolver for the primary thumbnail URL
const resolveMainUrl = (item: any): string | null => {
  // a) direct url-ish fields first
  const direct =
    item.filePath ||
    item.filepath ||
    item.file_url ||
    item.url ||
    item.imageUrl ||
    item.image_url ||
    item.chart?.filePath ||
    item.chart?.file_url;

  if (typeof direct === "string" && direct.length > 0) {
    // if it already looks like /uploads/... or http(s)://... just return it
    if (direct.startsWith("/uploads/") || /^https?:\/\//i.test(direct)) {
      return direct;
    }
    // otherwise try to coerce common local patterns
    if (direct.includes("/uploads/")) {
      const after = direct.slice(direct.indexOf("/uploads/"));
      return after.startsWith("/uploads/") ? after : `/uploads/${after}`;
    }
  }

  // b) top-level filename
if (item.filename && typeof item.filename === "string") {
  if (/^https?:\/\//i.test(item.filename)) return item.filename; // absolute URL
  return item.filename.startsWith("/uploads/")
    ? item.filename
    : `/uploads/${item.filename}`;
}

// c) nested chart.filename
if (item.chart?.filename && typeof item.chart.filename === "string") {
  if (/^https?:\/\//i.test(item.chart.filename)) return item.chart.filename; // absolute URL
  return item.chart.filename.startsWith("/uploads/")
    ? item.chart.filename
    : `/uploads/${item.chart.filename}`;
}

  return null;
};

const mainUrl = resolveMainUrl(s);
      
         const fixMapUrl = (u?: string): string | undefined => {
  if (!u || typeof u !== "string") return undefined;
  if (u.startsWith("/uploads/") || /^https?:\/\//i.test(u)) return u;
  if (u.includes("/uploads/")) {
    const after = u.slice(u.indexOf("/uploads/"));
    return after.startsWith("/uploads/") ? after : `/uploads/${after}`;
  }
  return `/uploads/${u}`;
};

// 1) Add a queryFn so fetching-by-id actually works
function SimilarChartImage({ chartId, filename }: { chartId: number; filename: string }) {
  const { data: chart, isLoading, error } = useQuery({
    queryKey: ['/api/charts', chartId],
    queryFn: async () => {
      const r = await fetch(`/api/charts/${chartId}`);
      if (!r.ok) throw new Error('Failed to fetch chart');
      return r.json();
    },
    enabled: !!chartId,
  });
  ...
}

// 2) Normalize more shapes (s.maps.{depth,edge,gradient})
const depthUrl = fixMapUrl(
  s.depthMapUrl ||
  s.depthMapPath ||
  s.chart?.depthMapPath ||
  s.maps?.depth
);
const edgeUrl = fixMapUrl(
  s.edgeMapUrl ||
  s.edgeMapPath ||
  s.chart?.edgeMapPath ||
  s.maps?.edge
);
const gradientUrl = fixMapUrl(
  s.gradientMapUrl ||
  s.gradientMapPath ||
  s.chart?.gradientMapPath ||
  s.maps?.gradient
);

// 3) Make the main thumb clickable, and wrap each map thumb in <a> links
{mainUrl ? (
  <a href={mainUrl} target="_blank" rel="noreferrer">
    <img
      src={mainUrl}
      alt={`Similar: ${nameForAlt}`}
      className="w-full h-28 object-cover rounded-md border dark:border-gray-600"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  </a>
) : chartId ? (
  <SimilarChartImage chartId={chartId as number} filename={nameForAlt} />
) : null}

{(depthUrl || edgeUrl || gradientUrl) && (
  <div className="flex gap-1 mt-2">
    {depthUrl && (
      <a href={depthUrl} target="_blank" rel="noreferrer" title="Depth">
        <img
          src={depthUrl}
          alt="depth"
          className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </a>
    )}
    {edgeUrl && (
      <a href={edgeUrl} target="_blank" rel="noreferrer" title="Edge">
        <img
          src={edgeUrl}
          alt="edge"
          className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </a>
    )}
    {gradientUrl && (
      <a href={gradientUrl} target="_blank" rel="noreferrer" title="Gradient">
        <img
          src={gradientUrl}
          alt="gradient"
          className="w-1/3 h-12 object-cover rounded border dark:border-gray-600"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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

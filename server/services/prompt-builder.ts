// server/services/prompt-builder.ts
export type ChartMaps = {
  originalPath: string;        // ORIGINAL chart image (absolute URL)
  depthMapPath?: string | null;
  edgeMapPath?: string | null;
  gradientMapPath?: string | null;
  instrument?: string | null;
  timeframe?: string | null;
  similarity?: number | null;  // 0–1 (for similar charts); null for target
  id?: number;                 // internal id if available
  filename?: string;
};

export function buildUnifiedPrompt(basePrompt: string, target: ChartMaps, similars: ChartMaps[]) {
  // Keep basePrompt exactly as provided from the dashboard "Current Prompt".
  const header =
`You will receive the current chart and up to ${similars.length} historically similar charts.
Use ALL provided visuals (original + depth + edge + gradient) when reasoning.`;

  const fmt = (c: ChartMaps, i?: number) => {
    const pct = c.similarity != null ? `${(c.similarity * 100).toFixed(1)}%` : `—`;
    return [
      i != null ? `### Similar ${i + 1} — ${pct}` : `### Current Chart`,
      c.instrument && c.instrument !== 'UNKNOWN' ? `**Instrument:** ${c.instrument}` : null,
      c.timeframe && c.timeframe !== 'UNKNOWN' ? `**Timeframe:** ${c.timeframe}` : null,
      c.filename ? `**File:** ${c.filename}` : null,
      c.originalPath ? `![original](${c.originalPath})` : null,
      c.depthMapPath ? `![depth](${c.depthMapPath})` : null,
      c.edgeMapPath ? `![edge](${c.edgeMapPath})` : null,
      c.gradientMapPath ? `![gradient](${c.gradientMapPath})` : null,
    ].filter(Boolean).join("\n");
  };

  const body =
`${fmt(target)}

## Historical Chart Context
${similars.map((s, i) => fmt(s, i)).join("\n\n")}

---

When comparing patterns, explicitly reference what you see in depth/edge/gradient layers.
Return a single JSON block (no prose) matching:
{
  "analysis": "<concise narrative>",
  "confidence": <0..1>,
  "technical": { "trend": "...", "supportResistance": "...", "patterns": [] },
  "similarCharts": ${similars.length},
  "targetVisuals": {
    "depthMapPath": "${target.depthMapPath ?? ""}",
    "edgeMapPath": "${target.edgeMapPath ?? ""}",
    "gradientMapPath": "${target.gradientMapPath ?? ""}"
  }
}`;

  // Final unified prompt is base + our dynamic section.
  return `${basePrompt}\n\n${header}\n\n${body}`;
}
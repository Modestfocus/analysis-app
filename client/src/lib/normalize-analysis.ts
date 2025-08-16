// client/src/lib/normalize-analysis.ts
export type NormalizedAnalysis = {
  sessionPrediction: 'Bullish' | 'Bearish' | 'Neutral' | null;
  directionBias: 'Long' | 'Short' | 'Neutral' | null;
  confidence: number | null; // 0..100
  reasoning: string;
  similarImages: Array<{ id?: string; title?: string; url?: string }>;
  targetVisuals: { depth?: string; edge?: string; gradient?: string; original?: string };
  _fallback?: boolean; // debug flag to indicate we filled defaults
};

export function normalizeAnalysis(raw: any): NormalizedAnalysis {
  // Allow strings or objects
  const r = typeof raw === 'string' ? tryJson(raw) ?? {} : (raw ?? {});

  // Accept common alternate keys
  const sessionPrediction =
    r.sessionPrediction ?? r.prediction ?? r.session ?? r.outcome ?? null;

  const directionBias =
    r.directionBias ??
    r.bias ??
    (sessionPrediction === 'Bullish' ? 'Long'
      : sessionPrediction === 'Bearish' ? 'Short'
      : 'Neutral');

  let confidence: number | null =
    r.confidence ?? r.confidencePct ?? r.confidence_percent ?? null;

  if (typeof confidence === 'string') {
    const n = parseFloat(confidence);
    confidence = Number.isFinite(n) ? n : null;
  }
  if (typeof confidence === 'number' && confidence <= 1) {
    // normalize 0..1 to 0..100 if needed
    confidence = Math.round(confidence * 100);
  }
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    confidence = null;
  }

  const reasoning = r.reasoning ?? r.explanation ?? r.notes ?? '';

  const similarImages =
    Array.isArray(r.similarImages) ? r.similarImages
    : Array.isArray(r.similars) ? r.similars
    : [];

  const visualsObj = r.targetVisuals ?? r.visuals ?? r.maps ?? {};
  const targetVisuals = {
    depth: visualsObj.depth ?? visualsObj.depthMap ?? undefined,
    edge: visualsObj.edge ?? visualsObj.edgeMap ?? undefined,
    gradient: visualsObj.gradient ?? visualsObj.gradientMap ?? undefined,
    original: visualsObj.original ?? visualsObj.chart ?? undefined,
  };

  const empty =
    !sessionPrediction && !directionBias && !confidence && !reasoning && similarImages.length === 0;

  return {
    sessionPrediction: normalizePred(sessionPrediction),
    directionBias: normalizeBias(directionBias),
    confidence: clampPct(confidence),
    reasoning: reasoning || (empty ? '(No structured reasoning returned)' : ''),
    similarImages,
    targetVisuals,
    _fallback: empty,
  };
}

function tryJson(s: string) {
  try { return JSON.parse(extractJsonBlock(s)); } catch { return null; }
}

function extractJsonBlock(s: string) {
  // Handles ```json ... ``` wrapping
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

function normalizePred(v: any) {
  const t = String(v || '').toLowerCase();
  if (t.startsWith('bull')) return 'Bullish';
  if (t.startsWith('bear')) return 'Bearish';
  if (t) return 'Neutral';
  return null;
}

function normalizeBias(v: any) {
  const t = String(v || '').toLowerCase();
  if (t.startsWith('long') || t.startsWith('buy')) return 'Long';
  if (t.startsWith('short') || t.startsWith('sell')) return 'Short';
  if (t) return 'Neutral';
  return null;
}

function clampPct(n: number | null) {
  if (typeof n !== 'number') return null;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

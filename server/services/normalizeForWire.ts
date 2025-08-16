// server/services/normalizeForWire.ts
export type WireAnalysis = {
  sessionPrediction: 'Bullish' | 'Bearish' | 'Neutral' | null;
  directionBias: 'Long' | 'Short' | 'Neutral' | null;
  confidence: number | null; // 0..100
  reasoning: string;
  similarImages: Array<{ id?: string; title?: string; url?: string }>;
  targetVisuals: { depth?: string; edge?: string; gradient?: string; original?: string };
};

export function normalizeForWire(raw: any, fallbackReasoning?: string): WireAnalysis {
  const r = typeof raw === 'string' ? tryJson(raw) ?? {} : (raw ?? {});
  const sessionPrediction = normalizePred(
    r.sessionPrediction ?? r.prediction ?? r.session ?? r.outcome
  );
  const directionBias = normalizeBias(
    r.directionBias ?? r.bias ?? (sessionPrediction === 'Bullish' ? 'Long'
      : sessionPrediction === 'Bearish' ? 'Short' : 'Neutral')
  );
  let confidence: number | null =
    r.confidence ?? r.confidencePct ?? r.confidence_percent ?? null;

  if (typeof confidence === 'string') {
    const cleaned = confidence.replace('%', '').trim();
    const n = parseFloat(cleaned);
    confidence = Number.isFinite(n) ? n : null;
  }
  if (typeof confidence === 'number' && confidence > 0 && confidence <= 1) {
    confidence = Math.round(confidence * 100);
  }
  confidence = clampPct(confidence);

  const reasoning =
    r.reasoning ?? r.explanation ?? r.notes ?? fallbackReasoning ?? '';

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

  return {
    sessionPrediction,
    directionBias,
    confidence,
    reasoning,
    similarImages,
    targetVisuals,
  };
}

function tryJson(s: string) {
  try { return JSON.parse(extractJsonBlock(s)); } catch { return null; }
}

function extractJsonBlock(s: string) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

function normalizePred(v: any): WireAnalysis['sessionPrediction'] {
  const t = String(v || '').toLowerCase();
  if (t.startsWith('bull')) return 'Bullish';
  if (t.startsWith('bear')) return 'Bearish';
  if (t) return 'Neutral';
  return null;
}

function normalizeBias(v: any): WireAnalysis['directionBias'] {
  const t = String(v || '').toLowerCase();
  if (t.startsWith('long') || t.startsWith('buy')) return 'Long';
  if (t.startsWith('short') || t.startsWith('sell')) return 'Short';
  if (t) return 'Neutral';
  return null;
}

function clampPct(n: number | null) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

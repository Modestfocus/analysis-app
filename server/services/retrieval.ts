import { db } from '../db';
import { charts } from '../../shared/schema';
import { isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { EMB_DIM } from './embeddings';
import { ensureVisualMapsForChart, toAbsoluteUrl } from './visual-maps';

export type SimilarChart = {
  chart: {
    id: number;
    filename: string;
    timeframe?: string | null;
    instrument?: string | null;
    depthMapPath?: string | null;
    edgeMapPath?: string | null;
    gradientMapPath?: string | null;
    uploadedAt?: string | null;
  };
  similarity: number; // cosine similarity 0..1
};

/**
 * Compute cosine similarity between two normalized unit vectors (Node fallback)
 */
function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return Math.max(0, Math.min(1, s)); // a and b are unit norm
}

/**
 * Compute cosine similarity between query vector and chart embedding array
 */
function cosineSimilarity(a: Float32Array, b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  
  // Since vectors are normalized, cosine similarity = dot product
  return Math.max(0, Math.min(1, dotProduct));
}

function l2Normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

const VEC_DIM = 512; // must match pgvector column dim

/**
 * Minimal, no-filter vector search that ALWAYS tries to return k rows.
 * Uses exact scan (no ivfflat / no multi-statement).
 * - vec: raw 512-dim embedding
 * - k: number of neighbors to fetch (default 3)
 */
export async function getTopSimilarCharts(vec: number[], k = 3) {
  console.log("[RAG] getTopSimilarCharts called with k=", k, "vecDims=", vec?.length);
  
  // 1) normalize query vector
  const qv = l2Normalize(vec);

  // 2) inline pgvector literal. IMPORTANT: pgvector expects JSON-like "[a,b,...]"
  const vectorLiteral = `'[${qv.map(x => x.toFixed(6)).join(",")}]'::vector(512)`;

  const sqlText = `
SELECT
  c.id,
  c.filename,
  c.timeframe,
  c.instrument,
  (1 - (c.embedding <=> ${vectorLiteral}))::double precision AS similarity,
  c.depth_map_path,
  c.edge_map_path,
  c.gradient_map_path
FROM charts c
WHERE c.embedding IS NOT NULL
ORDER BY c.embedding <=> ${vectorLiteral}
LIMIT ${k};
  `.trim();

  console.log("[RAG] SQL to execute ===>");
  console.log(sqlText);

  // 4) Probe query to verify DB returns 3 rows
  const probe = await db.execute(sql`
    SELECT id, (1 - (embedding <=> ${sql.raw(vectorLiteral)}))::double precision AS similarity
    FROM charts
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${sql.raw(vectorLiteral)}
    LIMIT 3
  `);
  console.log("[RAG] probe rows:", probe.rows);

  // 3) exact scan — no filters, order by distance, limit k
  //    Use sql.raw to inject the vector literal; do NOT parameterize it.
  const rows = await db.execute(sql`
    SELECT
      c.id,
      c.filename,
      c.timeframe,
      c.instrument,
      (1 - (c.embedding <=> ${sql.raw(vectorLiteral)}))::double precision AS similarity,
      c.depth_map_path,
      c.edge_map_path,
      c.gradient_map_path
    FROM charts c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${sql.raw(vectorLiteral)}
    LIMIT ${k}
  `);

  const result = rows.rows.map((r: any) => ({
    id: Number(r.id),
    filename: r.filename,
    timeframe: r.timeframe,
    instrument: r.instrument,
    similarity: Number(r.similarity),
    depthMapPath: r.depth_map_path,
    edgeMapPath: r.edge_map_path,
    gradientMapPath: r.gradient_map_path,
  }));

  console.table(result.map(r => ({ id: r.id, sim: r.similarity.toFixed(4) })));
  return result; // NO filtering/slicing here
}
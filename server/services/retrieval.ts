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

// 1) keep this helper at top of file
function l2Normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

export async function getTopSimilarCharts(vec: number[], k = 3, excludeId?: number) {
  const qv = l2Normalize(vec);
  const qvStr = `[${qv.join(',')}]`; // IMPORTANT: text literal

  const excludeSql = excludeId ? sql`AND c.id <> ${excludeId}` : sql``;

  // PRIMARY: IVFFlat query with explicit cast from string to vector(512)
  let res = await db.execute(sql`
    SET LOCAL ivfflat.probes = 10;
    WITH q(v) AS (SELECT ${qvStr}::vector(512))
    SELECT
      c.id,
      1 - (c.embedding <=> (SELECT v FROM q))::float8 AS similarity,
      c.filename, c.timeframe, c.instrument,
      c.depth_map_path, c.edge_map_path, c.gradient_map_path
    FROM charts c
    WHERE c.embedding IS NOT NULL
      ${excludeSql}
    ORDER BY c.embedding <=> (SELECT v FROM q)
    LIMIT ${k};
  `);

  let rows = res.rows as any[];

  // FALLBACK: exact scan (no index) if we got < k
  if (rows.length < k) {
    res = await db.execute(sql`
      SET LOCAL enable_indexscan = off;
      SET LOCAL enable_bitmapscan = off;
      SET LOCAL enable_seqscan = on;
      WITH q(v) AS (SELECT ${qvStr}::vector(512))
      SELECT
        c.id,
        1 - (c.embedding <=> (SELECT v FROM q))::float8 AS similarity,
        c.filename, c.timeframe, c.instrument,
        c.depth_map_path, c.edge_map_path, c.gradient_map_path
      FROM charts c
      WHERE c.embedding IS NOT NULL
        ${excludeSql}
      ORDER BY c.embedding <=> (SELECT v FROM q)
      LIMIT ${k};
    `);
    rows = res.rows as any[];
  }

  console.log(`[RAG] query k=${k} { dim: 512 }`);
  console.table(rows.map(r => ({ id: r.id, sim: Number(r.similarity).toFixed(4) })));
  console.log(`[RAG] rows: ${rows.length}`);

  // Do NOT drop rows because maps are missing; map backfill happens elsewhere.
  return rows;
}
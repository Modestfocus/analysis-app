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

/**
 * L2 normalize a vector (returns new array)
 */
function l2Normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

/**
 * Retrieve top-k similar charts using pgvector cosine similarity
 * Minimal, no-filter query that returns k=3 real neighbors every time
 */
export async function getTopSimilarCharts(
  queryVec: Float32Array,
  k = 3,
  req?: any,
  sha?: string,
  excludeId?: number | null
): Promise<SimilarChart[]> {
  // Convert to array and normalize the query vector
  const vec = Array.from(queryVec);
  const qv = l2Normalize(vec);
  const qvStr = `[${qv.join(',')}]`; // IMPORTANT: pass as text, not array param
  
  console.log(`[RAG] query sha ${sha || 'unknown'} k=${k} { dim: ${EMB_DIM}, model: 'Xenova/clip-vit-base-patch32' }`);
  
  try {
    // Minimal, no-filter query with string literal vector casting
    let rows = await db.execute(sql`
      SET LOCAL ivfflat.probes = 10;
      WITH q(v) AS (SELECT ${qvStr}::vector(512))
      SELECT
        c.id,
        1 - (c.embedding <=> (SELECT v FROM q))::double precision AS similarity,
        c.filename, c.timeframe, c.instrument,
        c.depth_map_path, c.edge_map_path, c.gradient_map_path
      FROM charts c
      WHERE c.embedding IS NOT NULL
        ${excludeId ? sql`AND c.id <> ${excludeId}` : sql``}
      ORDER BY c.embedding <=> (SELECT v FROM q)
      LIMIT ${k};
    `);
    
    // If fewer than k rows returned, try exact scan (no index) as fallback
    if (rows.rows.length < 3) {
      const exact = await db.execute(sql`
        SET LOCAL enable_indexscan = off;
        SET LOCAL enable_bitmapscan = off;
        SET LOCAL enable_seqscan = on;
        WITH q(v) AS (SELECT ${qvStr}::vector(512))
        SELECT
          c.id,
          1 - (c.embedding <=> (SELECT v FROM q))::double precision AS similarity,
          c.filename, c.timeframe, c.instrument,
          c.depth_map_path, c.edge_map_path, c.gradient_map_path
        FROM charts c
        WHERE c.embedding IS NOT NULL
          ${excludeId ? sql`AND c.id <> ${excludeId}` : sql``}
        ORDER BY c.embedding <=> (SELECT v FROM q)
        LIMIT ${k};
      `);
      rows = exact;
    }
    
    // Logging for verification
    console.table(rows.rows.map((r: any) => ({ id: r.id, sim: Number(r.similarity).toFixed(4) })));
    console.log(`[RAG] rows: ${rows.rows.length}`);
    
    // Return the rows even if their map paths are missing; generate/backfill maps after selection
    const similarChartsWithMaps = await Promise.all(
      rows.rows.map(async (row: any) => {
        const visualMaps = await ensureVisualMapsForChart(row.id, row.filename);
        
        return {
          chart: {
            id: row.id,
            filename: row.filename,
            timeframe: row.timeframe,
            instrument: row.instrument,
            depthMapPath: toAbsoluteUrl(visualMaps.depthMapPath || row.depth_map_path || '', req),
            edgeMapPath: toAbsoluteUrl(visualMaps.edgeMapPath || row.edge_map_path || '', req),
            gradientMapPath: toAbsoluteUrl(visualMaps.gradientMapPath || row.gradient_map_path || '', req),
            uploadedAt: row.uploaded_at
          },
          similarity: Math.max(0, Math.min(1, parseFloat(row.similarity) || 0))
        };
      })
    );
    
    return similarChartsWithMaps;
    
  } catch (error) {
    console.error("❌ pgvector search failed:", error);
    return [];
  }
}
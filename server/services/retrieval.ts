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
 * L2 normalize a vector in-place
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = 1 / Math.max(Math.sqrt(sum), 1e-12);
  for (let i = 0; i < vec.length; i++) vec[i] *= inv;
  return vec;
}

/**
 * Retrieve top-k similar charts using pgvector cosine similarity
 * Minimal, no-filter query that returns k=3 real neighbors every time
 */
export async function getTopSimilarCharts(
  queryVec: Float32Array,
  k = 3,
  req?: any,
  sha?: string
): Promise<SimilarChart[]> {
  // Normalize the query vector and guard dimensions
  const q = l2Normalize(queryVec);
  console.assert(q.length === EMB_DIM, "query dim mismatch");
  
  if (q.length !== EMB_DIM) {
    console.warn(`⚠️ Query vector dimension mismatch: expected ${EMB_DIM}, got ${q.length}. Aborting pgvector query.`);
    return [];
  }
  
  try {
    // Convert Float32Array to array for SQL query
    const queryArray = Array.from(q);
    
    // Minimal, no-filter query - exactly as specified
    const results = await db.execute(
      sql`
        WITH q(v) AS (VALUES (${queryArray}::vector(512)))
        SELECT
          id, filename, timeframe, instrument,
          depth_map_path, edge_map_path, gradient_map_path, uploaded_at,
          (1 - (embedding <=> (SELECT v FROM q)))::double precision AS similarity
        FROM charts
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> (SELECT v FROM q)
        LIMIT ${k}
      `
    );
    
    // Log exactly as specified for acceptance testing  
    console.log(`[RAG] query sha ${sha || 'unknown'} k=${k} { dim: ${EMB_DIM} }`);
    console.table(results.rows.map((r: any) => ({ id: r.id, sim: Number(r.similarity).toFixed(4) })));
    console.log(`[RAG] rows: ${results.rows.length}`);
    
    // If fewer than k rows returned, try wider search with ivfflat probes
    let finalResults = results;
    if (results.rows.length < k) {
      console.log(`[RAG] Got ${results.rows.length} < ${k}, trying wider ivfflat search...`);
      try {
        finalResults = await db.execute(
          sql`
            SET LOCAL ivfflat.probes = 10;
            WITH q(v) AS (VALUES (${queryArray}::vector(512)))
            SELECT
              id, filename, timeframe, instrument,
              depth_map_path, edge_map_path, gradient_map_path, uploaded_at,
              (1 - (embedding <=> (SELECT v FROM q)))::double precision AS similarity
            FROM charts
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> (SELECT v FROM q)
            LIMIT ${k}
          `
        );
        console.log(`[RAG] Wider search returned ${finalResults.rows.length} rows`);
      } catch (probeError) {
        console.warn(`[RAG] ivfflat.probes adjustment failed:`, probeError);
        finalResults = results; // Use original results
      }
    }
    
    // If still fewer than k, try exact scan without index
    if (finalResults.rows.length < k) {
      console.log(`[RAG] Still got ${finalResults.rows.length} < ${k}, trying exact scan...`);
      try {
        finalResults = await db.execute(
          sql`
            SET LOCAL enable_indexscan = off;
            SET LOCAL enable_bitmapscan = off; 
            SET LOCAL enable_seqscan = on;
            WITH q(v) AS (VALUES (${queryArray}::vector(512)))
            SELECT
              id, filename, timeframe, instrument,
              depth_map_path, edge_map_path, gradient_map_path, uploaded_at,
              (1 - (embedding <=> (SELECT v FROM q)))::double precision AS similarity
            FROM charts
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> (SELECT v FROM q)
            LIMIT ${k}
          `
        );
        console.log(`[RAG] Exact scan returned ${finalResults.rows.length} rows`);
      } catch (exactError) {
        console.warn(`[RAG] Exact scan failed:`, exactError);
        finalResults = results; // Use original results
      }
    }
    
    // Select first, then generate missing maps for the returned neighbors
    // Do not drop results because maps are missing - fill after selection
    const similarChartsWithMaps = await Promise.all(
      finalResults.rows.map(async (row: any) => {
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
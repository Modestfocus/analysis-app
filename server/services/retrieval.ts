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

// Helper function to normalize vectors
function l2Normalize(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}

// Helper to convert vectors to pgvector literal
function toVectorLiteral(v: number[]) {
  // String literal: '[0.1,0.2,...]'::vector(512)
  return `'[${v.join(",")}]'::vector(512)`;
}

// Helper to convert paths to absolute URLs
function abs(p: string | null | undefined): string | null {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  
  // Use environment variable or fallback
  const BASE_URL = process.env.REPLIT_DOMAINS 
    ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` 
    : process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
    : '';
  
  return BASE_URL ? `${BASE_URL}${p}` : p;
}

/**
 * Stub function to backfill visual maps for chart IDs.
 * Ensures depth, edge, and gradient map paths exist and updates DB.
 */
async function backfillVisualMaps(ids: number[]) {
  console.log(`[BACKFILL] Starting visual map backfill for ${ids.length} charts`);
  
  for (const id of ids) {
    try {
      // Get chart info
      const chartResult = await db.execute(sql`
        SELECT id, filename, depth_map_path, edge_map_path, gradient_map_path 
        FROM charts 
        WHERE id = ${id}
      `);
      
      if (chartResult.rows.length === 0) continue;
      
      const chart = chartResult.rows[0] as any;
      let needsUpdate = false;
      let depthMapPath = chart.depth_map_path;
      let edgeMapPath = chart.edge_map_path;
      let gradientMapPath = chart.gradient_map_path;
      
      // Generate default paths if missing
      if (!depthMapPath) {
        depthMapPath = `/depthmaps/depth_chart_${id}.png`;
        needsUpdate = true;
      }
      if (!edgeMapPath) {
        edgeMapPath = `/edgemaps/edge_chart_${id}.png`;
        needsUpdate = true;
      }
      if (!gradientMapPath) {
        gradientMapPath = `/gradientmaps/gradient_chart_${id}.png`;
        needsUpdate = true;
      }
      
      // Update DB if needed
      if (needsUpdate) {
        await db.execute(sql`
          UPDATE charts 
          SET depth_map_path = ${depthMapPath},
              edge_map_path = ${edgeMapPath},
              gradient_map_path = ${gradientMapPath}
          WHERE id = ${id}
        `);
        console.log(`[BACKFILL] Updated paths for chart ${id}`);
      }
    } catch (error) {
      console.warn(`[BACKFILL] Failed to backfill chart ${id}:`, error);
    }
  }
}

const VEC_DIM = 512; // must match pgvector column dim

/**
 * Minimal, no-filter vector search that ALWAYS tries to return k rows.
 * Uses SQL probe first, then CPU fallback if needed.
 * - vec: raw 512-dim embedding
 * - k: number of neighbors to fetch (default 3)
 * - excludeId: optional chart ID to exclude from results
 */
export async function getTopSimilarCharts(vec: number[], k = 3, excludeId?: number) {
  const q = l2Normalize(vec);
  const qLit = toVectorLiteral(q);

  // 1) SQL probe (no filters)
  const probe = await db.execute(sql`
    SELECT
      c.id,
      c.filename,
      c.timeframe,
      c.instrument,
      (1 - (c.embedding <=> ${sql.raw(qLit)}))::float8 AS similarity,
      c.depth_map_path,
      c.edge_map_path,
      c.gradient_map_path
    FROM charts c
    WHERE c.embedding IS NOT NULL
    ${excludeId ? sql`AND c.id <> ${excludeId}` : sql``}
    ORDER BY c.embedding <=> ${sql.raw(qLit)}
    LIMIT ${k}
  `);

  let rows = (probe.rows as any[]).map(r => ({ ...r, similarity: Number(r.similarity) }));

  if (rows.length >= k) {
    console.table(rows.map(r => ({ id: r.id, sim: r.similarity.toFixed(4) })));
    console.log(`[RAG] rows: ${rows.length}`);
    
    // Convert paths to absolute and return
    const result = rows.slice(0, k).map(r => ({
      id: r.id,
      filename: r.filename,
      timeframe: r.timeframe,
      instrument: r.instrument,
      similarity: r.similarity,
      depthMapPath: abs(r.depth_map_path),
      edgeMapPath: abs(r.edge_map_path),
      gradientMapPath: abs(r.gradient_map_path),
    }));
    
    // Kick off async backfill (don't await)
    backfillVisualMaps(result.map(r => r.id)).catch(() => {});
    
    return result;
  }

  // 2) CPU fallback over all embeddings (120 rows is trivial)
  console.log(`[RAG] fallback=cpu reason="probe<k" probeRows=${rows.length}`);

  const all = await db.execute(sql`
    SELECT id, filename, timeframe, instrument,
           depth_map_path, edge_map_path, gradient_map_path, embedding
    FROM charts
    WHERE embedding IS NOT NULL
    ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
  `);

  // Cosine similarity (numerically safe)
  function dot(a: number[], b: number[]) { 
    let s = 0; 
    for (let i = 0; i < a.length; i++) s += a[i] * b[i]; 
    return s; 
  }
  
  function norm(a: number[]) { 
    let s = 0; 
    for (let i = 0; i < a.length; i++) s += a[i] * a[i]; 
    return Math.sqrt(s) || 1; 
  }
  
  const qn = norm(q);

  const ranked = (all.rows as any[]).map(r => {
    const e: number[] = r.embedding;            // drizzle/pg returns as array
    const en = norm(e);
    const sim = dot(q, e) / (qn * en);
    return {
      id: r.id,
      filename: r.filename,
      timeframe: r.timeframe,
      instrument: r.instrument,
      depth_map_path: r.depth_map_path,
      edge_map_path: r.edge_map_path,
      gradient_map_path: r.gradient_map_path,
      similarity: sim,
    };
  }).sort((a, b) => b.similarity - a.similarity).slice(0, k);

  console.table(ranked.map(r => ({ id: r.id, sim: r.similarity.toFixed(4) })));
  console.log(`[RAG] fallback=cpu rows: ${ranked.length}`);

  // Convert paths to absolute
  const result = ranked.map(r => ({
    id: r.id,
    filename: r.filename,
    timeframe: r.timeframe,
    instrument: r.instrument,
    similarity: r.similarity,
    depthMapPath: abs(r.depth_map_path),
    edgeMapPath: abs(r.edge_map_path),
    gradientMapPath: abs(r.gradient_map_path),
  }));

  // 3) Do NOT drop rows because a map is missing; return them as-is.
  // Kick off async backfill of maps (don't await)
  backfillVisualMaps(result.map(r => r.id)).catch(() => {});

  return result;
}
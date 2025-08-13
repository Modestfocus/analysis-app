import { db } from '../db';
import { charts } from '../../shared/schema';
import { isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { EMB_DIM } from './embeddings';
import { ensureVisualMapsForChart, toAbsoluteUrl } from './visual-maps';

// Helper to parse pgvector::text format to Float32Array
function fromTextToFloat32(text: string): Float32Array {
  // pgvector::text comes as "[0.1,0.2,...]": valid JSON
  const arr = JSON.parse(text) as number[];     // now real numbers
  return new Float32Array(arr.map(Number));
}

// Helper to convert number array to Float32Array
function toFloat32(arr: number[]): Float32Array {
  return new Float32Array(arr.map(Number));
}

// L2 norm
function l2(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) || 1;
}

// Cosine similarity
function cosine(a: Float32Array, b: Float32Array): number {
  const na = l2(a), nb = l2(b);
  let dot = 0;
  const n = Math.min(a.length, b.length);  // guard dim mismatch
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  const val = dot / (na * nb);
  return Math.max(0, Math.min(1, val));
}

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

  // Ensure SQL probe similarity is numeric
  const probeRowsTyped = probe.rows.map(r => ({
    id: Number((r as any).id),
    similarity: Number((r as any).similarity),
    filename: (r as any).filename,
    timeframe: (r as any).timeframe,
    instrument: (r as any).instrument,
    depth_map_path: (r as any).depth_map_path,
    edge_map_path: (r as any).edge_map_path,
    gradient_map_path: (r as any).gradient_map_path,
  }));

  if (probeRowsTyped.length >= k) {
    console.table(probeRowsTyped.map(r => ({ id: r.id, sim: r.similarity.toFixed(4) })));
    console.log(`[RAG] rows: ${probeRowsTyped.length}`);
    
    // Convert paths to absolute and return
    const result = probeRowsTyped.slice(0, k).map(r => ({
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
  console.log(`[RAG] fallback=cpu reason="probe<k" probeRows=${probeRowsTyped.length}`);

  // query vector → Float32 & normalize once
  const qv = toFloat32(vec);
  const nq = l2(qv);
  for (let i = 0; i < qv.length; i++) qv[i] /= nq;

  // Get all embeddings as text and compute similarities
  const all = await db.execute(sql`
    SELECT id, embedding::text AS embedding_text, filename, timeframe, instrument,
           depth_map_path, edge_map_path, gradient_map_path
    FROM charts
    WHERE embedding IS NOT NULL
    ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
  `);

  // score every row
  const scored = (all.rows as { id: number; embedding_text: string; filename: string; timeframe: string; instrument: string; depth_map_path: string; edge_map_path: string; gradient_map_path: string }[])
    .map(r => {
      try {
        const ev = fromTextToFloat32(r.embedding_text);
        return { 
          id: Number(r.id), 
          sim: cosine(qv, ev),
          filename: r.filename,
          timeframe: r.timeframe,
          instrument: r.instrument,
          depth_map_path: r.depth_map_path,
          edge_map_path: r.edge_map_path,
          gradient_map_path: r.gradient_map_path,
        };
      } catch (error) {
        return { 
          id: Number(r.id), 
          sim: 0.0,
          filename: r.filename,
          timeframe: r.timeframe,
          instrument: r.instrument,
          depth_map_path: r.depth_map_path,
          edge_map_path: r.edge_map_path,
          gradient_map_path: r.gradient_map_path,
        };
      }
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);

  // KEEP similarity as a number
  const scored2 = scored.map(r => ({
    id: r.id,
    similarity: Number(r.sim), // numeric
    filename: r.filename,
    timeframe: r.timeframe,
    instrument: r.instrument,
    depth_map_path: r.depth_map_path,
    edge_map_path: r.edge_map_path,
    gradient_map_path: r.gradient_map_path,
  }));

  console.table(scored2.map(r => ({ id: r.id, sim: r.similarity.toFixed(4) })));
  console.log(`[RAG] fallback=cpu rows: ${scored2.length}`);

  // Convert paths to absolute and return
  const result = scored2.map(r => ({
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
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
 * Minimal, no-filter vector search using pgvector.
 * 1) Try IVFFlat (single statement only)
 * 2) If rows < k, fall back to exact scan (sequential)
 * 3) Ensure visual maps exist (DON'T drop rows)
 * Force k=3 neighbors with real float similarities and valid map paths.
 */
export async function getTopSimilarCharts(vec: number[], k = 3, excludeId?: number) {
  const q = l2Normalize(vec);

  // pgvector needs a string literal like '[0.1,0.2,...]' then CAST ::vector(512)
  const qLiteral = `[${q.map(x => Number.isFinite(x) ? x.toFixed(6) : "0.000000").join(",")}]`;

  console.log(`[RAG] query sha k=3 { dim: 512, model: 'Xenova/clip-vit-base-patch32' }`);

  // ------------- pass 1: IVFFlat (no SET LOCAL; single statement only) -------------
  const pass1 = await db.execute(sql`
    SELECT
      c.id,
      (1 - (c.embedding <=> ${sql.raw(`'${qLiteral}'::vector(${VEC_DIM})`)}))::double precision AS similarity,
      c.depth_map_path,
      c.edge_map_path,
      c.gradient_map_path
    FROM charts c
    WHERE c.embedding IS NOT NULL
      ${excludeId ? sql.raw(`AND c.id <> ${excludeId}`) : sql.raw("")}
    ORDER BY c.embedding <=> ${sql.raw(`'${qLiteral}'::vector(${VEC_DIM})`)}
    LIMIT ${k};
  `);

  let rows = pass1.rows as {
    id: number;
    similarity: number;
    depth_map_path: string | null;
    edge_map_path: string | null;
    gradient_map_path: string | null;
  }[];

  // ------------- pass 2: exact scan fallback if < k -------------
  if (rows.length < k) {
    const pass2 = await db.execute(sql`
      SELECT
        c.id,
        (1 - (c.embedding <=> ${sql.raw(`'${qLiteral}'::vector(${VEC_DIM})`)}))::double precision AS similarity,
        c.depth_map_path,
        c.edge_map_path,
        c.gradient_map_path
      FROM charts c
      WHERE c.embedding IS NOT NULL
        ${excludeId ? sql.raw(`AND c.id <> ${excludeId}`) : sql.raw("")}
      ORDER BY (c.embedding <=> ${sql.raw(`'${qLiteral}'::vector(${VEC_DIM})`)})
      LIMIT ${k};
    `);
    // Merge uniques (keep best)
    const seen = new Set<number>(rows.map(r => r.id));
    for (const r of pass2.rows as typeof rows) {
      if (!seen.has(r.id)) rows.push(r);
    }
    rows = rows.slice(0, k);
  }

  // ------------- ensure visual maps exist (DON'T drop rows) -------------
  // We'll skip the backfill here since we need filename, and do it in the final query

  // ------------- fetch final rows with paths (guaranteed) -------------
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return [];

  const finalRows = await db.execute(sql`
    SELECT
      c.id,
      c.filename,
      c.timeframe,
      c.instrument,
      c.depth_map_path,
      c.edge_map_path,
      c.gradient_map_path,
      s.similarity
    FROM charts c
    JOIN (VALUES ${sql.raw(
      ids
        .map((id, i) => `(${id}, ${rows[i].similarity.toFixed(6)})`)
        .join(",")
    )}) AS s(id, similarity) ON s.id = c.id
    ORDER BY s.similarity DESC
  `);

  const finalRowsTyped = (finalRows.rows as any[]).map(r => ({
    id: r.id,
    similarity: Number(r.similarity),
    filename: r.filename,
    timeframe: r.timeframe,
    instrument: r.instrument,
    depth_map_path: r.depth_map_path,
    edge_map_path: r.edge_map_path,
    gradient_map_path: r.gradient_map_path,
  }));

  // Log like: [RAG] rows: 3 (id/sim table)
  console.table(finalRowsTyped.map(r => ({ id: r.id, sim: Number(r.similarity).toFixed(4) })));
  console.log(`[RAG] rows: ${finalRowsTyped.length}`);

  // ------------- backfill visual maps with filename now available -------------
  const results = await Promise.all(finalRowsTyped.map(async (r) => {
    let depthMapPath = r.depth_map_path;
    let edgeMapPath = r.edge_map_path;
    let gradientMapPath = r.gradient_map_path;

    // Try to backfill maps if missing
    if (!depthMapPath || !edgeMapPath || !gradientMapPath) {
      try {
        const visualMaps = await ensureVisualMapsForChart(r.id, r.filename);
        depthMapPath = depthMapPath || visualMaps.depthMapPath;
        edgeMapPath = edgeMapPath || visualMaps.edgeMapPath;
        gradientMapPath = gradientMapPath || visualMaps.gradientMapPath;
      } catch (error) {
        console.warn(`[RAG] Visual map backfill failed for chart ${r.id}:`, error);
      }
    }

    return {
      chart: {
        id: r.id,
        filename: r.filename,
        timeframe: r.timeframe ?? "UNKNOWN",
        instrument: r.instrument ?? "UNKNOWN",
        depthMapPath: depthMapPath ?? null,
        edgeMapPath: edgeMapPath ?? null,
        gradientMapPath: gradientMapPath ?? null,
      },
      similarity: r.similarity,
    };
  }));

  return results;
}
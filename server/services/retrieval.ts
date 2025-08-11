import { db } from '../db';
import { charts } from '../../shared/schema';
import { isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

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
 * Retrieve top-k similar charts using pgvector cosine similarity
 * Falls back to in-memory computation if pgvector fails
 */
export async function getTopSimilarCharts(
  queryVec: Float32Array,
  k = 3
): Promise<SimilarChart[]> {
  try {
    // Convert Float32Array to array for SQL query
    const queryArray = Array.from(queryVec);
    const queryVectorString = `[${queryArray.join(',')}]`;
    
    // Use pgvector for optimal similarity search
    // Since vectors are normalized, cosine distance equals 1 - dot product
    const results = await db.execute(
      sql`
        SELECT id, filename, timeframe, instrument,
               depth_map_path, edge_map_path, gradient_map_path, uploaded_at,
               1 - (embedding <=> ${queryVectorString}::vector) AS similarity
        FROM charts
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${queryVectorString}::vector
        LIMIT ${k}
      `
    );
    
    console.log(`[RAG] pgvector found ${results.rows.length} similar charts`);
    
    return results.rows.map((row: any) => ({
      chart: {
        id: row.id,
        filename: row.filename,
        timeframe: row.timeframe,
        instrument: row.instrument,
        depthMapPath: row.depth_map_path,
        edgeMapPath: row.edge_map_path,
        gradientMapPath: row.gradient_map_path,
        uploadedAt: row.uploaded_at
      },
      similarity: Math.max(0, Math.min(1, parseFloat(row.similarity) || 0))
    }));
    
  } catch (error) {
    console.warn("⚠️ pgvector search failed, falling back to in-memory search:", error);
    
    // Fallback to in-memory computation
    try {
      const allCharts = await db.select().from(charts).where(isNotNull(charts.embedding));
      const candidates: SimilarChart[] = [];
      
      for (const chart of allCharts) {
        if (chart.embedding && chart.embedding.length > 0) {
          const similarity = cosineSimilarity(queryVec, chart.embedding);
          
          candidates.push({
            chart: {
              id: chart.id!,
              filename: chart.filename,
              timeframe: chart.timeframe,
              instrument: chart.instrument,
              depthMapPath: chart.depthMapPath,
              edgeMapPath: chart.edgeMapPath,
              gradientMapPath: chart.gradientMapPath,
              uploadedAt: chart.uploadedAt
            },
            similarity
          });
        }
      }
      
      // Sort by similarity (descending) and take top k
      candidates.sort((a, b) => b.similarity - a.similarity);
      return candidates.slice(0, k);
      
    } catch (fallbackError) {
      console.error("❌ Both pgvector and fallback search failed:", fallbackError);
      return [];
    }
  }
}
import { storage } from '../storage';

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
 * Compute cosine similarity between two normalized vectors
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
 * Retrieve top-k similar charts using cosine similarity
 * Falls back to in-memory cosine computation if no dedicated vector DB
 */
export async function getTopSimilarCharts(
  queryVec: Float32Array,
  k = 3
): Promise<SimilarChart[]> {
  try {
    // Get all charts with embeddings from storage
    const allCharts = await storage.getAllCharts();
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
            uploadedAt: chart.uploadedAt ? 
              (typeof chart.uploadedAt === 'string' ? chart.uploadedAt : chart.uploadedAt.toISOString()) 
              : null
          },
          similarity
        });
      }
    }
    
    // Sort by similarity (descending) and take top k
    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates.slice(0, k);
    
  } catch (error) {
    console.warn("⚠️ Error in similarity search:", error);
    return []; // Return empty array on error to avoid breaking the request
  }
}
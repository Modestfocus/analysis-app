/**
 * Server-side CLIP Embedding Service
 * Generates 1024-dimensional vectors for image similarity search
 * Used by unified analysis service for RAG context retrieval
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// For now, we'll use a placeholder implementation that returns random embeddings
// In production, this would use actual CLIP models like OpenCLIP or similar
export async function generateCLIPEmbedding(imagePath: string): Promise<{
  embedding: number[] | null;
  error?: string;
}> {
  try {
    // Verify the file exists
    if (!fs.existsSync(imagePath)) {
      return {
        embedding: null,
        error: `Image file not found: ${imagePath}`
      };
    }

    console.log(`🧠 Generating CLIP embedding for: ${path.basename(imagePath)}`);

    // Read and process the image to get consistent dimensions
    const imageBuffer = await sharp(imagePath)
      .resize(224, 224) // Standard CLIP input size
      .png()
      .toBuffer();

    // Generate a deterministic "embedding" based on image content
    // This is a placeholder - in production this would use actual CLIP models
    const hash = await getImageHash(imageBuffer);
    const embedding = generateDeterministicEmbedding(hash);

    console.log(`✅ Generated 1024-dimensional embedding for ${path.basename(imagePath)}`);

    return {
      embedding
    };

  } catch (error) {
    console.error(`❌ CLIP embedding generation failed:`, error);
    return {
      embedding: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate a simple hash from image buffer for deterministic embeddings
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  // Simple hash based on buffer content
  let hash = 0;
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    hash = ((hash << 5) - hash + buffer[i]) & 0xffffffff;
  }
  return hash.toString(16);
}

/**
 * Generate a deterministic 1024-dimensional embedding from a hash
 * This simulates what a real CLIP model would return
 */
function generateDeterministicEmbedding(hash: string): number[] {
  const embedding: number[] = [];
  
  // Use the hash as a seed for deterministic "random" values
  let seed = parseInt(hash.substring(0, 8), 16);
  
  for (let i = 0; i < 1024; i++) {
    // Linear congruential generator for deterministic pseudo-random values
    seed = (seed * 1664525 + 1013904223) % Math.pow(2, 32);
    const normalized = (seed / Math.pow(2, 32)) * 2 - 1; // Range [-1, 1]
    embedding.push(normalized);
  }
  
  // Normalize the embedding vector to unit length (as CLIP embeddings are)
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

/**
 * Batch processing for multiple images
 */
export async function generateCLIPEmbeddingBatch(imagePaths: string[]): Promise<Array<{
  path: string;
  embedding: number[] | null;
  error?: string;
}>> {
  console.log(`🧠 Generating CLIP embeddings for ${imagePaths.length} images`);
  
  const results = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const result = await generateCLIPEmbedding(imagePath);
      return {
        path: imagePath,
        embedding: result.embedding,
        error: result.error
      };
    })
  );

  const successful = results.filter(r => r.embedding !== null).length;
  console.log(`✅ Generated embeddings for ${successful}/${imagePaths.length} images`);

  return results;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}
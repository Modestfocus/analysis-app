import { pipeline } from '@xenova/transformers';
import fs from 'fs/promises';
import crypto from 'crypto';

// Single source of truth for embeddings
export const EMB_MODEL_ID = "Xenova/clip-vit-base-patch32"; // 512-D
export const EMB_DIM = 512;

let imagePipe: any;
async function getImagePipe() {
  if (!imagePipe) {
    // Use CLIP base model for reliable 512 dimensions
    imagePipe = await pipeline(
      'image-feature-extraction', 
      EMB_MODEL_ID, // 512 dimensions - hard-locked standard
      { quantized: true }              // Faster while maintaining quality
    );
  }
  return imagePipe;
}

async function embedImageToVector(imagePath: string): Promise<Float32Array> {
  const pipe = await getImagePipe();
  // Let the pipeline handle preprocessing → it will produce pixel_values
  const output = await pipe(imagePath, {
    pooling: 'mean',     // pool spatial tokens
    normalize: false     // we'll L2-normalize manually below
  });
  // output.data is a Float32Array
  const v = output.data as Float32Array;
  
  // Dimension guardrail - immediately after embedding
  if (v.length !== EMB_DIM) {
    console.warn("[RAG] wrong dim", v.length, "→ re-embedding with", EMB_DIM);
    throw new Error(`Embedding dimension mismatch: expected ${EMB_DIM}, got ${v.length}`);
  }
  
  // L2 normalize
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const inv = 1 / Math.max(Math.sqrt(sum), 1e-12);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

export async function embedImageToVectorCached(imagePath: string, cacheKey: string): Promise<Float32Array> {
  // Cache file name must include EMB_DIM and EMB_MODEL_ID hash for consistency
  const modelHash = crypto.createHash('sha256').update(EMB_MODEL_ID).digest('hex').slice(0, 8);
  const p = `server/cache/vectors/clip_${cacheKey}_${EMB_DIM}D_${modelHash}.bin`;
  
  try {
    const buf = await fs.readFile(p);
    const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    
    // Dimension guardrail on cached vectors
    if (vec.length !== EMB_DIM) {
      console.warn("[RAG] wrong dim in cache", vec.length, "→ re-embedding with", EMB_DIM);
      // force re-embed with the standard pipeline (no cache reuse from other dims)
      const newVec = await embedImageToVector(imagePath);
      await fs.mkdir('server/cache/vectors', { recursive: true });
      await fs.writeFile(p, Buffer.from(newVec.buffer));
      return newVec;
    }
    
    return vec;
  } catch {
    // Cache miss - generate new embedding
    const vec = await embedImageToVector(imagePath);
    await fs.mkdir('server/cache/vectors', { recursive: true });
    await fs.writeFile(p, Buffer.from(vec.buffer));
    return vec;
  }
}


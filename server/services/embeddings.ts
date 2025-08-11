import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Single, lazily-initialized CLIP pipeline instance
let clipPipe: any;

async function getClipPipe() {
  if (!clipPipe) {
    // Use CLIP ViT-Large for high-quality embeddings
    clipPipe = await pipeline('feature-extraction', 'Xenova/clip-vit-large-patch14');
  }
  return clipPipe;
}

// Ensure cache directory exists
async function ensureCacheDir() {
  const cacheDir = path.join(process.cwd(), 'server', 'cache', 'vectors');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

// L2 normalize vector
function normalizeVector(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  
  const normalized = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    normalized[i] = vec[i] / norm;
  }
  return normalized;
}

/**
 * Generate or retrieve cached CLIP embedding for an image
 * Uses SHA-256 hash for caching to avoid recomputation
 */
export async function embedImageToVector(imagePath: string): Promise<Float32Array> {
  // Compute hash for caching (same approach as visual maps)
  const buf = await fs.promises.readFile(imagePath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  
  const cacheDir = await ensureCacheDir();
  const cachePath = path.join(cacheDir, `clip_${sha}.bin`);
  
  // Check if cached vector exists
  if (fs.existsSync(cachePath)) {
    if (process.env.NODE_ENV === 'development') {
      console.log("[CLIP] Reusing cached vector", { sha, imagePath });
    }
    
    // Read cached vector
    const buffer = fs.readFileSync(cachePath);
    return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log("[CLIP] Computing new embedding", { sha, imagePath });
  }
  
  // Generate new embedding
  const pipe = await getClipPipe();
  const result = await pipe(imagePath);
  
  // Extract and normalize the embedding
  let embedding: Float32Array;
  if (result.data) {
    embedding = new Float32Array(result.data);
  } else if (Array.isArray(result)) {
    embedding = new Float32Array(result);
  } else {
    embedding = new Float32Array(result);
  }
  
  const normalized = normalizeVector(embedding);
  
  // Cache the normalized vector
  const buffer = Buffer.from(normalized.buffer);
  fs.writeFileSync(cachePath, buffer);
  
  if (process.env.NODE_ENV === 'development') {
    console.log("[CLIP] Cached embedding", { sha, dimensions: normalized.length });
  }
  
  return normalized;
}
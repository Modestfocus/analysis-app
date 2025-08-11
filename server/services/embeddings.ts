import { pipeline } from '@xenova/transformers';
import fs from 'fs/promises';
import crypto from 'crypto';

let imagePipe: any;
async function getImagePipe() {
  if (!imagePipe) {
    // Use CLIP base model for reliable 768 dimensions
    imagePipe = await pipeline(
      'image-feature-extraction', 
      'Xenova/clip-vit-base-patch32', // 768 dimensions - reliable and tested
      { quantized: true }              // Faster while maintaining quality
    );
  }
  return imagePipe;
}

export async function embedImageToVector(imagePath: string): Promise<Float32Array> {
  const pipe = await getImagePipe();
  // Let the pipeline handle preprocessing → it will produce pixel_values
  const output = await pipe(imagePath, {
    pooling: 'mean',     // pool spatial tokens
    normalize: false     // we'll L2-normalize manually below
  });
  // output.data is a Float32Array
  const v = output.data as Float32Array;
  
  // Assert correct dimensions for Transformers.js CLIP model
  console.assert(v.length === 512, `bad dim: expected 512, got ${v.length}`);
  
  // L2 normalize
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const inv = 1 / Math.max(Math.sqrt(sum), 1e-12);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

export async function embedImageToVectorCached(imagePath: string, sha: string) {
  const p = `server/cache/vectors/clip_${sha}.bin`;
  try {
    const buf = await fs.readFile(p);
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch {}
  const vec = await embedImageToVector(imagePath);
  await fs.mkdir('server/cache/vectors', { recursive: true });
  await fs.writeFile(p, Buffer.from(vec.buffer));
  return vec;
}


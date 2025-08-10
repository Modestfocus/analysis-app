import { pipeline } from '@xenova/transformers';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

// Single, lazily-initialized pipeline instance
let depthPipe: any;
async function getDepthPipe() {
  if (!depthPipe) {
    // DPT-Hybrid MiDaS (good accuracy/speed balance)
    depthPipe = await pipeline('depth-estimation', 'Xenova/dpt-hybrid-midas');
  }
  return depthPipe;
}

// Ensure directory exists
async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function generateDepthMap(
  originalPath: string,
  outDir: string,
  outFilename: string // e.g., "chart_58_depth.png"
): Promise<string> {
  await ensureDir(outDir);
  const outPath = path.join(outDir, outFilename);

  // If already exists, reuse
  try {
    await fs.access(outPath);
    if (process.env.NODE_ENV === 'development') {
      console.log("[DEPTH] Reusing existing depth map", { originalPath, depthMapPath: outPath });
    }
    return outPath;
  } catch {}

  if (process.env.NODE_ENV === 'development') {
    console.log("[DEPTH] Generating new depth map with MiDaS", { originalPath, outPath });
  }

  // Run MiDaS
  const pipe = await getDepthPipe();
  const result = await pipe(originalPath);
  // result.depth is Float32Array/TypedArray with shape [H, W]
  const { data, width, height } = result.depth;

  // Normalize to 8-bit grayscale (0..255)
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1e-6, max - min);
  const u8 = Buffer.allocUnsafe(width * height);
  for (let i = 0; i < data.length; i++) {
    const norm = (data[i] - min) / range;
    u8[i] = Math.round(norm * 255);
  }

  // Save as PNG
  await sharp(u8, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(outPath);

  if (process.env.NODE_ENV === 'development') {
    console.log("[DEPTH] MiDaS generated", { originalPath, depthMapPath: outPath });
  }

  return outPath;
}
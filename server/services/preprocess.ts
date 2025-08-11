import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { storage } from '../storage';
import { generateDepthMap } from './depth';

interface VisualMapsResult {
  originalPath: string;
  depthMapPath?: string;      // or structureMapPath if not true depth
  edgeMapPath: string;
  gradientMapPath: string;
}

// Helper function to check if file exists
const exists = (p: string): Promise<boolean> => 
  fs.promises.access(p).then(() => true).catch(() => false);

/**
 * Ensures visual maps (depth/structure, edge, gradient) exist for a chart.
 * Non-destructive: originals are never modified, maps are stored alongside.
 * Uses hash-based caching to reuse identical image processing.
 */
export async function ensureVisualMaps(chartIdOrPath: string): Promise<VisualMapsResult> {
  let chartId: number;
  let originalPath: string;
  
  // Determine if input is a chart ID or file path
  if (typeof chartIdOrPath === 'string' && chartIdOrPath.includes('/')) {
    // It's a file path - we need to find or create a chart record
    originalPath = chartIdOrPath;
    
    // For file paths, we'll need to work with a temporary chart ID
    // Since we can't reliably find charts by filename without more context
    chartId = Math.floor(Date.now() / 1000); // Use timestamp in seconds as temporary ID for file-based processing
  } else {
    // It's a chart ID
    chartId = parseInt(chartIdOrPath);
    const chart = await storage.getChart(chartId);
    if (!chart) {
      throw new Error(`Chart with ID ${chartId} not found`);
    }
    originalPath = chart.filename.startsWith('/') ? chart.filename.substring(1) : chart.filename;
  }

  // Compute hash for caching
  const buf = await fs.promises.readFile(originalPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16); // short id

  // Define hash-based output paths in /public/ directories for web accessibility
  const depthMapDir = path.join(process.cwd(), 'public', 'depthmaps');
  const edgeMapDir = path.join(process.cwd(), 'public', 'edgemaps');
  const gradientMapDir = path.join(process.cwd(), 'public', 'gradientmaps');
  
  // Ensure output directories exist
  [depthMapDir, edgeMapDir, gradientMapDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Hash-based file paths for caching
  const depthOut = path.join(depthMapDir, `chart_${sha}_depth.png`);
  const edgeOut = path.join(edgeMapDir, `chart_${sha}_edge.png`);
  const gradOut = path.join(gradientMapDir, `chart_${sha}_gradient.png`);

  // Check if hash-based cached files exist
  if (await exists(depthOut) && await exists(edgeOut) && await exists(gradOut)) {
    console.log("[PREPROCESS] Reusing maps by hash", { sha });
    return {
      originalPath,
      depthMapPath: `/depthmaps/chart_${sha}_depth.png`,
      edgeMapPath: `/edgemaps/chart_${sha}_edge.png`,
      gradientMapPath: `/gradientmaps/chart_${sha}_gradient.png`
    };
  }
  // Generate new maps using hash-based naming
  console.log("[PREPROCESS] Generating new maps", { sha, originalPath });
  
  try {
    // Load and convert to grayscale for processing
    const grayscaleBuffer = await sharp(originalPath)
      .greyscale()
      .png()
      .toBuffer();

    // Generate edge map using Laplacian-like edge detection
    await generateEdgeMap(grayscaleBuffer, edgeOut);

    // Generate gradient map using Sobel-like gradient detection
    await generateGradientMap(grayscaleBuffer, gradOut);

    // Generate true depth map using MiDaS (pass full output path)
    await generateDepthMap(originalPath, depthOut);

    if (process.env.NODE_ENV === 'development') {
      console.log("[PREPROCESS] maps", {
        originalPath,
        depthMapPath: `/depthmaps/chart_${sha}_depth.png`,
        edgeMapPath: `/edgemaps/chart_${sha}_edge.png`,
        gradientMapPath: `/gradientmaps/chart_${sha}_gradient.png`
      });
    }

    return {
      originalPath,
      depthMapPath: `/depthmaps/chart_${sha}_depth.png`,
      edgeMapPath: `/edgemaps/chart_${sha}_edge.png`,
      gradientMapPath: `/gradientmaps/chart_${sha}_gradient.png`
    };

  } catch (error) {
    console.error(`❌ Error generating visual maps for hash ${sha}:`, error);
    throw error;
  }
}

/**
 * Generate edge map using Laplacian-style edge detection
 */
async function generateEdgeMap(grayscaleBuffer: Buffer, outputPath: string): Promise<void> {
  // Simple edge detection using Sharp's built-in convolution
  await sharp(grayscaleBuffer)
    .convolve({
      width: 3,
      height: 3,
      kernel: [
        -1, -1, -1,
        -1,  8, -1,
        -1, -1, -1
      ]
    })
    .normalise()
    .png()
    .toFile(outputPath);
}

/**
 * Generate gradient map using Sobel-style gradient detection
 */
async function generateGradientMap(grayscaleBuffer: Buffer, outputPath: string): Promise<void> {
  // Sobel X kernel for horizontal gradients
  await sharp(grayscaleBuffer)
    .convolve({
      width: 3,
      height: 3,
      kernel: [
        -1,  0,  1,
        -2,  0,  2,
        -1,  0,  1
      ]
    })
    .normalise()
    .png()
    .toFile(outputPath);
}


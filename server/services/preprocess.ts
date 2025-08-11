import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { storage } from '../storage';
import { generateDepthMap } from './depth';

interface VisualMapsResult {
  originalPath: string;
  depthMapPath?: string;      // or structureMapPath if not true depth
  edgeMapPath: string;
  gradientMapPath: string;
}

/**
 * Ensures visual maps (depth/structure, edge, gradient) exist for a chart.
 * Non-destructive: originals are never modified, maps are stored alongside.
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

  // Check if maps already exist in DB
  const existingChart = await storage.getChart(chartId);
  if (existingChart?.depthMapPath && existingChart?.edgeMapPath && existingChart?.gradientMapPath) {
    // Verify files still exist on disk
    const depthExists = fs.existsSync(existingChart.depthMapPath);
    const edgeExists = fs.existsSync(existingChart.edgeMapPath);
    const gradientExists = fs.existsSync(existingChart.gradientMapPath);
    
    if (depthExists && edgeExists && gradientExists) {
      if (process.env.NODE_ENV === 'development') {
        console.log("[PREPROCESS] maps", {
          originalPath,
          depthMapPath: existingChart.depthMapPath,
          edgeMapPath: existingChart.edgeMapPath,
          gradientMapPath: existingChart.gradientMapPath
        });
      }
      
      return {
        originalPath,
        depthMapPath: existingChart.depthMapPath,
        edgeMapPath: existingChart.edgeMapPath,
        gradientMapPath: existingChart.gradientMapPath
      };
    }
  }

  // Ensure output directories exist
  const edgeMapDir = 'server/uploads/edgemaps';
  const gradientMapDir = 'server/uploads/gradientmaps';
  const depthMapDir = path.join(process.cwd(), 'public', 'depthmaps');
  
  [edgeMapDir, gradientMapDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Generate file paths
  const edgeMapPath = `${edgeMapDir}/chart_${chartId}_edge.png`;
  const gradientMapPath = `${gradientMapDir}/chart_${chartId}_gradient.png`;
  const depthFilename = `chart_${chartId}_depth.png`;

  try {
    // Load and convert to grayscale for processing
    const grayscaleBuffer = await sharp(originalPath)
      .greyscale()
      .png()
      .toBuffer();

    // Generate edge map using Laplacian-like edge detection
    await generateEdgeMap(grayscaleBuffer, edgeMapPath);

    // Generate gradient map using Sobel-like gradient detection
    await generateGradientMap(grayscaleBuffer, gradientMapPath);

    // Generate true depth map using MiDaS
    const depthMapPath = await generateDepthMap(originalPath, depthMapDir, depthFilename);

    // Update database with new map paths
    await storage.updateChart(chartId, {
      depthMapPath,
      edgeMapPath,
      gradientMapPath
    });

    if (process.env.NODE_ENV === 'development') {
      console.log("[PREPROCESS] maps", {
        originalPath,
        depthMapPath,
        edgeMapPath,
        gradientMapPath
      });
    }

    return {
      originalPath,
      depthMapPath,
      edgeMapPath,
      gradientMapPath
    };

  } catch (error) {
    console.error(`❌ Error generating visual maps for chart ${chartId}:`, error);
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


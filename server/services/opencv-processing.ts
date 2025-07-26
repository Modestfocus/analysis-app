import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

interface ProcessingResult {
  success: boolean;
  edgeMapPath?: string;
  gradientMapPath?: string;
  error?: string;
}

/**
 * Process a chart image to generate edge map and gradient map using Sharp
 * This creates two analysis maps while preserving the original image
 */
export async function processChartImage(
  inputImagePath: string,
  chartId: number
): Promise<ProcessingResult> {
  try {
    // Ensure input file exists
    await fs.access(inputImagePath);
    
    const edgeMapsDir = path.join(process.cwd(), "server", "edgemaps");
    const gradientMapsDir = path.join(process.cwd(), "server", "gradientmaps");
    
    // Ensure output directories exist
    await fs.mkdir(edgeMapsDir, { recursive: true });
    await fs.mkdir(gradientMapsDir, { recursive: true });
    
    const edgeMapFilename = `chart_${chartId}_edge.png`;
    const gradientMapFilename = `chart_${chartId}_gradient.png`;
    const edgeMapPath = path.join(edgeMapsDir, edgeMapFilename);
    const gradientMapPath = path.join(gradientMapsDir, gradientMapFilename);
    
    // Read the original image
    const image = sharp(inputImagePath);
    const { width, height } = await image.metadata();
    
    if (!width || !height) {
      throw new Error("Could not get image dimensions");
    }
    
    // Convert to grayscale for processing
    const grayBuffer = await image
      .greyscale()
      .raw()
      .toBuffer();
    
    // Create edge map using Sobel edge detection
    const edgeBuffer = Buffer.alloc(width * height);
    const gradientBuffer = Buffer.alloc(width * height);
    
    // Sobel kernels for edge detection
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    // Apply Sobel operators for edge and gradient detection
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        // Apply Sobel kernels
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width) + (x + kx);
            const pixelValue = grayBuffer[pixelIndex];
            
            gx += pixelValue * sobelX[ky + 1][kx + 1];
            gy += pixelValue * sobelY[ky + 1][kx + 1];
          }
        }
        
        // Calculate gradient magnitude for both edge and gradient maps
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const outputIndex = y * width + x;
        
        // Edge map: apply threshold to create binary edges
        edgeBuffer[outputIndex] = magnitude > 50 ? 255 : 0;
        
        // Gradient map: preserve gradient magnitude (clamped to 0-255)
        gradientBuffer[outputIndex] = Math.min(255, Math.max(0, magnitude));
      }
    }
    
    // Save edge map
    await sharp(edgeBuffer, {
      raw: {
        width,
        height,
        channels: 1
      }
    })
    .png()
    .toFile(edgeMapPath);
    
    // Save gradient map with enhanced contrast
    await sharp(gradientBuffer, {
      raw: {
        width,
        height,
        channels: 1
      }
    })
    .normalise() // Enhance contrast
    .png()
    .toFile(gradientMapPath);
    
    return {
      success: true,
      edgeMapPath: `/edgemaps/${edgeMapFilename}`,
      gradientMapPath: `/gradientmaps/${gradientMapFilename}`
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Processing failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Batch process multiple charts for edge and gradient map generation
 */
export async function processChartsInBatch(
  charts: Array<{ id: number; filename: string }>
): Promise<Array<{ chartId: number; result: ProcessingResult }>> {
  const results = [];
  const uploadsDir = path.join(process.cwd(), "server", "uploads");
  
  console.log(`🎯 Starting batch processing of ${charts.length} charts for edge/gradient maps`);
  
  for (const chart of charts) {
    const inputPath = path.join(uploadsDir, chart.filename);
    console.log(`📊 Processing chart ${chart.id}: ${chart.filename}`);
    
    const result = await processChartImage(inputPath, chart.id);
    results.push({ chartId: chart.id, result });
    
    if (result.success) {
      console.log(`✅ Generated edge and gradient maps for chart ${chart.id}`);
    } else {
      console.error(`❌ Failed to process chart ${chart.id}: ${result.error}`);
    }
  }
  
  console.log(`🏁 Batch processing complete: ${results.filter(r => r.result.success).length}/${charts.length} successful`);
  return results;
}
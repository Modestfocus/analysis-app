import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { storage } from '../storage';

export interface VisualMapPaths {
  depthMapPath?: string | null;
  edgeMapPath?: string | null;
  gradientMapPath?: string | null;
}

/**
 * Ensure visual maps exist for a chart, generate on-the-fly if missing
 */
export async function ensureVisualMapsForChart(chartId: number, filename: string): Promise<VisualMapPaths> {
  console.log(`[VIS] Checking maps for chart ${chartId}`);
  
  // Get current chart data
  const chart = await storage.getChart(chartId);
  if (!chart) {
    console.warn(`[VIS] Chart ${chartId} not found`);
    return {};
  }

  const originalImagePath = path.join(process.cwd(), 'server', 'uploads', filename);
  
  // Check if original image exists
  if (!fs.existsSync(originalImagePath)) {
    console.warn(`[VIS] Original image not found: ${originalImagePath}`);
    return {};
  }

  let depthMapPath = chart.depthMapPath;
  let edgeMapPath = chart.edgeMapPath;
  let gradientMapPath = chart.gradientMapPath;
  let needsUpdate = false;

  // Check and generate depth map if missing
  if (!depthMapPath || !fs.existsSync(path.join(process.cwd(), 'public', depthMapPath))) {
    try {
      const depthFilename = `depth_chart_${chartId}_${Date.now()}.png`;
      const publicDepthPath = path.join('depthmaps', depthFilename);
      const fullPublicDepthPath = path.join(process.cwd(), 'public', publicDepthPath);
      
      // Ensure public/depthmaps directory exists
      await fs.promises.mkdir(path.dirname(fullPublicDepthPath), { recursive: true });
      
      // Generate depth map using blur fallback (similar to chat analysis)
      const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `temp_gray_${chartId}_${Date.now()}.png`);
      
      await sharp(originalImagePath)
        .grayscale()
        .png()
        .toFile(tempGrayscalePath);
      
      await sharp(tempGrayscalePath)
        .blur(3)
        .normalise()
        .png()
        .toFile(fullPublicDepthPath);
      
      // Clean up temp file
      await fs.promises.unlink(tempGrayscalePath).catch(() => {});
      
      depthMapPath = '/' + publicDepthPath;
      needsUpdate = true;
      console.log(`[VIS] backfill maps for chart ${chartId} → ${depthMapPath}`);
    } catch (error) {
      console.warn(`[VIS] Failed to generate depth map for chart ${chartId}:`, error);
    }
  } else {
    console.log(`[VIS] reuse maps for chart ${chartId}`);
  }

  // Check and generate edge map if missing
  if (!edgeMapPath || !fs.existsSync(path.join(process.cwd(), 'public', edgeMapPath))) {
    try {
      const edgeFilename = `edge_chart_${chartId}_${Date.now()}.png`;
      const publicEdgePath = path.join('edgemaps', edgeFilename);
      const fullPublicEdgePath = path.join(process.cwd(), 'public', publicEdgePath);
      
      // Ensure public/edgemaps directory exists
      await fs.promises.mkdir(path.dirname(fullPublicEdgePath), { recursive: true });
      
      // Generate edge map using Sobel edge detection
      const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `temp_gray_edge_${chartId}_${Date.now()}.png`);
      
      await sharp(originalImagePath)
        .grayscale()
        .png()
        .toFile(tempGrayscalePath);
      
      await sharp(tempGrayscalePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian edge detection
        })
        .normalise()
        .png()
        .toFile(fullPublicEdgePath);
      
      // Clean up temp file
      await fs.promises.unlink(tempGrayscalePath).catch(() => {});
      
      edgeMapPath = '/' + publicEdgePath;
      needsUpdate = true;
      console.log(`[VIS] backfill edge map for chart ${chartId} → ${edgeMapPath}`);
    } catch (error) {
      console.warn(`[VIS] Failed to generate edge map for chart ${chartId}:`, error);
    }
  }

  // Check and generate gradient map if missing
  if (!gradientMapPath || !fs.existsSync(path.join(process.cwd(), 'public', gradientMapPath))) {
    try {
      const gradientFilename = `gradient_chart_${chartId}_${Date.now()}.png`;
      const publicGradientPath = path.join('gradientmaps', gradientFilename);
      const fullPublicGradientPath = path.join(process.cwd(), 'public', publicGradientPath);
      
      // Ensure public/gradientmaps directory exists
      await fs.promises.mkdir(path.dirname(fullPublicGradientPath), { recursive: true });
      
      // Generate gradient map using Sobel X operator
      const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `temp_gray_gradient_${chartId}_${Date.now()}.png`);
      
      await sharp(originalImagePath)
        .grayscale()
        .png()
        .toFile(tempGrayscalePath);
      
      await sharp(tempGrayscalePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1] // Sobel X for horizontal gradient
        })
        .normalise()
        .png()
        .toFile(fullPublicGradientPath);
      
      // Clean up temp file
      await fs.promises.unlink(tempGrayscalePath).catch(() => {});
      
      gradientMapPath = '/' + publicGradientPath;
      needsUpdate = true;
      console.log(`[VIS] backfill gradient map for chart ${chartId} → ${gradientMapPath}`);
    } catch (error) {
      console.warn(`[VIS] Failed to generate gradient map for chart ${chartId}:`, error);
    }
  }

  // Update chart in database if any paths changed
  if (needsUpdate) {
    try {
      await storage.updateChart(chartId, {
        depthMapPath,
        edgeMapPath, 
        gradientMapPath
      });
      console.log(`[VIS] Updated DB paths for chart ${chartId}`);
    } catch (error) {
      console.warn(`[VIS] Failed to update DB paths for chart ${chartId}:`, error);
    }
  }

  return {
    depthMapPath,
    edgeMapPath,
    gradientMapPath
  };
}

/**
 * One-time backfill script to generate missing visual maps for all charts
 */
export async function backfillAllVisualMaps(): Promise<{ success: number; failed: number }> {
  console.log('[VIS] Starting backfill of all visual maps...');
  
  const charts = await storage.getAllCharts();
  let success = 0;
  let failed = 0;

  for (const chart of charts) {
    try {
      if (chart.id && chart.filename) {
        await ensureVisualMapsForChart(chart.id, chart.filename);
        success++;
      }
    } catch (error) {
      console.error(`[VIS] Failed to backfill maps for chart ${chart.id}:`, error);
      failed++;
    }
  }

  console.log(`[VIS] Backfill complete: ${success} success, ${failed} failed`);
  return { success, failed };
}
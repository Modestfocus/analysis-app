/**
 * Unified Analysis Routes - Route parity between Dashboard and Chat analysis
 * Enforces JSON schema and provides consistent backend RAG service
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { performUnifiedAnalysis, getHealthStatus } from '../services/unified-analysis';
import { storage } from '../storage';

const router = express.Router();

// Configure multer for temporary file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory for processing
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/**
 * POST /api/unified-analysis/quick
 * Quick analysis endpoint - processes uploaded images without saving to database
 * Used by dashboard "Quick Analysis" and chat interface
 */
router.post('/quick', upload.array('charts', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { systemPrompt, injectText, bundleId, enableFullPipeline = 'true' } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ 
        error: 'At least one chart image is required',
        code: 'NO_IMAGES'
      });
    }

    console.log(`🚀 Quick analysis request: ${files.length} images, bundle: ${bundleId || 'none'}`);

    // Convert uploaded files to image inputs
    const imageInputs = files.map(file => ({
      buffer: file.buffer
    }));

    // Perform unified analysis
    const result = await performUnifiedAnalysis(imageInputs, {
      systemPrompt,
      injectText,
      bundleId,
      enableFullPipeline: enableFullPipeline === 'true',
      debugMode: process.env.PROMPT_DEBUG === 'true'
    });

    res.json({
      success: true,
      analysis: result,
      metadata: {
        imageCount: files.length,
        bundleId: bundleId || null,
        hasRAGContext: true,
        processingMode: 'quick_analysis'
      }
    });

  } catch (error) {
    console.error('❌ Quick analysis error:', error);
    
    // Return 422 for schema validation errors
    if (error instanceof Error && error.message.includes('schema')) {
      return res.status(422).json({
        error: 'Invalid JSON response format',
        message: error.message,
        code: 'SCHEMA_VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'ANALYSIS_ERROR'
    });
  }
});

/**
 * POST /api/unified-analysis/chart/:chartId
 * Analyze existing chart by ID with optional inject text
 * Used by dashboard chart analysis with custom prompts
 */
router.post('/chart/:chartId', async (req, res) => {
  try {
    const chartId = parseInt(req.params.chartId);
    const { injectText, bundleId } = req.body;

    if (isNaN(chartId)) {
      return res.status(400).json({ 
        error: 'Invalid chart ID',
        code: 'INVALID_CHART_ID'
      });
    }

    // Get the chart
    const chart = await storage.getChart(chartId);
    if (!chart) {
      return res.status(404).json({ 
        error: 'Chart not found',
        code: 'CHART_NOT_FOUND'
      });
    }

    console.log(`🚀 Chart analysis request: ID ${chartId}, bundle: ${bundleId || 'none'}`);

    // Prepare image input from chart file
    const chartPath = path.join(process.cwd(), 'server', 'uploads', chart.filename);
    
    if (!fs.existsSync(chartPath)) {
      return res.status(404).json({ 
        error: 'Chart file not found',
        code: 'CHART_FILE_NOT_FOUND'
      });
    }

    const imageInputs = [{ path: chartPath }];

    // Perform unified analysis
    const result = await performUnifiedAnalysis(imageInputs, {
      injectText,
      bundleId,
      enableFullPipeline: true,
      debugMode: process.env.PROMPT_DEBUG === 'true'
    });

    // Save analysis result to database
    try {
      const analysisData = {
        chartId,
        bundleId: bundleId || null,
        gptAnalysis: JSON.stringify(result),
        similarCharts: JSON.stringify([]), // Will be populated by the service
        confidence: result.confidence / 100, // Convert to 0-1 scale for database
      };

      const savedAnalysis = await storage.createAnalysis(analysisData);
      
      res.json({
        success: true,
        analysis: result,
        analysisId: savedAnalysis.id,
        metadata: {
          chartId,
          bundleId: bundleId || null,
          hasRAGContext: true,
          processingMode: 'saved_analysis'
        }
      });
    } catch (dbError) {
      console.warn('⚠️ Failed to save analysis to database:', dbError);
      // Still return the analysis even if saving fails
      res.json({
        success: true,
        analysis: result,
        warning: 'Analysis completed but not saved to database',
        metadata: {
          chartId,
          bundleId: bundleId || null,
          hasRAGContext: true,
          processingMode: 'temporary_analysis'
        }
      });
    }

  } catch (error) {
    console.error('❌ Chart analysis error:', error);
    
    // Return 422 for schema validation errors
    if (error instanceof Error && error.message.includes('schema')) {
      return res.status(422).json({
        error: 'Invalid JSON response format',
        message: error.message,
        code: 'SCHEMA_VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'ANALYSIS_ERROR'
    });
  }
});

/**
 * POST /api/unified-analysis/bundle/:bundleId
 * Analyze entire bundle with multi-timeframe context
 */
router.post('/bundle/:bundleId', async (req, res) => {
  try {
    const bundleId = req.params.bundleId;
    const { injectText } = req.body;

    // Get bundle and associated charts
    const bundle = await storage.getBundle(bundleId);
    if (!bundle) {
      return res.status(404).json({ 
        error: 'Bundle not found',
        code: 'BUNDLE_NOT_FOUND'
      });
    }

    const charts = await storage.getChartsByBundleId(bundleId);
    if (charts.length === 0) {
      return res.status(400).json({ 
        error: 'No charts found in bundle',
        code: 'EMPTY_BUNDLE'
      });
    }

    console.log(`🚀 Bundle analysis request: ${bundleId} with ${charts.length} charts`);

    // Prepare image inputs from all charts in bundle
    const imageInputs = charts.map(chart => ({
      path: path.join(process.cwd(), 'server', 'uploads', chart.filename)
    }));

    // Verify all files exist
    const missingFiles = imageInputs.filter(input => !fs.existsSync(input.path!));
    if (missingFiles.length > 0) {
      return res.status(404).json({
        error: `${missingFiles.length} chart files not found`,
        code: 'CHART_FILES_NOT_FOUND'
      });
    }

    // Perform unified analysis with bundle context
    const result = await performUnifiedAnalysis(imageInputs, {
      injectText,
      bundleId,
      enableFullPipeline: true,
      debugMode: process.env.PROMPT_DEBUG === 'true'
    });

    // Save bundle analysis result
    try {
      const analysisData = {
        bundleId,
        gptAnalysis: JSON.stringify(result),
        similarCharts: JSON.stringify([]),
        confidence: result.confidence / 100,
      };

      const savedAnalysis = await storage.createAnalysis(analysisData);
      
      res.json({
        success: true,
        analysis: result,
        analysisId: savedAnalysis.id,
        metadata: {
          bundleId,
          chartCount: charts.length,
          hasRAGContext: true,
          processingMode: 'bundle_analysis'
        }
      });
    } catch (dbError) {
      console.warn('⚠️ Failed to save bundle analysis to database:', dbError);
      res.json({
        success: true,
        analysis: result,
        warning: 'Analysis completed but not saved to database',
        metadata: {
          bundleId,
          chartCount: charts.length,
          hasRAGContext: true,
          processingMode: 'temporary_bundle_analysis'
        }
      });
    }

  } catch (error) {
    console.error('❌ Bundle analysis error:', error);
    
    if (error instanceof Error && error.message.includes('schema')) {
      return res.status(422).json({
        error: 'Invalid JSON response format',
        message: error.message,
        code: 'SCHEMA_VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Bundle analysis failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      code: 'BUNDLE_ANALYSIS_ERROR'
    });
  }
});

/**
 * GET /api/unified-analysis/health
 * Health check and debug endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      service: 'unified-analysis',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
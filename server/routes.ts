import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { storage } from "./storage";
import { generateCLIPEmbedding } from "./services/transformers-clip";
import { generateDepthMap, generateDepthMapBatch } from "./services/midas";
import { analyzeChartWithGPT, analyzeChartWithRAG, analyzeBundleWithGPT, analyzeChartWithEnhancedContext } from "./services/openai";
import { insertChartSchema, insertAnalysisSchema, type Chart } from "@shared/schema";
import debugRoutes from './debug-routes';

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), "server", "uploads");
const depthmapsDir = path.join(process.cwd(), "server", "depthmaps");
const edgemapsDir = path.join(process.cwd(), "server", "edgemaps");
const gradientmapsDir = path.join(process.cwd(), "server", "gradientmaps");
const tempDir = path.join(process.cwd(), "server", "temp");

async function ensureDirectories() {
  const dirs = [uploadsDir, depthmapsDir, edgemapsDir, gradientmapsDir, tempDir];
  for (const dir of dirs) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
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

// Helper function to extract instrument from filename
function extractInstrumentFromFilename(filename: string): string {
  const upperFilename = filename.toUpperCase();
  const commonInstruments = [
    "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", 
    "AUDUSD", "NZDUSD", "USDCAD", "EURJPY", "GBPJPY", "EURGBP",
    "BTCUSD", "ETHUSD", "SPX500", "NAS100", "US30"
  ];
  
  for (const instrument of commonInstruments) {
    if (upperFilename.includes(instrument)) {
      return instrument;
    }
  }
  
  // Default fallback
  return "UNKNOWN";
}

export async function registerRoutes(app: Express): Promise<Server> {
  await ensureDirectories();

  // Register debug routes
  app.use('/debug', debugRoutes);

  // Serve uploaded files and generated maps
  app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/depthmaps', express.static(depthmapsDir));
  app.use('/edgemaps', express.static(edgemapsDir));
  app.use('/gradientmaps', express.static(gradientmapsDir));
  app.use('/temp', express.static(tempDir));

  // Multi-file upload route with automatic CLIP embedding
  app.post('/api/upload', upload.array('charts', 10), async (req, res) => {
    try {

      
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {

        return res.status(400).json({ message: 'No files uploaded' });
      }

      const { timeframe, timeframeMapping, instrument: manualInstrument, session } = req.body;
      console.log(`📝 Upload request - Timeframe: "${timeframe}", TimeframeMapping: "${timeframeMapping}", Manual Instrument: "${manualInstrument}", Session: "${session}"`);
      
      let parsedTimeframeMapping: Record<string, string> = {};
      
      // Handle individual timeframe mapping (new method)
      if (timeframeMapping) {
        try {
          parsedTimeframeMapping = JSON.parse(timeframeMapping);
          console.log(`📋 Individual timeframe mapping:`, parsedTimeframeMapping);
        } catch (error) {
          return res.status(400).json({ message: 'Invalid timeframeMapping JSON format' });
        }
      }
      
      // Validate timeframe if provided (old method fallback)
      if (timeframe && timeframe !== "undefined") {
        const validTimeframes = ["5M", "15M", "1H", "4H", "Daily"];
        if (!validTimeframes.includes(timeframe)) {
          return res.status(400).json({ 
            message: `Invalid timeframe "${timeframe}". Valid timeframes are: ${validTimeframes.join(', ')}` 
          });
        }
      }
      
      // Check if we have at least one valid method
      if (!timeframeMapping && (!timeframe || timeframe === "undefined")) {
        return res.status(400).json({ message: 'Either timeframe or timeframeMapping is required' });
      }

      const uploadedCharts = [];

      for (const file of files) {
        // Auto-detect instrument from filename or use manual input
        const detectedInstrument = extractInstrumentFromFilename(file.originalname);
        const finalInstrument = manualInstrument || detectedInstrument;

        // Get timeframe for this specific file (individual mapping) or use global timeframe
        const fileTimeframe = parsedTimeframeMapping[file.originalname] || timeframe || "5M";
        
        // Validate individual timeframe
        const validTimeframes = ["5M", "15M", "1H", "4H", "Daily"];
        if (!validTimeframes.includes(fileTimeframe)) {
          return res.status(400).json({ 
            message: `Invalid timeframe "${fileTimeframe}" for file "${file.originalname}". Valid timeframes are: ${validTimeframes.join(', ')}` 
          });
        }

        const chartData = {
          filename: file.filename,
          originalName: file.originalname,
          timeframe: fileTimeframe,
          instrument: finalInstrument,
          session: session || null,
          comment: "",
          depthMapPath: null,
          embedding: null,
        };

        const validatedData = insertChartSchema.parse(chartData);
        const chart = await storage.createChart(validatedData);
        console.log(`📊 Created chart ${chart.id}: ${chart.originalName} - Timeframe: "${chart.timeframe}", Instrument: "${chart.instrument}"`);

        // Automatically generate CLIP embedding after upload
        try {
          const imagePath = path.join(uploadsDir, chart.filename);
          const result = await generateCLIPEmbedding(imagePath);
          if (result.embedding && result.embedding.length === 1024) {
            await storage.updateChart(chart.id, { embedding: result.embedding });
            console.log(`✓ Generated CLIP embedding for chart ${chart.id} (${finalInstrument}) - 1024D vector using ${result.model}`);
          } else {
            console.error(`CLIP embedding failed for chart ${chart.id}:`, result.error);
          }
        } catch (embeddingError) {
          console.error(`Failed to generate CLIP embedding for chart ${chart.id}:`, embeddingError);
          // Continue without embedding - don't fail the upload
        }

        // Automatically generate depth map after upload
        try {
          const imagePath = path.join(uploadsDir, chart.filename);
          const depthMapFilename = `depth_${chart.filename.replace(/\.[^/.]+$/, '.png')}`;
          const depthMapPath = path.join(depthmapsDir, depthMapFilename);
          
          const depthResult = await generateDepthMap(imagePath, depthMapPath);
          if (depthResult.success) {
            await storage.updateChart(chart.id, { depthMapPath: `/depthmaps/${depthMapFilename}` });
            console.log(`✓ Generated depth map for chart ${chart.id} using ${depthResult.model}: /depthmaps/${depthMapFilename}`);
          } else {
            console.error(`Depth map generation failed for chart ${chart.id}:`, depthResult.error);
          }
        } catch (depthError) {
          console.error(`Failed to generate depth map for chart ${chart.id}:`, depthError);
          // Continue without depth map - don't fail the upload
        }

        uploadedCharts.push({
          ...chart,
          filePath: `/uploads/${file.filename}`,
          depthMapUrl: chart.depthMapPath // Include depth map URL in response
        });
      }

      // Create summary of timeframes used
      const timeframeSummary = Object.values(parsedTimeframeMapping).length > 0 
        ? `individual timeframes (${Object.values(parsedTimeframeMapping).join(', ')})`
        : `${timeframe} timeframe`;

      res.json({
        success: true,
        charts: uploadedCharts,
        message: `Successfully uploaded ${uploadedCharts.length} chart(s) with ${timeframeSummary} and 1024D CLIP embeddings`,
        metadata: {
          timeframes: Object.values(parsedTimeframeMapping).length > 0 ? parsedTimeframeMapping : { all: timeframe },
          instrument: uploadedCharts[0]?.instrument,
          session,
          count: uploadedCharts.length
        }
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: 'Upload failed: ' + (error as Error).message });
    }
  });

  // Embed route - generates OpenCLIP embedding for chart
  app.post('/api/embed', async (req, res) => {
    try {
      const { chartId } = req.body;
      if (!chartId) {
        return res.status(400).json({ message: 'Chart ID is required' });
      }

      const chart = await storage.getChart(chartId);
      if (!chart) {
        return res.status(404).json({ message: 'Chart not found' });
      }

      const imagePath = path.join(uploadsDir, chart.filename);
      const result = await generateCLIPEmbedding(imagePath);
      
      if (result.embedding && result.embedding.length === 1024) {
        await storage.updateChart(chartId, { embedding: result.embedding });

        res.json({
          success: true,
          embedding: result.embedding.slice(0, 10), // Return first 10 values for verification
          dimensions: result.embedding.length,
          model: result.model
        });
      } else {
        res.status(500).json({ message: 'OpenCLIP embedding generation failed: ' + (result.error || 'Unknown error') });
      }
    } catch (error) {
      console.error('Embed error:', error);
      res.status(500).json({ message: 'Embedding generation failed: ' + (error as Error).message });
    }
  });

  // Depth route - generates MiDaS depth map for single chart
  app.post('/api/depth', async (req, res) => {
    try {
      const { chartId } = req.body;
      if (!chartId) {
        return res.status(400).json({ message: 'Chart ID is required' });
      }

      const chart = await storage.getChart(chartId);
      if (!chart) {
        return res.status(404).json({ message: 'Chart not found' });
      }

      const imagePath = path.join(uploadsDir, chart.filename);
      const depthMapFilename = `depth_${chart.filename.replace(/\.[^/.]+$/, '.png')}`;
      const depthMapPath = path.join(depthmapsDir, depthMapFilename);
      
      const result = await generateDepthMap(imagePath, depthMapPath);
      
      if (result.success) {
        await storage.updateChart(chartId, { depthMapPath: `/depthmaps/${depthMapFilename}` });
        
        res.json({
          success: true,
          depthMapPath: `/depthmaps/${depthMapFilename}`,
          model: result.model,
          depthRange: result.depth_range
        });
      } else {
        res.status(500).json({ 
          success: false,
          message: result.error || 'Depth map generation failed' 
        });
      }
    } catch (error) {
      console.error('Depth map error:', error);
      res.status(500).json({ message: 'Depth map generation failed: ' + (error as Error).message });
    }
  });

  // Depth batch route - generates depth maps for multiple charts
  app.post('/api/depth/batch', async (req, res) => {
    try {
      const { instrument, timeframe } = req.body;
      
      // Get charts to process
      const charts = await storage.getAllCharts(timeframe, instrument);
      const unprocessedCharts = charts.filter(chart => !chart.depthMapPath);
      
      if (unprocessedCharts.length === 0) {
        return res.json({
          success: true,
          message: 'No charts need depth map processing',
          processed: 0
        });
      }

      const results = [];
      
      for (const chart of unprocessedCharts) {
        const imagePath = path.join(uploadsDir, chart.filename);
        const depthMapFilename = `depth_${chart.filename.replace(/\.[^/.]+$/, '.png')}`;
        const depthMapPath = path.join(depthmapsDir, depthMapFilename);
        
        try {
          const result = await generateDepthMap(imagePath, depthMapPath);
          
          if (result.success) {
            await storage.updateChart(chart.id, { depthMapPath: `/depthmaps/${depthMapFilename}` });
            results.push({
              chartId: chart.id,
              filename: chart.filename,
              success: true,
              depthMapPath: `/depthmaps/${depthMapFilename}`,
              model: result.model
            });
          } else {
            results.push({
              chartId: chart.id,
              filename: chart.filename,
              success: false,
              error: result.error
            });
          }
        } catch (error) {
          results.push({
            chartId: chart.id,
            filename: chart.filename,
            success: false,
            error: (error as Error).message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        processed: results.length,
        successful: successCount,
        failed: results.length - successCount,
        results: results
      });
      
    } catch (error) {
      console.error('Batch depth map error:', error);
      res.status(500).json({ message: 'Batch depth map generation failed: ' + (error as Error).message });
    }
  });

  // Analyze route - complete analysis with GPT-4o
  app.post('/api/analyze', upload.single('chart'), async (req, res) => {
    try {
      const { quickAnalysis } = req.body;
      let chartImagePath: string;
      let chartId: number | null = null;

      if (quickAnalysis === 'true') {
        // Quick analysis mode - use uploaded file temporarily
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded for quick analysis' });
        }
        chartImagePath = req.file.path;
      } else {
        // Regular analysis mode - use saved chart
        const { chartId: id } = req.body;
        if (!id) {
          return res.status(400).json({ message: 'Chart ID is required for saved analysis' });
        }
        
        const chart = await storage.getChart(parseInt(id));
        if (!chart) {
          return res.status(404).json({ message: 'Chart not found' });
        }
        
        chartId = parseInt(id);
        chartImagePath = path.join(uploadsDir, chart.filename);
      }

      // Generate CLIP embedding for similarity search
      const embeddingResult = await generateCLIPEmbedding(chartImagePath);
      if (!embeddingResult.embedding || embeddingResult.embedding.length !== 1024) {
        return res.status(500).json({ message: 'Failed to generate embedding for similarity search' });
      }
      const debugLogs = req.query.debug === 'true';
      const similarCharts = await storage.findSimilarCharts(embeddingResult.embedding, 3, debugLogs);

      // ENHANCED: Check if any similar charts belong to bundles and include bundle context
      const enrichedSimilarCharts: Array<{
        type: 'individual' | 'bundle';
        chart?: any;
        bundle?: any;
        charts?: any[];
        similarity: number;
        analysis?: any;
      }> = [];
      const processedBundles = new Set<string>();

      for (const similarChart of similarCharts) {
        if (similarChart.chart.bundleId && !processedBundles.has(similarChart.chart.bundleId)) {
          // This chart belongs to a bundle - include the entire bundle
          processedBundles.add(similarChart.chart.bundleId);
          
          const bundle = await storage.getBundle(similarChart.chart.bundleId);
          const bundleCharts = await storage.getChartsByBundleId(similarChart.chart.bundleId);
          
          if (bundle && bundleCharts.length > 0) {
            // Get analysis for this bundle if it exists
            const bundleAnalysis = await storage.getAnalysisByBundleId(similarChart.chart.bundleId);
            
            enrichedSimilarCharts.push({
              type: 'bundle' as const,
              bundle,
              charts: bundleCharts,
              similarity: similarChart.similarity,
              analysis: bundleAnalysis
            });
          }
        } else if (!similarChart.chart.bundleId) {
          // Individual chart not part of a bundle
          enrichedSimilarCharts.push({
            type: 'individual' as const,
            chart: similarChart.chart,
            similarity: similarChart.similarity
          });
        }
      }

      // Convert image to base64 for GPT-4o
      const imageBuffer = await fs.readFile(chartImagePath);
      const chartImageBase64 = imageBuffer.toString('base64');

      // Generate depth map if not quick analysis
      let depthMapBase64: string | undefined;
      if (!quickAnalysis) {
        const depthMapFilename = `depth-${path.basename(chartImagePath)}`;
        const depthMapPath = path.join(depthmapsDir, depthMapFilename);
        await generateDepthMap(chartImagePath, depthMapPath);
        
        const depthBuffer = await fs.readFile(depthMapPath);
        depthMapBase64 = depthBuffer.toString('base64');
      }

      // Analyze with enhanced GPT-4o (including bundle context)
      const analysis = await analyzeChartWithEnhancedContext(
        chartImagePath,
        enrichedSimilarCharts
      );

      // Save analysis if not quick mode
      if (chartId && !quickAnalysis) {
        const analysisData = {
          chartId,
          gptAnalysis: JSON.stringify(analysis),
          similarCharts: JSON.stringify(similarCharts.map(sc => ({
            id: sc.chart.id,
            name: sc.chart.originalName,
            timeframe: sc.chart.timeframe,
            similarity: Math.round(sc.similarity * 100)
          }))),
          confidence: analysis.confidence,
        };

        const validatedAnalysisData = insertAnalysisSchema.parse(analysisData);
        await storage.createAnalysis(validatedAnalysisData);
      }

      // Clean up quick analysis file
      if (quickAnalysis === 'true' && req.file) {
        await fs.unlink(req.file.path).catch(() => {}); // Ignore errors
      }

      res.json({
        success: true,
        analysis,
        similarCharts: similarCharts.map(sc => ({
          id: sc.chart.id,
          name: sc.chart.originalName,
          timeframe: sc.chart.timeframe,
          similarity: Math.round(sc.similarity * 100)
        })),
        enrichedContext: enrichedSimilarCharts.map(item => {
          if (item.type === 'bundle' && item.bundle && item.charts) {
            return {
              type: 'bundle',
              bundleId: item.bundle.id,
              instrument: item.bundle.instrument,
              session: item.bundle.session,
              similarity: Math.round(item.similarity * 100),
              chartsCount: item.charts.length,
              timeframes: item.charts.map(c => c.timeframe),
              hasAnalysis: !!item.analysis
            };
          } else if (item.type === 'individual' && item.chart) {
            return {
              type: 'individual',
              chartId: item.chart.id,
              name: item.chart.originalName,
              timeframe: item.chart.timeframe,
              similarity: Math.round(item.similarity * 100)
            };
          } else {
            return {
              type: 'unknown',
              similarity: Math.round(item.similarity * 100)
            };
          }
        })
      });
    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({ message: 'Analysis failed: ' + (error as Error).message });
    }
  });

  // NEW: RAG-powered chart analysis endpoint
  app.post('/api/analyze/:chartId', async (req, res) => {
    try {
      const chartId = parseInt(req.params.chartId);
      
      if (isNaN(chartId)) {
        return res.status(400).json({ message: 'Invalid chart ID' });
      }

      // 1. Get the chart
      const chart = await storage.getChart(chartId);
      if (!chart) {
        return res.status(404).json({ message: 'Chart not found' });
      }

      const chartImagePath = path.join(uploadsDir, chart.filename);
      
      // 2. RAG Retrieval: Get similar charts using vector embeddings
      let similarCharts: Array<{ chart: any; similarity: number }> = [];
      const debugLogs = req.query.debug === 'true';
      
      if (chart.embedding && chart.embedding.length === 1024) {
        similarCharts = await storage.findSimilarCharts(chart.embedding, 3, debugLogs);
        console.log(`Found ${similarCharts.length} similar charts for RAG context`);
      } else {
        console.log('No embedding available for similarity search');
      }

      // 3. Prepare depth map path
      const depthMapPath = chart.depthMapPath;

      // 4. Call GPT-4o with RAG context
      const prediction = await analyzeChartWithRAG(chartImagePath, depthMapPath, similarCharts);

      // 5. Save analysis result to database
      const analysisData = {
        chartId,
        gptAnalysis: JSON.stringify(prediction),
        similarCharts: JSON.stringify(similarCharts.map(sc => ({
          chartId: sc.chart.id,
          similarity: sc.similarity,
          filename: sc.chart.filename,
          instrument: sc.chart.instrument,
          session: sc.chart.session,
          comment: sc.chart.comment
        }))),
        confidence: prediction.confidence === 'High' ? 0.9 : prediction.confidence === 'Medium' ? 0.7 : 0.5,
      };

      const validatedAnalysis = insertAnalysisSchema.parse(analysisData);
      const savedAnalysis = await storage.createAnalysis(validatedAnalysis);

      // 6. Return structured prediction
      res.json({
        success: true,
        chartId,
        prediction,
        similarCharts: similarCharts.map(sc => ({
          chartId: sc.chart.id,
          filename: sc.chart.filename,
          instrument: sc.chart.instrument,
          session: sc.chart.session,
          similarity: sc.similarity,
          filePath: `/uploads/${sc.chart.filename}`,
          depthMapUrl: sc.chart.depthMapPath,
          comment: sc.chart.comment
        })),
        analysisId: savedAnalysis.id
      });

    } catch (error) {
      console.error('RAG Analysis error:', error);
      res.status(500).json({ 
        message: 'Chart analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // Get all saved Quick Analysis results for dashboard
  app.get('/api/analyses', async (req, res) => {
    try {
      const analyses = await storage.getAllAnalyses();
      
      // Enrich analyses with chart data
      const enrichedAnalyses = await Promise.all(analyses.map(async (analysis) => {
        let chart = null;
        if (analysis.chartId) {
          chart = await storage.getChart(analysis.chartId);
        }
        
        let prediction = null;
        try {
          prediction = JSON.parse(analysis.gptAnalysis);
        } catch (e) {
          console.error('Failed to parse GPT analysis:', e);
        }
        
        let similarCharts = [];
        try {
          similarCharts = JSON.parse(analysis.similarCharts);
        } catch (e) {
          console.error('Failed to parse similar charts:', e);
        }
        
        return {
          id: analysis.id,
          chartId: analysis.chartId,
          bundleId: analysis.bundleId,
          prediction,
          similarCharts,
          confidence: analysis.confidence,
          createdAt: analysis.createdAt,
          chart: chart ? {
            id: chart.id,
            filename: chart.filename,
            originalName: chart.originalName,
            timeframe: chart.timeframe,
            instrument: chart.instrument,
            session: chart.session,
            filePath: `/uploads/${chart.filename}`,
            depthMapUrl: chart.depthMapPath,
            comment: chart.comment
          } : null
        };
      }));
      
      res.json({
        success: true,
        analyses: enrichedAnalyses
      });
    } catch (error) {
      console.error('Error fetching analyses:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch analyses' 
      });
    }
  });

  // Get all charts with filtering
  app.get('/api/charts', async (req, res) => {
    try {
      const { timeframe, instrument } = req.query;
      console.log(`🔍 Filter request - Timeframe: "${timeframe}", Instrument: "${instrument}"`);
      const charts = await storage.getAllCharts(timeframe as string, instrument as string);
      console.log(`📊 Found ${charts.length} charts for filter`);
      
      // Include all map paths for comprehensive analysis
      const chartsWithPaths = charts.map(chart => ({
        ...chart,
        filePath: `/uploads/${chart.filename}`,
        depthMapUrl: chart.depthMapPath,
        edgeMapUrl: chart.edgeMapPath,
        gradientMapUrl: chart.gradientMapPath
      }));
      
      res.json({ charts: chartsWithPaths });
    } catch (error) {
      console.error('Get charts error:', error);
      res.status(500).json({ message: 'Failed to get charts: ' + (error as Error).message });
    }
  });

  // Get charts grouped by instrument
  app.get('/api/charts/grouped', async (req, res) => {
    try {
      const allCharts = await storage.getAllCharts();
      const grouped = allCharts.reduce((acc, chart) => {
        if (!acc[chart.instrument]) {
          acc[chart.instrument] = [];
        }
        acc[chart.instrument].push(chart);
        return acc;
      }, {} as Record<string, typeof allCharts>);
      
      res.json({ grouped });
    } catch (error) {
      console.error('Get grouped charts error:', error);
      res.status(500).json({ message: 'Failed to get grouped charts: ' + (error as Error).message });
    }
  });

  // Update chart comment
  app.patch('/api/charts/:id', async (req, res) => {
    try {
      const chartId = parseInt(req.params.id);
      const { comment } = req.body;
      
      const updatedChart = await storage.updateChart(chartId, { comment });
      if (!updatedChart) {
        return res.status(404).json({ message: 'Chart not found' });
      }
      
      res.json({ success: true, chart: updatedChart });
    } catch (error) {
      console.error('Update chart error:', error);
      res.status(500).json({ message: 'Failed to update chart: ' + (error as Error).message });
    }
  });

  // Delete single chart
  app.delete('/api/charts/:id', async (req, res) => {
    try {
      const chartId = parseInt(req.params.id);
      const chart = await storage.getChart(chartId);
      
      if (!chart) {
        return res.status(404).json({ message: 'Chart not found' });
      }

      // Delete files
      const imagePath = path.join(uploadsDir, chart.filename);
      await fs.unlink(imagePath).catch(() => {});
      
      if (chart.depthMapPath) {
        const depthPath = path.join(process.cwd(), 'server', chart.depthMapPath);
        await fs.unlink(depthPath).catch(() => {});
      }

      const deleted = await storage.deleteChart(chartId);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Delete chart error:', error);
      res.status(500).json({ message: 'Failed to delete chart: ' + (error as Error).message });
    }
  });

  // Delete multiple charts
  app.delete('/api/charts', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ message: 'IDs array is required' });
      }

      // Delete files for each chart
      for (const id of ids) {
        const chart = await storage.getChart(id);
        if (chart) {
          const imagePath = path.join(uploadsDir, chart.filename);
          await fs.unlink(imagePath).catch(() => {});
          
          if (chart.depthMapPath) {
            const depthPath = path.join(process.cwd(), 'server', chart.depthMapPath);
            await fs.unlink(depthPath).catch(() => {});
          }
        }
      }

      const deleted = await storage.deleteCharts(ids);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Delete charts error:', error);
      res.status(500).json({ message: 'Failed to delete charts: ' + (error as Error).message });
    }
  });

  // Bundle management routes
  app.post('/api/bundles', async (req, res) => {
    try {
      const { id, instrument, session, chartIds } = req.body;
      
      if (!id || !instrument || !Array.isArray(chartIds)) {
        return res.status(400).json({ message: 'Bundle ID, instrument, and chart IDs are required' });
      }

      // Create bundle metadata
      const charts = await Promise.all(chartIds.map(id => storage.getChart(id)));
      const validCharts = charts.filter(chart => chart !== undefined) as Chart[];
      
      if (validCharts.length === 0) {
        return res.status(400).json({ message: 'No valid charts found' });
      }

      const timeframes = validCharts.map(chart => chart.timeframe);
      const bundleMetadata = {
        bundle_id: id,
        instrument,
        chart_ids: chartIds,
        timeframes,
        session,
        created_at: new Date().toISOString()
      };

      // Create the bundle
      const bundle = await storage.createBundle({
        id,
        instrument,
        session: session || null,
        metadata: JSON.stringify(bundleMetadata)
      });

      // Update charts with bundle ID
      await Promise.all(chartIds.map(chartId => 
        storage.updateChart(chartId, { bundleId: id })
      ));

      res.json({ success: true, bundle, metadata: bundleMetadata });
    } catch (error) {
      console.error('Create bundle error:', error);
      res.status(500).json({ message: 'Failed to create bundle: ' + (error as Error).message });
    }
  });

  app.get('/api/bundles', async (req, res) => {
    try {
      const { instrument } = req.query;
      const bundles = await storage.getAllBundles(instrument as string);
      
      // Parse metadata for each bundle
      const bundlesWithMetadata = bundles.map(bundle => ({
        ...bundle,
        parsedMetadata: JSON.parse(bundle.metadata)
      }));

      res.json({ bundles: bundlesWithMetadata });
    } catch (error) {
      console.error('Get bundles error:', error);
      res.status(500).json({ message: 'Failed to get bundles: ' + (error as Error).message });
    }
  });

  app.get('/api/bundles/:id', async (req, res) => {
    try {
      const bundleId = req.params.id;
      const bundle = await storage.getBundle(bundleId);
      
      if (!bundle) {
        return res.status(404).json({ message: 'Bundle not found' });
      }

      const charts = await storage.getChartsByBundleId(bundleId);
      const analysis = await storage.getAnalysisByBundleId(bundleId);

      res.json({
        bundle: {
          ...bundle,
          parsedMetadata: JSON.parse(bundle.metadata)
        },
        charts,
        analysis
      });
    } catch (error) {
      console.error('Get bundle error:', error);
      res.status(500).json({ message: 'Failed to get bundle: ' + (error as Error).message });
    }
  });

  app.post('/api/analyze/bundle/:bundleId', async (req, res) => {
    try {
      const bundleId = req.params.bundleId;
      const bundle = await storage.getBundle(bundleId);
      
      if (!bundle) {
        return res.status(404).json({ message: 'Bundle not found' });
      }

      const charts = await storage.getChartsByBundleId(bundleId);
      if (charts.length === 0) {
        return res.status(404).json({ message: 'No charts found in bundle' });
      }

      // Get all chart images and metadata
      const chartData = await Promise.all(charts.map(async (chart) => {
        const imagePath = path.join(uploadsDir, chart.filename);
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        
        let depthMapBase64: string | undefined;
        if (chart.depthMapPath) {
          try {
            const depthPath = path.join(process.cwd(), 'server', chart.depthMapPath);
            const depthBuffer = await fs.readFile(depthPath);
            depthMapBase64 = depthBuffer.toString('base64');
          } catch (error) {
            console.log('Could not read depth map for chart', chart.id);
          }
        }

        return {
          chart,
          base64Image,
          depthMapBase64
        };
      }));

      // Generate bundle analysis using multi-timeframe context
      const bundleMetadata = JSON.parse(bundle.metadata);
      const analysis = await analyzeBundleWithGPT(chartData, bundleMetadata);

      // Save bundle analysis
      const analysisData = {
        bundleId,
        chartId: null, // Bundle analysis is not tied to a single chart
        gptAnalysis: JSON.stringify(analysis),
        similarCharts: JSON.stringify([]), // Could implement bundle similarity later
        confidence: analysis.confidence,
      };

      const validatedAnalysisData = insertAnalysisSchema.parse(analysisData);
      await storage.createAnalysis(validatedAnalysisData);

      // Return structured response with prediction data
      res.json({
        success: true,
        bundleId,
        instrument: bundleMetadata.instrument,
        prediction: analysis.prediction || "Multi-timeframe analysis complete",
        session: analysis.session || bundleMetadata.session || "London",
        confidence: analysis.confidence_level || "Medium",
        rationale: analysis.rationale || analysis.analysis,
        analysis: analysis.analysis,
        charts: charts.map(chart => ({
          id: chart.id,
          timeframe: chart.timeframe,
          originalName: chart.originalName,
          instrument: chart.instrument
        })),
        chartCount: charts.length
      });
    } catch (error) {
      console.error('Bundle analysis error:', error);
      res.status(500).json({ message: 'Failed to analyze bundle: ' + (error as Error).message });
    }
  });

  app.delete('/api/bundles/:id', async (req, res) => {
    try {
      const bundleId = req.params.id;
      const bundle = await storage.getBundle(bundleId);
      
      if (!bundle) {
        return res.status(404).json({ message: 'Bundle not found' });
      }

      const deleted = await storage.deleteBundle(bundleId);
      res.json({ success: deleted });
    } catch (error) {
      console.error('Delete bundle error:', error);
      res.status(500).json({ message: 'Failed to delete bundle: ' + (error as Error).message });
    }
  });

  // Import the image processing service
  const { processChartImage, processChartsInBatch } = await import('./services/opencv-processing');

  // Static file serving for new image maps
  app.use('/edgemaps', express.static(path.join(process.cwd(), 'server', 'edgemaps')));
  app.use('/gradientmaps', express.static(path.join(process.cwd(), 'server', 'gradientmaps')));

  // Process individual chart for edge/gradient maps
  app.post('/api/process/:chartId', async (req, res) => {
    try {
      const chartId = parseInt(req.params.chartId);
      
      if (isNaN(chartId)) {
        return res.status(400).json({ message: 'Invalid chart ID' });
      }

      const chart = await storage.getChart(chartId);
      if (!chart) {
        return res.status(404).json({ message: 'Chart not found' });
      }

      // Skip if already processed
      if (chart.edgeMapPath && chart.gradientMapPath) {
        return res.json({
          success: true,
          message: 'Chart already processed',
          chartId,
          edgeMapPath: chart.edgeMapPath,
          gradientMapPath: chart.gradientMapPath
        });
      }

      const inputPath = path.join(uploadsDir, chart.filename);
      const result = await processChartImage(inputPath, chartId);

      if (result.success && result.edgeMapPath && result.gradientMapPath) {
        // Update chart with new map paths
        await storage.updateChart(chartId, {
          edgeMapPath: result.edgeMapPath,
          gradientMapPath: result.gradientMapPath
        });

        res.json({
          success: true,
          chartId,
          edgeMapPath: result.edgeMapPath,
          gradientMapPath: result.gradientMapPath
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || 'Processing failed'
        });
      }
    } catch (error) {
      console.error('Chart processing error:', error);
      res.status(500).json({ 
        message: 'Processing failed: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // Batch process all charts for edge/gradient maps
  app.post('/api/process/batch', async (req, res) => {
    try {
      console.log('🚀 Starting batch processing of all charts for edge/gradient maps');
      
      // Get all charts that need processing
      const allCharts = await storage.getAllCharts();
      const chartsToProcess = allCharts.filter(chart => !chart.edgeMapPath || !chart.gradientMapPath);
      
      if (chartsToProcess.length === 0) {
        return res.json({
          success: true,
          message: 'All charts already processed',
          processed: 0,
          total: allCharts.length
        });
      }

      console.log(`📊 Found ${chartsToProcess.length} charts that need processing`);

      // Process charts in batch
      const results = await processChartsInBatch(chartsToProcess);
      
      // Update database with results
      let successCount = 0;
      for (const { chartId, result } of results) {
        if (result.success && result.edgeMapPath && result.gradientMapPath) {
          await storage.updateChart(chartId, {
            edgeMapPath: result.edgeMapPath,
            gradientMapPath: result.gradientMapPath
          });
          successCount++;
        }
      }

      res.json({
        success: true,
        message: `Batch processing complete: ${successCount}/${chartsToProcess.length} charts processed successfully`,
        processed: successCount,
        failed: chartsToProcess.length - successCount,
        total: chartsToProcess.length
      });

    } catch (error) {
      console.error('Batch processing error:', error);
      res.status(500).json({ 
        message: 'Batch processing failed: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // Rebuild CLIP vector index endpoint
  app.post('/api/admin/rebuild-clip-index', async (req, res) => {
    try {
      console.log('🔄 Starting CLIP index rebuild...');
      
      // Get all charts that don't have embeddings or have invalid embeddings
      const allCharts = await storage.getAllCharts();
      const chartsNeedingEmbedding = allCharts.filter(chart => 
        !chart.embedding || chart.embedding.length !== 1024
      );
      
      console.log(`📊 Found ${chartsNeedingEmbedding.length} charts needing CLIP embeddings out of ${allCharts.length} total`);
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const chart of chartsNeedingEmbedding) {
        try {
          const chartPath = path.join(uploadsDir, chart.filename);
          
          // Check if file exists before processing
          if (!require('fs').existsSync(chartPath)) {
            console.log(`❌ Skipping chart ${chart.id}: File ${chart.filename} not found`);
            errorCount++;
            continue;
          }
          
          // Generate CLIP embedding
          const embeddingResult = await generateCLIPEmbedding(chartPath);
          
          if (embeddingResult.embedding && embeddingResult.embedding.length === 1024) {
            // Update chart with new embedding
            await storage.updateChart(chart.id, { embedding: embeddingResult.embedding });
            console.log(`✅ Updated CLIP embedding for chart ${chart.id} (${chart.filename})`);
            successCount++;
          } else {
            console.log(`❌ Failed to generate valid embedding for chart ${chart.id} (${chart.filename})`);
            errorCount++;
          }
        } catch (error) {
          console.log(`❌ Error processing chart ${chart.id}: ${error}`);
          errorCount++;
        }
      }
      
      console.log(`🎯 CLIP index rebuild complete: ${successCount} successful, ${errorCount} failed`);
      
      res.json({
        success: true,
        message: `CLIP index rebuild complete`,
        details: {
          totalCharts: allCharts.length,
          chartsProcessed: chartsNeedingEmbedding.length,
          successful: successCount,
          failed: errorCount
        }
      });
    } catch (error) {
      console.error('CLIP index rebuild error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'CLIP index rebuild failed: ' + (error as Error).message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

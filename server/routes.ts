import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { storage } from "./storage";
import { generateCLIPEmbedding } from "./services/transformers-clip";
import { generateDepthMap } from "./services/midas";
import { analyzeChartWithGPT } from "./services/openai";
import { insertChartSchema, insertAnalysisSchema } from "@shared/schema";

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), "server", "uploads");
const depthmapsDir = path.join(process.cwd(), "server", "depthmaps");

async function ensureDirectories() {
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
  
  try {
    await fs.access(depthmapsDir);
  } catch {
    await fs.mkdir(depthmapsDir, { recursive: true });
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

  // Serve uploaded files
  app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use('/uploads', express.static(uploadsDir));
  app.use('/depthmaps', express.static(depthmapsDir));

  // Multi-file upload route with automatic CLIP embedding
  app.post('/api/upload', upload.array('charts', 10), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const { timeframe, instrument: manualInstrument, session } = req.body;
      if (!timeframe) {
        return res.status(400).json({ message: 'Timeframe is required' });
      }

      const uploadedCharts = [];

      for (const file of files) {
        // Auto-detect instrument from filename or use manual input
        const detectedInstrument = extractInstrumentFromFilename(file.originalname);
        const finalInstrument = manualInstrument || detectedInstrument;

        const chartData = {
          filename: file.filename,
          originalName: file.originalname,
          timeframe,
          instrument: finalInstrument,
          session: session || null,
          comment: "",
          depthMapPath: null,
          embedding: null,
        };

        const validatedData = insertChartSchema.parse(chartData);
        const chart = await storage.createChart(validatedData);

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

        uploadedCharts.push({
          ...chart,
          filePath: `/uploads/${file.filename}`
        });
      }

      res.json({
        success: true,
        charts: uploadedCharts,
        message: `Successfully uploaded ${uploadedCharts.length} chart(s) with 1024D CLIP embeddings`
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

  // Depth route - generates MiDaS depth map
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
      const depthMapFilename = `depth-${chart.filename}`;
      const depthMapPath = path.join(depthmapsDir, depthMapFilename);
      
      await generateDepthMap(imagePath, depthMapPath);
      await storage.updateChart(chartId, { depthMapPath: `/depthmaps/${depthMapFilename}` });

      res.json({
        success: true,
        depthMapPath: `/depthmaps/${depthMapFilename}`
      });
    } catch (error) {
      console.error('Depth map error:', error);
      res.status(500).json({ message: 'Depth map generation failed: ' + (error as Error).message });
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
      const similarCharts = await storage.findSimilarCharts(embeddingResult.embedding, 3);

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

      // Analyze with GPT-4o
      const analysis = await analyzeChartWithGPT(
        chartImageBase64,
        similarCharts,
        depthMapBase64
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

        await storage.createAnalysis(analysisData);
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
        }))
      });
    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({ message: 'Analysis failed: ' + (error as Error).message });
    }
  });

  // Get all charts with filtering
  app.get('/api/charts', async (req, res) => {
    try {
      const { timeframe, instrument } = req.query;
      const charts = await storage.getAllCharts(timeframe as string, instrument as string);
      res.json({ charts });
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

  const httpServer = createServer(app);
  return httpServer;
}

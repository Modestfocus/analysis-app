import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { storage } from "./storage";
// Using unified embeddings service for all CLIP embeddings
import { embedImageToVectorCached, EMB_DIM, EMB_MODEL_ID } from "./services/embeddings";
import { backfillAllVisualMaps } from "./services/visual-maps";
import crypto from 'crypto';
import { generateDepthMap, generateDepthMapBatch } from "./services/midas";
import { analyzeChartWithGPT, analyzeChartWithRAG, analyzeBundleWithGPT, analyzeChartWithEnhancedContext, analyzeMultipleChartsWithAllMaps, MultiChartData } from "./services/openai";
import { insertChartSchema, insertAnalysisSchema, insertDocumentSchema, insertNoteSchema, type Chart, type Document } from "@shared/schema";
import debugRoutes from './debug-routes';
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { env, isPromptDebugOn } from "./config/env";
import { logger } from "./utils/logger";
import { buildUnifiedPrompt } from "./services/unifiedPrompt";
import { v4 as uuidv4 } from "uuid";
import { log, logErr } from "./utils/logger";
import { callOpenAIAnalyze, toAbsoluteFromReq } from "./services/openaiClient";
import { normalizeForWire } from "./services/normalizeForWire";
import analysisRouter from "./routes/analysis";

// --- helper: turn client payload into your model call ---
async function callModelWithInputs(body: any): Promise<any> {
  const promptText: string = body?.text ?? body?.prompt ?? body?.message ?? "";
  const images: string[] =
    Array.isArray(body?.images) ? body.images :
    Array.isArray(body?.dataUrlPreviews) ? body.dataUrlPreviews :
    Array.isArray(body?.dataUrls) ? body.dataUrls :
    [];

  // ⛔️ It probably looked like this before:
  // const rawResult = await generateAnalysis({ prompt: promptText, images });

  // ✅ REPLACE the call with this pass-through:
  const rawResult = await generateAnalysis({
    prompt: promptText,
    images,
    systemPrompt: String(body?.systemPrompt ?? ""),
    wantSimilar: Boolean(body?.wantSimilar),
  });

  return rawResult;
}

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
      const uniqueSuffix = Math.floor(Date.now() / 1000) + '-' + Math.round(Math.random() * 1E9);
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

// Helper function to extract instrument from GPT response  
function extractInstrumentFromResponse(gptResponse: string): string | null {
  try {
    const parsed = JSON.parse(gptResponse);
    return parsed.instrument || parsed.symbol || null;
  } catch {
    // Fallback to text parsing if JSON parse fails
    const instruments = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", 
                        "AUDUSD", "NZDUSD", "USDCAD", "EURJPY", "GBPJPY", "EURGBP",
                        "BTCUSD", "ETHUSD", "SPX500", "NAS100", "US30"];

    for (const instrument of instruments) {
      if (gptResponse.toUpperCase().includes(instrument)) {
        return instrument;
      }
    }
    return null;
  }
}

// Helper function to generate summary from GPT response
function generateSummaryFromGptResponse(gptResponse: string): string {
  try {
    const parsed = JSON.parse(gptResponse);
    return parsed.prediction || parsed.summary || parsed.analysis?.slice(0, 100) + '...' || 'Analysis complete';
  } catch {
    // Fallback to first 100 characters if JSON parse fails
    return gptResponse.slice(0, 100) + (gptResponse.length > 100 ? '...' : '');
  }
}

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

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || user.passwordHash !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      // Chat analysis endpoints
app.use("/api/chat", analysisRouter);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      if (email) {
        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) {
          return res.status(400).json({ error: "Email already exists" });
        }
      }

      const user = await storage.createUser({
        username,
        passwordHash: password, // In production, hash this password
        email: email || null
      });

      res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  
  app.post("/api/auth/wallet-login", async (req, res) => {
    try {
      const { walletAddress, walletType } = req.body;

      if (!walletAddress || !walletType) {
        return res.status(400).json({ error: "Wallet address and type required" });
      }

      let user = await storage.getUserByWalletAddress(walletAddress);

      if (!user) {
        // Create new user for this wallet
        user = await storage.createUser({
          walletAddress,
          walletType,
          username: `wallet_${walletAddress.slice(0, 8)}`
        });
      }

      res.json({ success: true, user: { id: user.id, username: user.username, walletAddress: user.walletAddress } });
    } catch (error) {
      console.error("Wallet login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/link-wallet", async (req, res) => {
    try {
      const { userId, walletAddress, walletType } = req.body;

      if (!userId || !walletAddress || !walletType) {
        return res.status(400).json({ error: "User ID, wallet address and type required" });
      }

      const user = await storage.linkWalletToUser(userId, walletAddress, walletType);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user: { id: user.id, username: user.username, walletAddress: user.walletAddress } });
    } catch (error) {
      console.error("Link wallet error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Register debug routes
  app.use('/debug', debugRoutes);
  app.post("/api/analyze", async (req, res) => {
  const requestId = uuidv4();

  try {
    const { currentPrompt, injectText, target, similar = [], bundleContext } = req.body || {};

    // validate shape
    if (!currentPrompt || !target?.original || !target?.depth || !target?.edge || !target?.gradient) {
      return res.status(422).json({
        error: "Invalid payload: currentPrompt and target {original,depth,edge,gradient} are required",
        requestId
      });
    }
    if (!Array.isArray(similar) || similar.length > 3) {
      return res.status(422).json({
        error: "Invalid payload: similar must be an array with up to 3 items",
        requestId
      });
    }
    for (const s of similar) {
      if (!s?.original || !s?.depth || !s?.edge || !s?.gradient) {
        return res.status(422).json({
          error: "Each similar requires original, depth, edge, gradient",
          requestId
        });
      }
    }


    // TODO: call your model here using built.system & built.user + image inputs
       const built = buildUnifiedPrompt({
      currentPrompt,
      injectText,
      target,
      similar,
      bundleContext,
      requestId
    });

    log("analyze: prompt built", { tag: "analyze", requestId });

    // Collect all images (target + similars), make absolute for OpenAI
    const all = [
      target.original, target.depth, target.edge, target.gradient,
      ...similar.flatMap((s: any) => [s.original, s.depth, s.edge, s.gradient])
    ];
    const imageUrls = all
      .map((u: string) => toAbsoluteFromReq(req, u))
      .filter(Boolean) as string[];

    try {
      const result = await callOpenAIAnalyze({
        system: built.system,
        user: built.user,
        images: imageUrls,
      });

      return res.status(200).json({
        ok: true,
        requestId,
        promptMeta: built.attachmentsMeta,
        debugPromptId: built.debugPromptId,
        result, // { sessionPrediction, directionBias, confidence, reasoning, rawText }
      });
    } catch (err) {
      logErr(err, { tag: "openai", requestId });
      return res.status(502).json({ error: "OpenAI call failed", requestId });
    }
    
  } catch (err) {
    logErr(err, { tag: "analyze", requestId });
    return res.status(500).json({ error: "Internal error during analysis", requestId });
  }
});
  
  // Smoke test route for RAG validation
  const { smokeTestRAG } = await import('./routes/smoke-test');
  app.get('/api/smoke-test/rag', smokeTestRAG);

  // Document Management API Routes
  const objectStorageService = new ObjectStorageService();

  // Get upload URL for documents
  app.post('/api/documents/upload', async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error('Error getting document upload URL:', error);
      res.status(500).json({ error: 'Failed to get upload URL' });
    }
  });

  // Create document record after upload
  app.post('/api/documents', async (req, res) => {
    try {
      const documentData = insertDocumentSchema.parse(req.body);
      const document = await storage.createDocument(documentData);
      res.json({ success: true, document });
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  // Get user documents
  app.get('/api/documents/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const documents = await storage.getUserDocuments(userId);
      res.json({ documents });
    } catch (error) {
      console.error('Error fetching user documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // Get specific document
  app.get('/api/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ document });
    } catch (error) {
      console.error('Error fetching document:', error);
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Serve documents
  app.get('/documents/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      console.log('Serving document with filename:', filename);

      const documentFile = await objectStorageService.getDocumentFile(`/documents/${filename}`);
      objectStorageService.downloadObject(documentFile, res);
    } catch (error) {
      console.error('Error serving document:', error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: 'Document not found' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Update document
  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const document = await storage.updateDocument(id, updates);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true, document });
    } catch (error) {
      console.error('Error updating document:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // Delete document
  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteDocument(id);
      if (!success) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // Notes API routes
  // Create a new note
  app.post('/api/notes', async (req, res) => {
    try {
      const noteData = insertNoteSchema.parse(req.body);
      const note = await storage.createNote(noteData);
      res.json({ success: true, note });
    } catch (error) {
      console.error('Error creating note:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  });

  // Get user notes
  app.get('/api/notes/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const notes = await storage.getUserNotes(userId);
      res.json({ notes });
    } catch (error) {
      console.error('Error fetching user notes:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  // Get specific note
  app.get('/api/notes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const note = await storage.getNote(id);
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      res.json({ note });
    } catch (error) {
      console.error('Error fetching note:', error);
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  });

  // Update note
  app.patch('/api/notes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const note = await storage.updateNote(id, updates);
      if (!note) {
        return res.status(404).json({ error: 'Note not found' });
      }
      res.json({ success: true, note });
    } catch (error) {
      console.error('Error updating note:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  });

  // Delete note
  app.delete('/api/notes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.deleteNote(id);
      if (!success) {
        return res.status(404).json({ error: 'Note not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting note:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

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

  // Serve attached assets (background images, etc.)
  const attachedAssetsDir = path.join(process.cwd(), 'attached_assets');
  app.use('/attached_assets', express.static(attachedAssetsDir));

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

        // Automatically generate CLIP embedding after upload using unified embeddings service
        try {
          const imagePath = path.join(uploadsDir, chart.filename);
          // Compute hash for caching
          const buf = await fs.readFile(imagePath);
          const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
          
          const embeddingVec = await embedImageToVectorCached(imagePath, sha);
          console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
          console.log("[RAG] query sha", sha, "k=0", { dim: embeddingVec.length, model: EMB_MODEL_ID });
          
          if (embeddingVec && embeddingVec.length === EMB_DIM) {
            const embedding = Array.from(embeddingVec);
            await storage.updateChart(chart.id, { embedding });
            console.log(`✓ Generated CLIP embedding for chart ${chart.id} (${finalInstrument}) - ${EMB_DIM}D vector using ${EMB_MODEL_ID}`);
          } else {
            console.error(`CLIP embedding failed for chart ${chart.id}: wrong dimensions ${embeddingVec?.length || 0}`);
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

  // Embed route - generates CLIP embedding for chart using unified embeddings service
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
      // Compute hash for caching
      const buf = await fs.readFile(imagePath);
      const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
      
      const embeddingVec = await embedImageToVectorCached(imagePath, sha);
      console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
      console.log("[RAG] query sha", sha, "k=0", { dim: embeddingVec.length, model: EMB_MODEL_ID });

      if (embeddingVec && embeddingVec.length === EMB_DIM) {
        const embedding = Array.from(embeddingVec);
        await storage.updateChart(chartId, { embedding });

        res.json({
          success: true,
          embedding: embedding.slice(0, 10), // Return first 10 values for verification
          dimensions: embedding.length,
          model: EMB_MODEL_ID
        });
      } else {
        res.status(500).json({ message: 'CLIP embedding generation failed: wrong dimensions ' + (embeddingVec?.length || 0) });
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

      // Generate CLIP embedding for similarity search using unified embeddings service
      const buf = await fs.readFile(chartImagePath);
      const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
      
      const embeddingVec = await embedImageToVectorCached(chartImagePath, sha);
      console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
      console.log("[RAG] query sha", sha, "k=3", { dim: embeddingVec.length, model: EMB_MODEL_ID });
      
      if (!embeddingVec || embeddingVec.length !== EMB_DIM) {
        return res.status(500).json({ message: 'Failed to generate embedding for similarity search' });
      }
      const embedding = Array.from(embeddingVec);
      const similarCharts = await storage.findSimilarCharts(embedding, 3);
      console.table(similarCharts.map(s => ({ id: s.chart.id, sim: Number(s.similarity).toFixed(4) })));

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

  // NEW: Multi-chart analysis with all visual processing maps
  app.post('/api/analyze/multi-chart', async (req, res) => {
    try {
      const { chartIds } = req.body;

      if (!chartIds || !Array.isArray(chartIds) || chartIds.length === 0) {
        return res.status(400).json({ message: 'Chart IDs array is required' });
      }

      console.log(`📊 Starting multi-chart analysis for ${chartIds.length} charts`);

      // 1. Get all charts and process them
      const multiChartData: MultiChartData[] = [];

      for (const chartId of chartIds) {
        const chart = await storage.getChart(parseInt(chartId));
        if (!chart) {
          console.warn(`⚠️ Chart ${chartId} not found, skipping`);
          continue;
        }

        const chartImagePath = path.join(uploadsDir, chart.filename);

        // Read original chart
        const originalBuffer = await fs.readFile(chartImagePath);
        const originalBase64 = originalBuffer.toString('base64');

        // Read depth map if available
        let depthBase64: string | undefined;
        if (chart.depthMapPath) {
          try {
            const depthPath = path.join(process.cwd(), 'server', chart.depthMapPath);
            const depthBuffer = await fs.readFile(depthPath);
            depthBase64 = depthBuffer.toString('base64');
          } catch (err) {
            console.warn(`⚠️ Could not read depth map for chart ${chartId}`);
          }
        }

        // Read edge map if available
        let edgeBase64: string | undefined;
        if (chart.edgeMapPath) {
          try {
            const edgePath = path.join(process.cwd(), 'server', chart.edgeMapPath);
            const edgeBuffer = await fs.readFile(edgePath);
            edgeBase64 = edgeBuffer.toString('base64');
          } catch (err) {
            console.warn(`⚠️ Could not read edge map for chart ${chartId}`);
          }
        }

        // Read gradient map if available
        let gradientBase64: string | undefined;
        if (chart.gradientMapPath) {
          try {
            const gradientPath = path.join(process.cwd(), 'server', chart.gradientMapPath);
            const gradientBuffer = await fs.readFile(gradientPath);
            gradientBase64 = gradientBuffer.toString('base64');
          } catch (err) {
            console.warn(`⚠️ Could not read gradient map for chart ${chartId}`);
          }
        }

        multiChartData.push({
          original: originalBase64,
          depth: depthBase64,
          edge: edgeBase64,
          gradient: gradientBase64,
          metadata: {
            id: chart.id,
            filename: chart.filename,
            originalName: chart.originalName,
            timeframe: chart.timeframe,
            instrument: chart.instrument,
            session: chart.session || undefined
          }
        });
      }

      if (multiChartData.length === 0) {
        return res.status(404).json({ message: 'No valid charts found' });
      }

      // 2. Get similar charts from the first chart's embedding for RAG context
      let similarCharts: Array<{ chart: any; similarity: number }> = [];
      const firstChart = await storage.getChart(parseInt(chartIds[0]));
      if (firstChart?.embedding && firstChart.embedding.length === 1024) {
        similarCharts = await storage.findSimilarCharts(firstChart.embedding, 3);
        console.log(`🔍 Found ${similarCharts.length} similar charts for RAG context`);
      }

      // 3. Analyze all charts together with GPT-4o
      const prediction = await analyzeMultipleChartsWithAllMaps(multiChartData, similarCharts);

      // 4. Save analysis result for the first chart (representing the multi-chart analysis)
      const analysisData = {
        chartId: parseInt(chartIds[0]),
        gptAnalysis: JSON.stringify(prediction),
        similarCharts: JSON.stringify(similarCharts.slice(0, 3).map(sc => ({
          chartId: sc.chart.id,
          filename: sc.chart.originalName,
          timeframe: sc.chart.timeframe,
          similarity: sc.similarity
        }))),
        confidence: prediction.confidence === 'High' ? 0.9 : prediction.confidence === 'Medium' ? 0.7 : 0.5,
      };

      const validatedAnalysisData = insertAnalysisSchema.parse(analysisData);
      const analysisResult = await storage.createAnalysis(validatedAnalysisData);

      res.json({
        success: true,
        chartId: parseInt(chartIds[0]),
        prediction,
        similarCharts: similarCharts.slice(0, 3).map(sc => ({
          chartId: sc.chart.id,
          filename: sc.chart.originalName,
          timeframe: sc.chart.timeframe,
          instrument: sc.chart.instrument,
          session: sc.chart.session,
          similarity: sc.similarity,
          filePath: `/uploads/${sc.chart.filename}`,
          depthMapUrl: sc.chart.depthMapPath,
          comment: sc.chart.comment
        })),
        analysisId: analysisResult.id,
        chartsProcessed: multiChartData.length,
        visualMapsIncluded: {
          depth: multiChartData.filter(c => c.depth).length,
          edge: multiChartData.filter(c => c.edge).length,
          gradient: multiChartData.filter(c => c.gradient).length
        }
      });

    } catch (error) {
      console.error('❌ Multi-chart analysis error:', error);
      res.status(500).json({ 
        message: 'Multi-chart analysis failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // NEW: Quick Analysis Endpoint - Complete flow identical to normal analysis but temporary processing
  app.post('/api/analyze/quick', upload.array('charts'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const timeframeMapping = req.body.timeframeMapping ? JSON.parse(req.body.timeframeMapping) : {};
      const instrument = req.body.instrument || 'UNKNOWN';
      const session = req.body.session;
      // Extract custom system prompt if provided
      const customSystemPrompt = req.body.system_prompt as string | undefined;
      if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
        console.log('📋 Custom system prompt provided (length:', customSystemPrompt.length, 'chars)');
        console.log('📋 Prompt preview:', customSystemPrompt.substring(0, 200) + '...');
      } else {
        console.log('⚠️ No custom system prompt provided, using default');
      }


      console.log(`🚀 Quick Analysis: Processing ${files.length} charts with complete flow (no database save)`);

      const tempChartData: MultiChartData[] = [];

      // Process each file with complete analysis flow
      for (const file of files) {
        const timeframe = timeframeMapping[file.originalname] || '5M';
        console.log(`🔄 Processing ${file.originalname} (${timeframe}) - Complete visual analysis`);

        // Read original image
        const originalBuffer = await fs.readFile(file.path);
        const originalBase64 = originalBuffer.toString('base64');

        // 1. Generate CLIP embedding for vector similarity search using unified embeddings service
        console.log(`🧠 Generating CLIP embedding for ${file.originalname}`);
        const buf = await fs.readFile(file.path);
        const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
        
        const embeddingVec = await embedImageToVectorCached(file.path, sha);
        let similarCharts: Array<{ chart: any; similarity: number }> = [];

        console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
        console.log("[RAG] query sha", sha, "k=3", { dim: embeddingVec.length, model: EMB_MODEL_ID });

        if (embeddingVec && embeddingVec.length === EMB_DIM) {
          console.log(`🔍 Performing vector similarity search for ${file.originalname}`);
          const embedding = Array.from(embeddingVec);
          similarCharts = await storage.findSimilarCharts(embedding, 3);
          console.table(similarCharts.map(s => ({ id: s.chart.id, sim: Number(s.similarity).toFixed(4) })));
          console.log(`✓ Found ${similarCharts.length} similar charts for RAG context`);
        } else {
          console.warn(`⚠️ Failed to generate embedding for ${file.originalname}, using random charts`);
          const randomCharts = await storage.getAllCharts();
          const limitedCharts = randomCharts.slice(0, 3);
          similarCharts = limitedCharts.map((chart: any) => ({
            chart,
            similarity: 0.5 // Lower default similarity for fallback
          }));
        }

        // 2. Generate MiDaS Depth Map (using same method as normal analysis)
        let depthBase64: string | undefined;
        try {
          const tempDepthPath = path.join(process.cwd(), 'server', 'temp', `quick_depth_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).substr(2, 9)}.png`);
          await fs.mkdir(path.dirname(tempDepthPath), { recursive: true });

          console.log(`🌀 Generating MiDaS depth map for ${file.originalname}`);
          const depthResult = await generateDepthMap(file.path, tempDepthPath);

          if (depthResult.success) {
            const depthBuffer = await fs.readFile(tempDepthPath);
            depthBase64 = depthBuffer.toString('base64');
            console.log(`✓ Generated depth map using ${depthResult.model}`);
          } else {
            console.warn(`⚠️ MiDaS failed, using fallback depth map for ${file.originalname}`);
            // Fallback to simple depth map
            await sharp(file.path)
              .grayscale()
              .blur(2)
              .png()
              .toFile(tempDepthPath);

            const depthBuffer = await fs.readFile(tempDepthPath);
            depthBase64 = depthBuffer.toString('base64');
          }

          // Clean up temp depth file
          await fs.unlink(tempDepthPath).catch(() => {});
        } catch (err) {
          console.warn(`⚠️ Failed to generate depth map for ${file.originalname}:`, err);
        }

        // 3. Convert to Grayscale (intermediate step for edge/gradient maps)
        const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `quick_grayscale_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).substr(2, 9)}.png`);
        await sharp(file.path)
          .grayscale()
          .png()
          .toFile(tempGrayscalePath);

        // 4. Create Edge Map (Sobel/Canny from grayscale)
        let edgeBase64: string | undefined;
        try {
          const tempEdgePath = path.join(process.cwd(), 'server', 'temp', `quick_edge_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).substr(2, 9)}.png`);

          console.log(`🔲 Generating edge map for ${file.originalname}`);
          // Enhanced edge detection using Sobel operator
          await sharp(tempGrayscalePath)
            .convolve({
              width: 3,
              height: 3,
              kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian edge detection
            })
            .normalise()
            .png()
            .toFile(tempEdgePath);

          const edgeBuffer = await fs.readFile(tempEdgePath);
          edgeBase64 = edgeBuffer.toString('base64');
          console.log(`✓ Generated edge map for ${file.originalname}`);

          // Clean up temp edge file
          await fs.unlink(tempEdgePath).catch(() => {});
        } catch (err) {
          console.warn(`⚠️ Failed to generate edge map for ${file.originalname}:`, err);
        }

        // 5. Create Gradient Map (slope/momentum from grayscale)
        let gradientBase64: string | undefined;
        try {
          const tempGradientPath = path.join(process.cwd(), 'server', 'temp', `quick_gradient_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).substr(2, 9)}.png`);

          console.log(`📉 Generating gradient map for ${file.originalname}`);
          // Sobel X operator for horizontal gradient (price momentum)
          await sharp(tempGrayscalePath)
            .convolve({
              width: 3,
              height: 3,
              kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1] // Sobel X
            })
            .normalise()
            .png()
            .toFile(tempGradientPath);

          const gradientBuffer = await fs.readFile(tempGradientPath);
          gradientBase64 = gradientBuffer.toString('base64');
          console.log(`✓ Generated gradient map for ${file.originalname}`);

          // Clean up temp gradient file
          await fs.unlink(tempGradientPath).catch(() => {});
        } catch (err) {
          console.warn(`⚠️ Failed to generate gradient map for ${file.originalname}:`, err);
        }

        // Clean up temp grayscale file
        await fs.unlink(tempGrayscalePath).catch(() => {});

        // 6. Save all generated maps & embeddings temporarily for this analysis session
        tempChartData.push({
          original: originalBase64,
          depth: depthBase64,
          edge: edgeBase64,
          gradient: gradientBase64,
          embedding: Array.from(embeddingVec), // Store embedding temporarily
          similarCharts, // Store similar charts for this specific image
          metadata: {
            id: 0, // Temporary ID for quick analysis
            filename: file.filename,
            originalName: file.originalname,
            timeframe,
            instrument,
            session
          }
        });

        // Clean up uploaded file
        await fs.unlink(file.path).catch(() => {});
      }

      // 7. Compile all into structured GPT-4o system prompt (same as Upload page analysis)
      console.log(`🔍 Starting complete visual analysis for ${tempChartData.length} charts`);
      console.log(`📊 Visual maps generated: ${tempChartData.filter(c => c.depth).length} depth, ${tempChartData.filter(c => c.edge).length} edge, ${tempChartData.filter(c => c.gradient).length} gradient`);

      // 8. Send complete visual stack to GPT-4o for live reasoning
      const prediction = await analyzeMultipleChartsWithAllMaps(tempChartData, [], customSystemPrompt); // Pass customSystemPrompt here

      // 9. Display GPT-4o's response in the Analysis Reasoning panel
      res.json({
        success: true,
        isQuickAnalysis: true,
        chartCount: tempChartData.length,
        prediction,
        similarCharts: [], // No similar charts for quick analysis
        message: `Complete quick analysis for ${tempChartData.length} chart(s) - processed with full visual stack (CLIP, depth, edge, gradient) without saving to dashboard`,
        visualMapsIncluded: {
          depth: tempChartData.filter(c => c.depth).length,
          edge: tempChartData.filter(c => c.edge).length,
          gradient: tempChartData.filter(c => c.gradient).length
        },
        embeddingsGenerated: tempChartData.filter(c => c.embedding && c.embedding.length === 1024).length,
        vectorSearchPerformed: tempChartData.filter(c => c.similarCharts && c.similarCharts.length > 0).length
      });

    } catch (error) {
      console.error('❌ Quick analysis error:', error);
      res.status(500).json({ 
        message: 'Quick analysis failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // NEW: RAG-powered chart analysis endpoint
  app.post('/api/analyze/:chartId', async (req, res) => {
    try {
      const chartId = parseInt(req.params.chartId);
      const customSystemPrompt = req.body.system_prompt;

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

      if (chart.embedding && chart.embedding.length === 1024) {
        similarCharts = await storage.findSimilarCharts(chart.embedding, 3);
        console.log(`Found ${similarCharts.length} similar charts for RAG context`);
      } else {
        console.log('No embedding available for similarity search');
      }

      // 3. Prepare depth map path
      const depthMapPath = chart.depthMapPath;

      // 4. Call GPT-4o with RAG context and custom system prompt
      const prediction = await analyzeChartWithRAG(chartImagePath, depthMapPath, similarCharts, customSystemPrompt);

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
      const timeframe = (req.query.timeframe as string) || "all";
      const instrument = (req.query.instrument as string) || "all";
      console.log(`🔍 Filter request - Timeframe: "${timeframe}", Instrument: "${instrument}"`);
      const charts = await storage.getAllCharts(timeframe, instrument);
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

  // Get individual chart by ID
  app.get('/api/charts/:id', async (req, res) => {
    try {
      const chartId = parseInt(req.params.id);
      if (isNaN(chartId)) {
        return res.status(400).json({ error: 'Invalid chart ID' });
      }

      const chart = await storage.getChart(chartId);
      if (!chart) {
        return res.status(404).json({ error: 'Chart not found' });
      }

      // Include all map paths
      const chartWithPaths = {
        ...chart,
        filePath: `/uploads/${chart.filename}`,
        depthMapUrl: chart.depthMapPath,
        edgeMapUrl: chart.edgeMapPath,
        gradientMapUrl: chart.gradientMapPath
      };

      res.json(chartWithPaths);
    } catch (error) {
      console.error('Get chart error:', error);
      res.status(500).json({ error: 'Failed to get chart: ' + (error as Error).message });
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
            const instrument = (req.query.instrument as string) || "all";
      const bundles = await storage.getAllBundles(instrument);

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
      const customSystemPrompt = req.body.system_prompt;
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

      // Generate bundle analysis using multi-timeframe context and custom system prompt
      const bundleMetadata = JSON.parse(bundle.metadata);
      const analysis = await analyzeBundleWithGPT(chartData, bundleMetadata, customSystemPrompt);

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

          // Generate CLIP embedding using unified embeddings service
          const buf = await fs.readFile(chartPath);
          const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
          
          const embeddingVec = await embedImageToVectorCached(chartPath, sha);
          console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
          console.log("[RAG] query sha", sha, "k=0", { dim: embeddingVec.length, model: EMB_MODEL_ID });

          if (embeddingVec && embeddingVec.length === EMB_DIM) {
            // Update chart with new embedding
            const embedding = Array.from(embeddingVec);
            await storage.updateChart(chart.id, { embedding });
            console.log(`✅ Updated CLIP embedding for chart ${chart.id} (${chart.filename}) - ${EMB_DIM}D vector using ${EMB_MODEL_ID}`);
            successCount++;
          } else {
            console.log(`❌ Failed to generate valid embedding for chart ${chart.id} (${chart.filename}) - wrong dimensions ${embeddingVec?.length || 0}`);
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

  // Admin route for backfilling visual maps
  app.post('/api/admin/backfill-visual-maps', async (req, res) => {
    try {
      console.log('🔧 Starting visual maps backfill...');
      const result = await backfillAllVisualMaps();
      
      res.json({
        success: true,
        message: `Visual maps backfill complete`,
        details: {
          successful: result.success,
          failed: result.failed,
          total: result.success + result.failed
        }
      });
    } catch (error) {
      console.error('Visual maps backfill error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Visual maps backfill failed: ' + (error as Error).message 
      });
    }
  });

  // Watchlist API Routes
  app.get('/api/watchlist', async (req, res) => {
    try {
      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';
      const watchlist = await storage.getUserWatchlist(userId);

      res.json({
        success: true,
        watchlist
      });
    } catch (error) {
      console.error('Get watchlist error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get watchlist: ' + (error as Error).message 
      });
    }
  });

  app.post('/api/watchlist', async (req, res) => {
    try {
      const { symbol } = req.body;

      if (!symbol) {
        return res.status(400).json({ message: 'Symbol is required' });
      }

      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';

      // Check if symbol already exists in watchlist
      const existingWatchlist = await storage.getUserWatchlist(userId);
      const exists = existingWatchlist.some(item => item.symbol === symbol);

      if (exists) {
        return res.status(400).json({ message: 'Symbol already in watchlist' });
      }

      const watchlistItem = await storage.addToWatchlist({
        userId,
        symbol
      });

      res.json({
        success: true,
        watchlistItem
      });
    } catch (error) {
      console.error('Add to watchlist error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to add to watchlist: ' + (error as Error).message 
      });
    }
  });

  app.delete('/api/watchlist/:symbol', async (req, res) => {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({ message: 'Symbol is required' });
      }

      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';

      await storage.removeFromWatchlist(userId, symbol);

      res.json({
        success: true,
        message: 'Symbol removed from watchlist'
      });
    } catch (error) {
      console.error('Remove from watchlist error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to remove from watchlist: ' + (error as Error).message 
      });
    }
  });

  // Import the TradingView watchlist from URL
  app.post('/api/watchlist/import-url', async (req, res) => {
    try {
      const { url } = req.body;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: "Valid TradingView watchlist URL is required" 
        });
      }

      // Validate TradingView URL format
      const urlPattern = /^https:\/\/(?:www\.)?tradingview\.com\/watchlists\/\d+\/?$/;
      if (!urlPattern.test(url)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid TradingView watchlist URL format. Expected: https://www.tradingview.com/watchlists/12345/" 
        });
      }

      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';

      // Import symbols from URL
      const importedSymbols = await storage.importWatchlistFromURL(url, userId);

      res.json({ 
        success: true, 
        message: `Successfully imported ${importedSymbols.length} symbols`,
        symbols: importedSymbols 
      });
    } catch (error) {
      console.error("Error importing watchlist from URL:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to import watchlist. Please check the URL and try again." 
      });
    }
  });

  // Chart Layout API Routes
  app.get('/api/chart-layout', async (req, res) => {
    try {
      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';
      const layout = await storage.getUserChartLayout(userId);

      res.json({
        success: true,
        layout
      });
    } catch (error) {
      console.error('Get chart layout error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get chart layout: ' + (error as Error).message 
      });
    }
  });

  app.post('/api/chart-layout', async (req, res) => {
    try {
      const { layoutConfig } = req.body;

      if (!layoutConfig) {
        return res.status(400).json({ message: 'Layout configuration is required' });
      }

      // For now, use a hardcoded userId since we don't have authentication
      const userId = 'temp-user-id';

      const layout = await storage.saveChartLayout({
        userId,
        layoutConfig
      });

      res.json({
        success: true,
        layout
      });
    } catch (error) {
      console.error('Save chart layout error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to save chart layout: ' + (error as Error).message 
      });
    }
  });

  // ===== NEW: Chart Analysis History & Prompt History API Routes =====

  // GET /api/analysis-history → Fetches user's past chart analysis sessions
  app.get('/api/analysis-history', async (req, res) => {
    try {
      // For now, use demo user id - in production this would come from authentication
      const userId = 'demo-user-id'; // TODO: Replace with actual user authentication

      const sessions = await storage.getUserAnalysisSessions(userId);

      // Transform sessions for frontend consumption
      const transformedSessions = sessions.map(session => ({
        id: session.id,
        timestamp: session.createdAt,
        instrument: extractInstrumentFromResponse(session.gptResponse) || 'UNKNOWN',
        summary: generateSummaryFromGptResponse(session.gptResponse),
        chartImageUrl: session.chartImageUrl,
        depthMapUrl: session.depthMapUrl,
        edgeMapUrl: session.edgeMapUrl,
        gradientMapUrl: session.gradientMapUrl,
        vectorMatches: session.vectorMatches,
        gptResponse: session.gptResponse,
        systemPrompt: session.systemPrompt
      }));

      res.json({
        success: true,
        sessions: transformedSessions
      });
    } catch (error) {
      console.error('Get analysis history error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get analysis history: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // GET /api/prompt-history → Fetches user's historical prompts
  app.get('/api/prompt-history', async (req, res) => {
    try {
      // For now, use demo user id - in production this would come from authentication
      const userId = 'demo-user-id'; // TODO: Replace with actual user authentication

      const prompts = await storage.getUserPromptHistory(userId);

      // Transform prompts for frontend consumption
      const transformedPrompts = prompts.map(prompt => ({
        id: prompt.id,
        timestamp: prompt.createdAt,
        promptType: prompt.promptType,
        promptContent: prompt.promptContent,
        previewText: prompt.promptContent.slice(0, 100) + (prompt.promptContent.length > 100 ? '...' : '')
      }));

      res.json({
        success: true,
        prompts: transformedPrompts
      });
    } catch (error) {
      console.error('Get prompt history error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to get prompt history: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // POST /api/save-analysis-session → Saves new analysis session after GPT-4o response
  app.post('/api/save-analysis-session', async (req, res) => {
    try {
      const { 
        systemPrompt,
        chartImageUrl,
        depthMapUrl,
        edgeMapUrl,
        gradientMapUrl,
        vectorMatches,
        gptResponse
      } = req.body;

      if (!systemPrompt || !chartImageUrl || !gptResponse) {
        return res.status(400).json({ 
          success: false,
          message: 'Missing required fields: systemPrompt, chartImageUrl, gptResponse' 
        });
      }

      // For now, use demo user id - in production this would come from authentication  
      const userId = 'demo-user-id'; // TODO: Replace with actual user authentication

      const session = await storage.createAnalysisSession({
        userId,
        systemPrompt,
        chartImageUrl,
        depthMapUrl: depthMapUrl || null,
        edgeMapUrl: edgeMapUrl || null,
        gradientMapUrl: gradientMapUrl || null,
        vectorMatches: vectorMatches || null,
        gptResponse
      });

      res.json({
        success: true,
        sessionId: session.id,
        message: 'Analysis session saved successfully'
      });
    } catch (error) {
      console.error('Save analysis session error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to save analysis session: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // POST /api/save-prompt-version → Saves a prompt version when user customizes/injects
  app.post('/api/save-prompt-version', async (req, res) => {
    try {
      const { promptType, promptContent } = req.body;

      if (!promptType || !promptContent) {
        return res.status(400).json({ 
          success: false,
          message: 'Missing required fields: promptType, promptContent' 
        });
      }

      // Validate prompt type
      const validPromptTypes = ['default', 'custom', 'injected'];
      if (!validPromptTypes.includes(promptType)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid promptType. Must be one of: default, custom, injected' 
        });
      }

      // For now, use demo user id - in production this would come from authentication
      const userId = 'demo-user-id'; // TODO: Replace with actual user authentication

      const prompt = await storage.createPromptHistory({
        userId,
        promptType,
        promptContent
      });

      res.json({
        success: true,
        promptId: prompt.id,
        message: 'Prompt version saved successfully'
      });
    } catch (error) {
      console.error('Save prompt version error:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to save prompt version: ' + (error instanceof Error ? error.message : 'Unknown error') 
      });
    }
  });

  // Chat routes
  const { 
    getChatConversations, 
    createChatConversation, 
    getConversationMessages, 
    sendChatMessage,
    uploadChatImage
  } = await import('./chat-routes');

  app.get('/api/chat/conversations', getChatConversations);
  app.post('/api/chat/conversations', createChatConversation);
  app.get('/api/chat/conversations/:conversationId/messages', getConversationMessages);
  app.post('/api/chat/conversations/:conversationId/messages', sendChatMessage);
  app.post('/api/chat/upload-image', uploadChatImage);
    // Chat analysis (new)
app.post('/api/chat/analyze', async (req, res, next) => {
  try {
    // Accept common aliases from various frontends
    const rawPrompt =
      (req.body?.prompt ??
       req.body?.message ??
       req.body?.text ??
       req.body?.content ??
       "");

    // normalize
    const prompt = (typeof rawPrompt === "string" ? rawPrompt : "").trim();
    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    const systemPrompt = typeof req.body?.systemPrompt === "string" ? req.body.systemPrompt : "";
    const wantSimilar = typeof req.body?.wantSimilar === "boolean" ? req.body.wantSimilar : true;

    // Accept text or images; synthesize a minimal prompt if only images are provided
    let finalPrompt = prompt;
    if (!finalPrompt && images.length > 0) {
      finalPrompt = "[AUTOGEN] Image-only analysis request. Use systemPrompt + images + similar charts.";
    }
    // Persist first image if it is a data URL, so the UI & OpenAI can load it
const uploadsDir = path.join(process.cwd(), "server", "uploads");
try {
  await fs.mkdir(uploadsDir, { recursive: true });
} catch {}

if (images.length > 0 && typeof images[0] === "string" && images[0].startsWith("data:")) {
  try {
    const m = images[0].match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
    if (m) {
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const b64 = m[2];
      const filename = `chat-${Math.floor(Date.now() / 1000)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const full = path.join(uploadsDir, filename);
      await fs.writeFile(full, Buffer.from(b64, "base64"));
      // Replace data URL with a static URL that Express serves
      images[0] = `/uploads/${filename}`;
    }
  } catch (e) {
    console.warn("[/api/chat/analyze] Could not persist data URL:", e);
  }
}
    // Persist first image if it is a data URL so UI can click/open it
  

    
    // If absolutely nothing was sent, reject
    if (!finalPrompt && images.length === 0) {
      return res.status(400).json({
        error: "Missing input. Provide `text`/`prompt`/`message`/`content` or at least one image."
      });
    }
    
   // Debug log (expanded)
console.log("[express] POST /api/chat/analyze ::", {
  bodyKeys: Object.keys(req.body || {}),
  promptSource: (
    "prompt"  in (req.body || {}) ? "prompt"  :
    "message" in (req.body || {}) ? "message" :
    "text"    in (req.body || {}) ? "text"    :
    "content" in (req.body || {}) ? "content" : "none"
  ),
  promptPreview: finalPrompt.slice(0, 80),
  promptLength: finalPrompt.length,
  imageCount: images.length,
  hasSystemPrompt: !!systemPrompt,
  wantSimilar,
});

// Build absolute URLs so OpenAI can download images
const origin =
  process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get("host")}`;

const toAbs = (u: any) =>
  (typeof u === "string" && u.startsWith("/")) ? origin + u : u;

const modelImages = images.map(toAbs);


    // Lazy import to avoid top-level coupling
const { generateAnalysis } = await import("./services/unified-analysis");

const result = await generateAnalysis({
  prompt: finalPrompt,
  images: modelImages,
  systemPrompt,
  wantSimilar,
});

return res.json(result);
} catch (e: any) {
  console.error("[/api/chat/analyze] error:", e);
  return res.status(500).json({ error: e?.message ?? "Internal Server Error" });
}
}); // <- closes app.post("/api/chat/analyze", ...)
  

  const httpServer = createServer(app);
  return httpServer;
}

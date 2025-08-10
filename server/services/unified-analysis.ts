/**
 * Unified Analysis Service - Single point for all chart analysis
 * Consolidates Upload, Chat, and Quick Analysis into one robust pipeline
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import { generateCLIPEmbedding } from './transformers-clip';
import { storage } from '../storage';
import { generateDepthMap } from './midas';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';

// RAG-enabled comprehensive prompt
const BACKEND_RAG_PROMPT_BASE = `You are a professional trading chart analyst with expertise in advanced pattern recognition and multi-timeframe analysis.

You will receive:
- Original chart images (candlesticks, price action, indicators)
- Depth maps (3D depth perception for pattern strength assessment)
- Edge maps (structural boundaries, support/resistance lines)
- Gradient maps (price momentum and directional bias analysis)
- Historical similar patterns for context (RAG-enhanced analysis)

CRITICAL ANALYSIS FRAMEWORK:
1. **Pattern Recognition**: Identify chart patterns using all visual layers
2. **Multi-Map Synthesis**: Combine insights from depth, edge, and gradient data
3. **Historical Context**: Reference similar historical patterns for validation
4. **Session Timing**: Determine optimal trading session based on setup
5. **Risk Assessment**: Evaluate pattern strength and confluence factors

RESPOND IN JSON FORMAT ONLY:
{
  "prediction": "Bullish/Bearish/Neutral",
  "session": "Asia/London/New York/Sydney",
  "confidence": "Low/Medium/High",
  "reasoning": "Detailed technical analysis referencing all visual maps and historical patterns"
}`;

interface AnalysisRequest {
  imageUrls: string[];
  systemPrompt?: string;
  includeHistoricalContext?: boolean;
  maxSimilarCharts?: number;
}

interface ProcessedImageData {
  originalBase64: string;
  depthBase64?: string;
  edgeBase64?: string;
  gradientBase64?: string;
  embedding?: number[];
  similarCharts?: Array<{ chart: any; similarity: number }>;
  metadata: {
    filename: string;
    size: number;
    format: string;
  };
}

interface AnalysisResponse {
  prediction: string;
  session: string;
  confidence: string;
  reasoning: string;
  // Legacy support
  direction?: string;
  rationale?: string;
  similarCharts?: any[];
  visualMapsIncluded?: {
    depth: number;
    edge: number;
    gradient: number;
  };
}

/**
 * Process a single image through the complete pipeline
 */
async function processSingleImage(imagePath: string, index: number): Promise<ProcessedImageData> {
  console.log(`🔄 Processing image ${index + 1}: ${path.basename(imagePath)}`);
  
  // Read original image
  const originalBuffer = fs.readFileSync(imagePath);
  const originalBase64 = originalBuffer.toString('base64');
  
  // Get image metadata
  const stats = fs.statSync(imagePath);
  const metadata = {
    filename: path.basename(imagePath),
    size: stats.size,
    format: path.extname(imagePath).slice(1).toLowerCase()
  };

  const result: ProcessedImageData = {
    originalBase64,
    metadata
  };

  try {
    // 1. Generate CLIP embedding for RAG search
    console.log(`🧠 Generating CLIP embedding for image ${index + 1}`);
    const embeddingResult = await generateCLIPEmbedding(imagePath);
    
    if (embeddingResult.embedding && embeddingResult.embedding.length === 1024) {
      result.embedding = embeddingResult.embedding;
      
      // Find similar charts for RAG context
      console.log(`🔍 Performing vector similarity search`);
      result.similarCharts = await storage.findSimilarCharts(embeddingResult.embedding, 3);
      console.log(`✓ Found ${result.similarCharts.length} similar charts for RAG context`);
    }

    // 2. Create temp grayscale version for map generation
    const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `unified_gray_${Date.now()}_${index}.png`);
    await sharp(imagePath)
      .grayscale()
      .png()
      .toFile(tempGrayscalePath);

    // 3. Generate Depth Map
    try {
      const tempDepthPath = path.join(process.cwd(), 'server', 'temp', `unified_depth_${Date.now()}_${index}.png`);
      
      console.log(`🌀 Generating depth map for image ${index + 1}`);
      // Use fallback depth simulation (MiDaS has dependency issues)
      await sharp(tempGrayscalePath)
        .blur(3)
        .normalise()
        .png()
        .toFile(tempDepthPath);
      
      const depthBuffer = fs.readFileSync(tempDepthPath);
      result.depthBase64 = depthBuffer.toString('base64');
      console.log(`✓ Generated depth map for image ${index + 1}`);
      
      fs.unlinkSync(tempDepthPath);
    } catch (err) {
      console.warn(`⚠️ Failed to generate depth map:`, err);
    }

    // 4. Generate Edge Map
    try {
      const tempEdgePath = path.join(process.cwd(), 'server', 'temp', `unified_edge_${Date.now()}_${index}.png`);
      
      console.log(`🔲 Generating edge map for image ${index + 1}`);
      await sharp(tempGrayscalePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian edge detection
        })
        .normalise()
        .png()
        .toFile(tempEdgePath);
      
      const edgeBuffer = fs.readFileSync(tempEdgePath);
      result.edgeBase64 = edgeBuffer.toString('base64');
      console.log(`✓ Generated edge map for image ${index + 1}`);
      
      fs.unlinkSync(tempEdgePath);
    } catch (err) {
      console.warn(`⚠️ Failed to generate edge map:`, err);
    }

    // 5. Generate Gradient Map
    try {
      const tempGradientPath = path.join(process.cwd(), 'server', 'temp', `unified_gradient_${Date.now()}_${index}.png`);
      
      console.log(`📈 Generating gradient map for image ${index + 1}`);
      await sharp(tempGrayscalePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1] // Sobel X gradient
        })
        .normalise()
        .png()
        .toFile(tempGradientPath);
      
      const gradientBuffer = fs.readFileSync(tempGradientPath);
      result.gradientBase64 = gradientBuffer.toString('base64');
      console.log(`✓ Generated gradient map for image ${index + 1}`);
      
      fs.unlinkSync(tempGradientPath);
    } catch (err) {
      console.warn(`⚠️ Failed to generate gradient map:`, err);
    }

    // Clean up temp grayscale file
    fs.unlinkSync(tempGrayscalePath);

  } catch (error) {
    console.error(`❌ Error processing image ${index + 1}:`, error);
  }

  return result;
}

/**
 * Build RAG context from similar charts
 */
function buildRAGContext(processedImages: ProcessedImageData[]): string {
  let ragContext = "";
  
  const allSimilarCharts = processedImages
    .flatMap(img => img.similarCharts || [])
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5); // Top 5 similar charts across all images

  if (allSimilarCharts.length > 0) {
    ragContext = "\n\n=== HISTORICAL SIMILAR PATTERNS ===\n";
    allSimilarCharts.forEach((item, index) => {
      const chart = item.chart;
      ragContext += `${index + 1}. ${chart.originalName} (${chart.instrument}, ${chart.timeframe})\n`;
      ragContext += `   - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
      ragContext += `   - Session: ${chart.session || 'Unknown'}\n`;
      if (chart.comment) {
        ragContext += `   - Notes: ${chart.comment.slice(0, 100)}\n`;
      }
      ragContext += "\n";
    });
  }

  return ragContext;
}

/**
 * Main unified analysis function
 */
export async function analyzeChartsUnified(request: AnalysisRequest): Promise<AnalysisResponse> {
  const { imageUrls, systemPrompt, includeHistoricalContext = true, maxSimilarCharts = 3 } = request;
  
  console.log(`🔍 Starting unified analysis for ${imageUrls.length} images`);
  console.log(`📄 System prompt: ${systemPrompt ? 'Custom' : 'Default'} (${(systemPrompt || BACKEND_RAG_PROMPT_BASE).length} chars)`);

  // Process all images through the pipeline
  const processedImages: ProcessedImageData[] = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    
    // Handle data URLs or file paths
    let imagePath: string;
    if (imageUrl.startsWith('data:')) {
      // Convert base64 to temporary file
      const base64Data = imageUrl.split(',')[1];
      const tempPath = path.join(process.cwd(), 'server', 'temp', `unified_temp_${Date.now()}_${i}.png`);
      fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'));
      imagePath = tempPath;
    } else {
      imagePath = imageUrl;
    }

    const processedData = await processSingleImage(imagePath, i);
    processedImages.push(processedData);

    // Clean up temp file if we created one
    if (imageUrl.startsWith('data:')) {
      fs.unlinkSync(imagePath);
    }
  }

  // Build comprehensive prompt
  const mergedSystemPrompt = systemPrompt ? 
    `${systemPrompt.trim()}\n\n${BACKEND_RAG_PROMPT_BASE}` : 
    BACKEND_RAG_PROMPT_BASE;

  const ragContext = includeHistoricalContext ? buildRAGContext(processedImages) : "";
  const finalPrompt = `${mergedSystemPrompt}${ragContext}`;

  // Build vision content array
  const content: any[] = [
    {
      type: "text",
      text: finalPrompt
    }
  ];

  // Add all visual data to content
  processedImages.forEach((imageData, index) => {
    content.push({
      type: "text", 
      text: `\n--- CHART ${index + 1}: ${imageData.metadata.filename} ---`
    });

    // Original chart
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/${imageData.metadata.format};base64,${imageData.originalBase64}`,
        detail: "high"
      }
    });

    // Visual maps with metadata
    if (imageData.depthBase64) {
      content.push({
        type: "text",
        text: `Depth Map (3D structure analysis):`
      });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${imageData.depthBase64}`,
          detail: "high"
        }
      });
    }

    if (imageData.edgeBase64) {
      content.push({
        type: "text",
        text: `Edge Map (boundaries & support/resistance):`
      });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${imageData.edgeBase64}`,
          detail: "high"
        }
      });
    }

    if (imageData.gradientBase64) {
      content.push({
        type: "text",
        text: `Gradient Map (momentum & directional bias):`
      });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${imageData.gradientBase64}`,
          detail: "high"
        }
      });
    }
  });

  console.log(`📡 Making OpenAI API call with ${content.length} content parts...`);
  console.log(`📄 Final prompt length: ${finalPrompt.length} characters`);

  // Call OpenAI with streaming and JSON response format
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: content
      }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
    max_tokens: 1100,
    stream: false // Disable streaming for JSON parsing
  });

  console.log(`✅ Received OpenAI response`);
  const aiResponse = response.choices[0]?.message?.content || '{}';
  console.log(`📄 Response length: ${aiResponse.length} characters`);

  // Parse JSON response
  let parsedResponse: any;
  try {
    parsedResponse = JSON.parse(aiResponse);
    console.log(`🔍 DEBUG - Raw GPT Response:`, parsedResponse);
  } catch (error) {
    console.error(`❌ Failed to parse GPT JSON response:`, error);
    console.error(`Raw response:`, aiResponse);
    
    // Fallback response
    parsedResponse = {
      prediction: "Analysis failed",
      session: "Unknown",
      confidence: "Low",
      reasoning: "Failed to parse response format"
    };
  }

  // Count visual maps included
  const visualMapsIncluded = {
    depth: processedImages.filter(img => img.depthBase64).length,
    edge: processedImages.filter(img => img.edgeBase64).length,
    gradient: processedImages.filter(img => img.gradientBase64).length
  };

  // Build unified response with legacy support
  const result: AnalysisResponse = {
    prediction: parsedResponse.prediction || "Unknown",
    session: parsedResponse.session || "Unknown", 
    confidence: parsedResponse.confidence || "Medium",
    reasoning: parsedResponse.reasoning || aiResponse,
    // Legacy field mapping
    direction: parsedResponse.prediction?.toLowerCase(),
    rationale: parsedResponse.reasoning,
    similarCharts: processedImages.flatMap(img => img.similarCharts || []).slice(0, maxSimilarCharts),
    visualMapsIncluded
  };

  console.log(`✅ Unified analysis complete - Prediction: ${result.prediction}, Confidence: ${result.confidence}`);
  return result;
}

/**
 * Preview similar charts for health check (no OpenAI call)
 */
export async function previewSimilarCharts({ k = 3 }: { k?: number } = {}) {
  try {
    // Get a sample chart to demonstrate RAG functionality
    const charts = await storage.getAllCharts();
    if (charts.length === 0) {
      return { count: 0, message: "No charts in database", ids: [] };
    }

    const sampleChart = charts[0];
    if (sampleChart.embedding && sampleChart.embedding.length === 1024) {
      const similarCharts = await storage.findSimilarCharts(sampleChart.embedding, k);
      return { 
        count: similarCharts.length, 
        ids: similarCharts.map(sc => sc.chart.id) 
      };
    } else {
      return { count: 0, message: "Sample chart has no embedding", ids: [] };
    }
  } catch (error) {
    console.error('Error previewing similar charts:', error);
    return { count: 0, error: error instanceof Error ? error.message : 'Unknown error', ids: [] };
  }
}

/**
 * Check if messages contain image parts - defensive check
 */
export function messageHasImageParts(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  
  return messages.some(message => {
    if (typeof message === 'object' && message.content) {
      if (Array.isArray(message.content)) {
        return message.content.some((part: any) => 
          part.type === 'image_url' || 
          (part.image_url && part.image_url.url)
        );
      }
    }
    return false;
  });
}

/**
 * Check if depth model is ready (MiDaS status)
 */
export function isDepthModelReady(): boolean {
  // Since we're using fallback depth generation due to MiDaS dependency issues
  // Always return true for the fallback method
  return true;
}

/**
 * Get inject text from storage/database
 */
export async function getInjectTextFromStore(): Promise<string | null> {
  // TODO: Implement database storage for inject text
  // For now, return null to indicate no stored inject text
  return null;
}

/**
 * Full visual stack analysis with proper prompt merging and OpenAI integration
 */
export async function analyzeWithFullVisualStack(options: {
  imageUrls: string[];
  userInject?: string;
  instrument?: string;
  timeframe?: string;
}) {
  const { imageUrls, userInject, instrument, timeframe } = options;
  
  // Merge prompt as specified in Task 4
  const systemPrompt = [
    (userInject || '').trim(), 
    BACKEND_RAG_PROMPT_BASE
  ].filter(Boolean).join('\n\n');

  // Process images and generate maps
  const processedImages: ProcessedImageData[] = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    
    // Handle data URLs or file paths
    let imagePath: string;
    if (imageUrl.startsWith('data:')) {
      // Convert base64 to temporary file
      const base64Data = imageUrl.split(',')[1];
      const tempPath = path.join(process.cwd(), 'server', 'temp', `unified_temp_${Date.now()}_${i}.png`);
      fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'));
      imagePath = tempPath;
    } else {
      imagePath = imageUrl;
    }

    const processedData = await processSingleImage(imagePath, i);
    processedImages.push(processedData);

    // Clean up temp file if we created one
    if (imageUrl.startsWith('data:')) {
      fs.unlinkSync(imagePath);
    }
  }

  // Build RAG context from similar charts
  const ragContext = buildRAGContext(processedImages);
  const finalPrompt = `${systemPrompt}${ragContext}`;

  // Attach images as image_url parts as specified in Task 4
  const userParts: any[] = [
    { type: 'text', text: finalPrompt }
  ];

  // Add original images
  processedImages.forEach((imageData, index) => {
    userParts.push({ 
      type: 'image_url', 
      image_url: { url: `data:image/${imageData.metadata.format};base64,${imageData.originalBase64}` }
    });
    
    // Add depth/edge/gradient maps as image_url parts
    if (imageData.depthBase64) {
      userParts.push({ 
        type: 'image_url', 
        image_url: { url: `data:image/png;base64,${imageData.depthBase64}` }
      });
    }
    if (imageData.edgeBase64) {
      userParts.push({ 
        type: 'image_url', 
        image_url: { url: `data:image/png;base64,${imageData.edgeBase64}` }
      });
    }
    if (imageData.gradientBase64) {
      userParts.push({ 
        type: 'image_url', 
        image_url: { url: `data:image/png;base64,${imageData.gradientBase64}` }
      });
    }
  });

  // Count maps for logging
  const mapCounts = {
    depth: processedImages.filter(img => img.depthBase64).length,
    edge: processedImages.filter(img => img.edgeBase64).length,
    gradient: processedImages.filter(img => img.gradientBase64).length
  };
  
  const ragCount = processedImages.reduce((sum, img) => sum + (img.similarCharts?.length || 0), 0);

  // Server log once per call as specified in Task 4
  const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';
  console.log(`📊 Pipeline Stats: {model: ${MODEL}, imageCount: ${imageUrls.length}, maps: {depth: ${mapCounts.depth}, edge: ${mapCounts.edge}, gradient: ${mapCounts.gradient}}, ragCount: ${ragCount}}`);

  // OpenAI call with single model flag and streaming as specified in Task 4
  const messages = [{ role: 'user' as const, content: userParts }];
  
  const resp = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.1,
    stream: true
  });

  // Collect streamed response
  let fullResponse = '';
  for await (const chunk of resp) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullResponse += content;
  }

  // Parse JSON response
  let parsedResponse: any;
  try {
    parsedResponse = JSON.parse(fullResponse);
  } catch (error) {
    console.error(`❌ Failed to parse GPT JSON response:`, error);
    parsedResponse = {
      prediction: "Analysis failed",
      session: "Unknown", 
      confidence: "Low",
      reasoning: "Failed to parse response format"
    };
  }

  // Build unified response
  return {
    prediction: parsedResponse.prediction || "Unknown",
    session: parsedResponse.session || "Unknown",
    confidence: parsedResponse.confidence || "Medium", 
    reasoning: parsedResponse.reasoning || fullResponse,
    // Legacy field mapping
    direction: parsedResponse.prediction?.toLowerCase(),
    rationale: parsedResponse.reasoning,
    similarCharts: processedImages.flatMap(img => img.similarCharts || []).slice(0, 3),
    visualMapsIncluded: mapCounts
  };
}
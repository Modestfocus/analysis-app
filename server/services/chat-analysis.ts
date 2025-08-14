/**
 * Chat-specific analysis service that reuses Quick Chart Analysis pipeline
 * Processes images with depth/edge/gradient maps and sends them as vision parts
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import { embedImageToVectorCached, EMB_DIM, EMB_MODEL_ID } from './embeddings';
import { getTopSimilarCharts } from './retrieval';
import { storage } from '../storage';
import { buildUnifiedPrompt, ChartMaps } from './prompt-builder';
import { getCurrentPrompt } from './system-prompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';

interface ChatAnalysisRequest {
  content: any[]; // Array of text and image_url parts
  systemPrompt: string;
}

interface ChatAnalysisResponse {
  prediction: string;
  session: string;
  confidence: string;
  reasoning: string;
  // Support legacy field names
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
 * Process uploaded images and generate visual maps (same as Quick Chart Analysis)
 */
async function processImagesWithMaps(imageUrls: string[], req?: any) {
  const processedData = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    console.log(`🔄 Processing image ${i + 1}/${imageUrls.length} for chat analysis`);
    
    // Handle data URLs (base64) or file paths
    let imagePath: string;
    if (imageUrl.startsWith('data:')) {
      // Convert base64 to temporary file
      const base64Data = imageUrl.split(',')[1];
      const tempPath = path.join(process.cwd(), 'server', 'temp', `chat_temp_${Math.floor(Date.now() / 1000)}_${i}.png`);
      fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'));
      imagePath = tempPath;
    } else {
      imagePath = imageUrl;
    }

    try {
      // 1. Generate CLIP embedding for RAG search using cached method
      console.log(`🧠 Generating CLIP embedding for chat image ${i + 1}`);
      
      // Compute hash for caching
      const crypto = await import('crypto');
      const buf = fs.readFileSync(imagePath);
      const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
      
      const embeddingVec = await embedImageToVectorCached(imagePath, sha);
      let similarCharts: Array<{ chart: any; similarity: number }> = [];
      
      // Dimension guardrail
      console.assert(embeddingVec.length === EMB_DIM, "query dim mismatch");
      console.log("[RAG] query sha", sha, "k=3", { dim: embeddingVec.length, model: EMB_MODEL_ID });
      
      if (embeddingVec && embeddingVec.length === EMB_DIM) {
        console.log(`🔍 Performing vector similarity search for chat image ${i + 1}`);
        const embedding = Array.from(embeddingVec);
        const neighbors = await getTopSimilarCharts(embedding, 3);
        
        // Map to expected format
        similarCharts = neighbors.map(n => ({
          chart: {
            id: n.id,
            filename: n.filename,
            timeframe: n.timeframe,
            instrument: n.instrument,
            depthMapPath: n.depthMapPath ?? `/depthmaps/depth_chart_${n.id}.png`,
            edgeMapPath: n.edgeMapPath ?? `/edgemaps/edge_chart_${n.id}.png`,
            gradientMapPath: n.gradientMapPath ?? `/gradientmaps/gradient_chart_${n.id}.png`,
          },
          similarity: n.similarity, // float 0..1
        }));
        
        console.log(`✓ Found ${similarCharts.length} similar charts for RAG context`);
      } else {
        console.warn(`⚠️ Invalid embedding dimensions for chat image ${i + 1}: expected ${EMB_DIM}, got ${embeddingVec?.length || 0}`);
      }

      // 2. Create temp grayscale version for map generation
      const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `chat_gray_${Math.floor(Date.now() / 1000)}_${i}.png`);
      await sharp(imagePath)
        .grayscale()
        .png()
        .toFile(tempGrayscalePath);

      // 3. Generate Depth Map (using fallback method since MiDaS has dependency issues)
      let depthBase64: string | undefined;
      try {
        const tempDepthPath = path.join(process.cwd(), 'server', 'temp', `chat_depth_${Math.floor(Date.now() / 1000)}_${i}.png`);
        
        console.log(`🌀 Generating depth map for chat image ${i + 1}`);
        // Fallback depth simulation using blur and contrast
        await sharp(tempGrayscalePath)
          .blur(3)
          .normalise()
          .png()
          .toFile(tempDepthPath);
        
        const depthBuffer = fs.readFileSync(tempDepthPath);
        depthBase64 = depthBuffer.toString('base64');
        console.log(`✓ Generated depth map for chat image ${i + 1}`);
        
        // Clean up temp depth file
        fs.unlinkSync(tempDepthPath);
      } catch (err) {
        console.warn(`⚠️ Failed to generate depth map for chat image ${i + 1}:`, err);
      }

      // 4. Generate Edge Map
      let edgeBase64: string | undefined;
      try {
        const tempEdgePath = path.join(process.cwd(), 'server', 'temp', `chat_edge_${Math.floor(Date.now() / 1000)}_${i}.png`);
        
        console.log(`🔲 Generating edge map for chat image ${i + 1}`);
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
        edgeBase64 = edgeBuffer.toString('base64');
        console.log(`✓ Generated edge map for chat image ${i + 1}`);
        
        // Clean up temp edge file
        fs.unlinkSync(tempEdgePath);
      } catch (err) {
        console.warn(`⚠️ Failed to generate edge map for chat image ${i + 1}:`, err);
      }

      // 5. Generate Gradient Map
      let gradientBase64: string | undefined;
      try {
        const tempGradientPath = path.join(process.cwd(), 'server', 'temp', `chat_gradient_${Math.floor(Date.now() / 1000)}_${i}.png`);
        
        console.log(`📉 Generating gradient map for chat image ${i + 1}`);
        await sharp(tempGrayscalePath)
          .convolve({
            width: 3,
            height: 3,
            kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1] // Sobel X
          })
          .normalise()
          .png()
          .toFile(tempGradientPath);
        
        const gradientBuffer = fs.readFileSync(tempGradientPath);
        gradientBase64 = gradientBuffer.toString('base64');
        console.log(`✓ Generated gradient map for chat image ${i + 1}`);
        
        // Clean up temp gradient file
        fs.unlinkSync(tempGradientPath);
      } catch (err) {
        console.warn(`⚠️ Failed to generate gradient map for chat image ${i + 1}:`, err);
      }

      // Clean up temp grayscale file
      fs.unlinkSync(tempGrayscalePath);

      // 6. Read original image as base64
      const originalBuffer = fs.readFileSync(imagePath);
      const originalBase64 = originalBuffer.toString('base64');

      processedData.push({
        original: originalBase64,
        depth: depthBase64,
        edge: edgeBase64,
        gradient: gradientBase64,
        similarCharts,
        index: i
      });

      // Clean up temp file if we created one
      if (imageUrl.startsWith('data:')) {
        fs.unlinkSync(imagePath);
      }

    } catch (error) {
      console.error(`❌ Error processing chat image ${i + 1}:`, error);
      throw error;
    }
  }

  return processedData;
}

/**
 * Analyze charts using the same pipeline as Quick Chart Analysis
 */
export async function analyzeChatCharts(request: ChatAnalysisRequest, req?: any): Promise<ChatAnalysisResponse> {
  console.log(`🔍 Starting chat chart analysis with model: ${MODEL}`);
  
  // Extract image URLs from content
  const imageUrls = request.content
    .filter(part => part.type === 'image_url')
    .map(part => part.image_url.url);
  
  // Extract text content
  const textContent = request.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n');

  console.log(`📊 Processing ${imageUrls.length} images for chat analysis`);
  console.log(`📄 System prompt length: ${request.systemPrompt.length} chars`);
  console.log(`📄 System prompt preview: ${request.systemPrompt.substring(0, 120)}...`);

  if (imageUrls.length === 0) {
    throw new Error('No images attached for analysis');
  }

  // Process images with visual maps (same as Quick Chart Analysis)
  const processedData = await processImagesWithMaps(imageUrls, req);
  
  // Build content array with all visual data
  const visionContent: any[] = [];
  
  // Add text if present
  if (textContent.trim()) {
    visionContent.push({
      type: 'text',
      text: `User query: ${textContent}\n\nPlease analyze the provided trading charts with all visual maps.`
    });
  } else {
    visionContent.push({
      type: 'text',
      text: 'Please analyze the provided trading charts with all visual maps.'
    });
  }

  // Add all processed images and their maps
  let depthCount = 0, edgeCount = 0, gradientCount = 0;
  let allSimilarCharts: any[] = [];

  processedData.forEach((data, index) => {
    // Add original image
    visionContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${data.original}`
      }
    });

    // Add depth map if available
    if (data.depth) {
      visionContent.push({
        type: 'text',
        text: `Depth map for chart ${index + 1} (pattern structure analysis):`
      });
      visionContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${data.depth}`
        }
      });
      depthCount++;
    }

    // Add edge map if available
    if (data.edge) {
      visionContent.push({
        type: 'text',
        text: `Edge map for chart ${index + 1} (structural boundaries):`
      });
      visionContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${data.edge}`
        }
      });
      edgeCount++;
    }

    // Add gradient map if available
    if (data.gradient) {
      visionContent.push({
        type: 'text',
        text: `Gradient map for chart ${index + 1} (momentum analysis):`
      });
      visionContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${data.gradient}`
        }
      });
      gradientCount++;
    }

    // Collect similar charts
    if (data.similarCharts) {
      allSimilarCharts.push(...data.similarCharts);
    }
  });

  // Add historical context from similar charts
  if (allSimilarCharts.length > 0) {
    const contextText = `\nHistorical similar patterns found:\n${allSimilarCharts.slice(0, 3).map((item, index) => {
      const chart = item.chart;
      return `${index + 1}. ${chart.originalName || chart.filename} (${chart.instrument}, ${chart.timeframe}) - ${(item.similarity * 100).toFixed(1)}% similarity`;
    }).join('\n')}`;
    
    visionContent.push({
      type: 'text',
      text: contextText
    });
  }

  console.log(`📡 Making OpenAI API call with ${visionContent.length} content parts`);
  console.log(`🖼️ Image parts: ${visionContent.filter(p => p.type === 'image_url').length}`);

  // Use unified prompt system for the first image (primary target)
  console.log(`[CHAT] Building unified prompt for chat analysis`);
  
  // Get base prompt from request or default
  const basePrompt = await getCurrentPrompt(request.systemPrompt);
  
  // Helper to build absolute URLs
  const { toAbsoluteUrl } = await import('./visual-maps');
  
  // Build target chart data from the first processed image
  const firstImageData = processedData[0];
  const target: ChartMaps = {
    originalPath: toAbsoluteUrl(`/uploads/temp_chat_${Math.floor(Date.now() / 1000)}_0.png`, req) || 'temp_chart.png',
    depthMapPath: firstImageData.depth ? `/temp/depth_chat.png` : null,
    edgeMapPath: firstImageData.edge ? `/temp/edge_chat.png` : null,
    gradientMapPath: firstImageData.gradient ? `/temp/gradient_chat.png` : null,
    instrument: null, // Extract from request if available
    timeframe: null, // Extract from request if available
    similarity: null,
    id: Date.now(),
    filename: 'uploaded_chart.png',
  };

  // Build similar charts data with absolute URLs from all similar charts
  const similars: ChartMaps[] = allSimilarCharts.slice(0, 3).map(item => ({
    originalPath: toAbsoluteUrl(`/uploads/${item.chart.filename}`, req) || item.chart.filename,
    depthMapPath: toAbsoluteUrl(item.chart.depthMapPath, req),
    edgeMapPath: toAbsoluteUrl(item.chart.edgeMapPath, req),
    gradientMapPath: toAbsoluteUrl(item.chart.gradientMapPath, req),
    instrument: item.chart.instrument,
    timeframe: item.chart.timeframe,
    similarity: item.similarity,
    id: item.chart.id,
    filename: item.chart.filename,
  }));

  // Build unified prompt
  const unifiedPrompt = buildUnifiedPrompt(basePrompt, target, similars);
  
  console.log(`[CHAT] unifiedPrompt chars: ${unifiedPrompt.length} target: uploaded_chart similars: ${similars.length}`);

  // Build messages for OpenAI using unified prompt
  const messages = [
    {
      role: 'system' as const,
      content: unifiedPrompt
    },
    {
      role: 'user' as const,
      content: visionContent
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const analysisText = response.choices[0].message.content || '';
    console.log(`✅ Received OpenAI response (${analysisText.length} chars)`);
    console.log(`🔍 Raw response preview: ${analysisText.substring(0, 200)}...`);

    const parsedResult = JSON.parse(analysisText) as ChatAnalysisResponse;
    
    // Validate required fields - handle both old and new field names
    const hasOldFormat = parsedResult.direction && parsedResult.rationale;
    const hasNewFormat = parsedResult.prediction && parsedResult.reasoning;
    
    if (!hasOldFormat && !hasNewFormat) {
      console.error("❌ Missing required fields in GPT response:", parsedResult);
      throw new Error("Invalid response format from GPT");
    }
    
    // Convert old format to new format if needed
    if (hasOldFormat && !hasNewFormat) {
      parsedResult.prediction = parsedResult.direction!;
      parsedResult.reasoning = parsedResult.rationale!;
    }
    
    // Final validation
    if (!parsedResult.prediction || !parsedResult.session || !parsedResult.confidence || !parsedResult.reasoning) {
      console.error("❌ Missing required fields after conversion:", parsedResult);
      throw new Error("Invalid response format from GPT");
    }

    // Add metadata in new format
    parsedResult.similarCharts = allSimilarCharts.map(item => ({
      chart: {
        id: item.chart.id,
        filename: item.chart.filename,
        timeframe: item.chart.timeframe,
        instrument: item.chart.instrument,
        depthMapPath: item.chart.depthMapPath ?? `/depthmaps/depth_chart_${item.chart.id}.png`,
        edgeMapPath: item.chart.edgeMapPath ?? `/edgemaps/edge_chart_${item.chart.id}.png`,
        gradientMapPath: item.chart.gradientMapPath ?? `/gradientmaps/gradient_chart_${item.chart.id}.png`,
      },
      similarity: item.similarity,
    }));
    
    console.log("[RAG] similarCharts in response:", parsedResult.similarCharts?.length);

    parsedResult.visualMapsIncluded = {
      depth: depthCount,
      edge: edgeCount,
      gradient: gradientCount
    };

    console.log(`✅ Chat analysis completed successfully`);
    return parsedResult;

  } catch (error) {
    console.error('❌ Chat analysis error:', error);
    throw error;
  }
}
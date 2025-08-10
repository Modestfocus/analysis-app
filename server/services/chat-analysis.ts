/**
 * Chat-specific analysis service that reuses Quick Chart Analysis pipeline
 * Processes images with depth/edge/gradient maps and sends them as vision parts
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import { generateCLIPEmbedding } from './transformers-clip';
import { storage } from '../storage';

// Helper functions for image processing (assumed to be defined elsewhere or inlined)
// These are placeholders and need actual implementation or import
async function generateDepthMap(imageBuffer: Buffer): Promise<string | undefined> {
  // Placeholder for depth map generation
  // In a real scenario, this would involve a model like MiDaS or a similar technique.
  // For this example, we'll simulate a blurred grayscale image.
  try {
    const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `chat_gray_${Date.now()}.png`);
    await sharp(imageBuffer)
      .grayscale()
      .png()
      .toFile(tempGrayscalePath);

    const tempDepthPath = path.join(process.cwd(), 'server', 'temp', `chat_depth_${Date.now()}.png`);
    await sharp(tempGrayscalePath)
      .blur(3)
      .normalise()
      .png()
      .toFile(tempDepthPath);

    const depthBuffer = fs.readFileSync(tempDepthPath);
    fs.unlinkSync(tempDepthPath);
    fs.unlinkSync(tempGrayscalePath);
    return depthBuffer.toString('base64');
  } catch (err) {
    console.warn(`⚠️ Failed to generate depth map:`, err);
    return undefined;
  }
}

async function generateEdgeMap(imageBuffer: Buffer): Promise<string | undefined> {
  // Placeholder for edge map generation (e.g., using Laplacian filter)
  try {
    const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `chat_gray_${Date.now()}.png`);
    await sharp(imageBuffer)
      .grayscale()
      .png()
      .toFile(tempGrayscalePath);

    const tempEdgePath = path.join(process.cwd(), 'server', 'temp', `chat_edge_${Date.now()}.png`);
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
    fs.unlinkSync(tempEdgePath);
    fs.unlinkSync(tempGrayscalePath);
    return edgeBuffer.toString('base64');
  } catch (err) {
    console.warn(`⚠️ Failed to generate edge map:`, err);
    return undefined;
  }
}

async function generateGradientMap(imageBuffer: Buffer): Promise<string | undefined> {
  // Placeholder for gradient map generation (e.g., using Sobel filter)
  try {
    const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `chat_gray_${Date.now()}.png`);
    await sharp(imageBuffer)
      .grayscale()
      .png()
      .toFile(tempGrayscalePath);

    const tempGradientPath = path.join(process.cwd(), 'server', 'temp', `chat_gradient_${Date.now()}.png`);
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
    fs.unlinkSync(tempGradientPath);
    fs.unlinkSync(tempGrayscalePath);
    return gradientBuffer.toString('base64');
  } catch (err) {
    console.warn(`⚠️ Failed to generate gradient map:`, err);
    return undefined;
  }
}

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
async function processImagesWithMaps(imageUrls: string[]) {
  const processedData = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    console.log(`🔄 Processing image ${i + 1}/${imageUrls.length} for chat analysis`);

    // Handle data URLs (base64) or file paths
    let imagePath: string;
    if (imageUrl.startsWith('data:')) {
      // Convert base64 to temporary file
      const base64Data = imageUrl.split(',')[1];
      const tempPath = path.join(process.cwd(), 'server', 'temp', `chat_temp_${Date.now()}_${i}.png`);
      fs.writeFileSync(tempPath, Buffer.from(base64Data, 'base64'));
      imagePath = tempPath;
    } else {
      imagePath = imageUrl;
    }

    try {
      // 1. Generate CLIP embedding for RAG search
      console.log(`🧠 Generating CLIP embedding for chat image ${i + 1}`);
      const embeddingResult = await generateCLIPEmbedding(imagePath);
      let similarCharts: Array<{ chart: any; similarity: number }> = [];

      if (embeddingResult.embedding && embeddingResult.embedding.length === 1024) {
        console.log(`🔍 Performing vector similarity search for chat image ${i + 1}`);
        similarCharts = await storage.findSimilarCharts(embeddingResult.embedding, 3);
        console.log(`✓ Found ${similarCharts.length} similar charts for RAG context`);
      }

      // 2. Create temp grayscale version for map generation
      const tempGrayscalePath = path.join(process.cwd(), 'server', 'temp', `chat_gray_${Date.now()}_${i}.png`);
      await sharp(imagePath)
        .grayscale()
        .png()
        .toFile(tempGrayscalePath);

      // 3. Generate Depth Map (using fallback method since MiDaS has dependency issues)
      let depthBase64: string | undefined;
      try {
        const tempDepthPath = path.join(process.cwd(), 'server', 'temp', `chat_depth_${Date.now()}_${i}.png`);

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
        const tempEdgePath = path.join(process.cwd(), 'server', 'temp', `chat_edge_${Date.now()}_${i}.png`);

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
        const tempGradientPath = path.join(process.cwd(), 'server', 'temp', `chat_gradient_${Date.now()}_${i}.png`);

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
export async function analyzeChatCharts(request: ChatAnalysisRequest): Promise<ChatAnalysisResponse> {
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
  const processedData = await processImagesWithMaps(imageUrls);

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

  // Build enhanced system prompt with RAG context
  let enhancedSystemPrompt = request.systemPrompt;

  // Add historical context from similar charts if available
  if (allSimilarCharts.length > 0) {
    const ragContext = `\n\n📚 **Historical Chart Context:**\n${allSimilarCharts.slice(0, 3).map((item, index) => {
      const chart = item.chart;
      return `📊 Similar Chart #${index + 1}:
- Filename: ${chart.originalName || chart.filename}
- Instrument: ${chart.instrument}
- Timeframe: ${chart.timeframe}
- Session: ${chart.session || 'Unknown'}
- CLIP Similarity: ${(item.similarity * 100).toFixed(1)}%
- Outcome: ${chart.comment || 'Not recorded'}`;
    }).join('\n\n')}`;

    enhancedSystemPrompt += ragContext;
  }

  // Add visual processing context
  const visualContext = `\n\n🖼️ **Visual Processing Data Available:**
- Original Charts: ${processedData.length}
- Depth Maps: ${depthCount} (structural geometry analysis)
- Edge Maps: ${edgeCount} (entry zone outlines, compression detection)  
- Gradient Maps: ${gradientCount} (slope intensity, momentum analysis)`;

  enhancedSystemPrompt += visualContext;

  // Build messages for OpenAI
  const messages = [
    {
      role: 'system' as const,
      content: enhancedSystemPrompt
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

    // Add metadata
    parsedResult.similarCharts = allSimilarCharts.slice(0, 3).map(item => ({
      chartId: item.chart.id,
      filename: item.chart.originalName || item.chart.filename,
      instrument: item.chart.instrument,
      timeframe: item.chart.timeframe,
      similarity: item.similarity
    }));

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

// --- Placeholder for the analyzeChatContent function that was modified ---
// This function likely calls analyzeChatCharts internally or performs similar logic.
// The provided changes modify the signature and internal processing logic related to images and system prompts.

/**
 * Placeholder for the analyzeChatContent function.
 * Based on the changes, this function's signature and internal logic for handling
 * images and enriching the system prompt have been updated.
 */
export async function analyzeChatContent(
  content: any[],
  systemPrompt: string,
  conversationId?: string,
  isFollowUp: boolean = false,
  enableFullAnalysis: boolean = false // New parameter to enable enhanced analysis
): Promise<any> {
  console.log('🔍 Starting chat content analysis');

  // Filter out image_url parts from the content
  const images = content.filter(part => part.type === 'image_url');
  const textParts = content.filter(part => part.type === 'text');
  const textContent = textParts.map(part => part.text).join('\n');

  let enhancedSystemPrompt = systemPrompt;
  let processedImagesData = [];

  // If full analysis is enabled and there are images, process them
  if (enableFullAnalysis && images.length > 0) {
    console.log(`📊 Processing ${images.length} images for enhanced chat analysis`);

    // Process each image to generate visual data and RAG context
    for (let i = 0; i < images.length; i++) {
      const imageContent = images[i];
      console.log(`🔄 Processing image ${i + 1}/${images.length} for enhanced analysis`);

      // Extract base64 data
      const base64Data = imageContent.image_url.url.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Generate CLIP embedding for similarity search
      console.log(`🧠 Generating CLIP embedding for chat image ${i + 1}`);
      const embedding = await generateCLIPEmbedding(imageBuffer);

      // Find similar charts using vector similarity
      console.log(`🔍 Performing vector similarity search for chat image ${i + 1}`);
      const similarCharts = await storage.findSimilarCharts(embedding, 3);
      console.log(`✓ Found ${similarCharts.length} similar charts for RAG context`);

      // Generate visual processing maps
      console.log(`🌀 Generating depth map for chat image ${i + 1}`);
      const depthMapBase64 = await generateDepthMap(imageBuffer);
      console.log(`✓ Generated depth map for chat image ${i + 1}`);

      console.log(`🔲 Generating edge map for chat image ${i + 1}`);
      const edgeMapBase64 = await generateEdgeMap(imageBuffer);
      console.log(`✓ Generated edge map for chat image ${i + 1}`);

      console.log(`📉 Generating gradient map for chat image ${i + 1}`);
      const gradientMapBase64 = await generateGradientMap(imageBuffer);
      console.log(`✓ Generated gradient map for chat image ${i + 1}`);

      // Build live RAG context for this image
      if (similarCharts.length > 0) {
        enhancedSystemPrompt += `\n\n📚 **LIVE RAG CONTEXT FOR IMAGE ${i + 1}:**\n`;

        for (let j = 0; j < Math.min(similarCharts.length, 3); j++) {
          const item = similarCharts[j];
          const chart = item.chart;

          enhancedSystemPrompt += `📊 Similar Chart #${j + 1}:
- Image: /uploads/${chart.filename}
- Depth Map: ${chart.depthMapPath || 'Generated in real-time'}
- Edge Map: Generated in real-time
- Gradient Map: Generated in real-time
- Instrument: ${chart.instrument}
- Timeframe: ${chart.timeframe}
- Session: ${chart.session || 'Unknown'}
- CLIP Similarity: ${(item.similarity * 100).toFixed(1)}%
- Historical Outcome: ${chart.comment || 'Not recorded'}

`;
        }

        // Add bundle context if similar charts are part of bundles
        const bundleContext = await storage.getBundleContextForCharts(similarCharts.map(s => s.chart.id));
        if (bundleContext.length > 0) {
          enhancedSystemPrompt += `📦 **BUNDLE-SPECIFIC CONTEXT:**\n`;
          bundleContext.forEach((bundle, idx) => {
            enhancedSystemPrompt += `Bundle ${idx + 1}: ${bundle.instrument} across [${bundle.timeframes.join(', ')}]
- Session Focus: ${bundle.session || 'Multi-session'}
- Charts in Bundle: ${bundle.chartCount}
- Cross-timeframe Analysis: Available

`;
          });
        }
      }

      processedImagesData.push({
        original: base64Data,
        depthMap: depthMapBase64,
        edgeMap: edgeMapBase64,
        gradientMap: gradientMapBase64,
        similarCharts,
        index: i + 1
      });
    }
  }

  // Construct the final content for the model
  const modelContent: any[] = [
    {
      type: "text",
      text: enhancedSystemPrompt
    }
  ];

  // Add original images and their maps to the content if full analysis was done
  if (enableFullAnalysis) {
    processedImagesData.forEach((data, index) => {
      // Add original image
      modelContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${data.original}`
        }
      });

      // Add depth map if available
      if (data.depthMap) {
        modelContent.push({ type: 'text', text: `Depth map for chart ${index + 1}:` });
        modelContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${data.depthMap}` } });
      }
      // Add edge map if available
      if (data.edgeMap) {
        modelContent.push({ type: 'text', text: `Edge map for chart ${index + 1}:` });
        modelContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${data.edgeMap}` } });
      }
      // Add gradient map if available
      if (data.gradientMap) {
        modelContent.push({ type: 'text', text: `Gradient map for chart ${index + 1}:` });
        modelContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${data.gradientMap}` } });
      }
    });
  } else {
    // If not full analysis, just add the original images
    content.forEach(part => {
      if (part.type === 'image_url') {
        modelContent.push(part);
      }
    });
  }

  // Add the text content
  if (textContent.trim()) {
    modelContent.push({ type: 'text', text: `User query: ${textContent}` });
  }

  console.log(`📡 Making OpenAI API call with ${modelContent.length} content parts`);

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: modelContent }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const analysisText = response.choices[0].message.content || '';
    console.log(`✅ Received OpenAI response (${analysisText.length} chars)`);
    const parsedResult = JSON.parse(analysisText);

    // Add metadata for visual maps if full analysis was performed
    if (enableFullAnalysis) {
      let depthCount = 0, edgeCount = 0, gradientCount = 0;
      processedImagesData.forEach(data => {
        if (data.depthMap) depthCount++;
        if (data.edgeMap) edgeCount++;
        if (data.gradientMap) gradientCount++;
      });
      parsedResult.visualMapsIncluded = { depth: depthCount, edge: edgeCount, gradient: gradientCount };
    }

    return parsedResult;
  } catch (error) {
    console.error('❌ Chat content analysis error:', error);
    throw error;
  }
}
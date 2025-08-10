/**
 * Unified Analysis Service - Enforces JSON schema and provides route parity
 * Used by both Dashboard analysis endpoints and "Analyze Charts" chat interface
 * 
 * Features:
 * - Strict JSON schema enforcement (422 on invalid JSON)
 * - Bundle support with ordered frames in prompt context
 * - Server-side CLIP embeddings (no client-side Xenova dependency)
 * - Non-destructive map generation preserving original files
 * - Structure/Intensity Maps (renamed from Depth Maps)
 * - Debug logging with PROMPT_DEBUG
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import OpenAI from 'openai';
import { generateCLIPEmbedding } from './transformers-clip';
import { storage } from '../storage';
import { z } from 'zod';

// Enforce strict JSON schema for analysis responses
export const AnalysisResponseSchema = z.object({
  session: z.enum(["Asia", "London", "NY", "Sydney"]),
  direction_bias: z.enum(["Up", "Down", "Sideways"]),
  confidence: z.number().min(0).max(100),
  rationale: z.string().min(10),
  pattern_match: z.array(z.string()).optional(),
  risk_notes: z.string().optional(),
  next_steps: z.string().optional()
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

interface ProcessedImageData {
  original: string; // base64
  structureMap?: string; // base64 (renamed from depth map)
  edgeMap?: string; // base64
  gradientMap?: string; // base64
  similarCharts: Array<{ chart: any; similarity: number }>;
  embedding?: number[];
  index: number;
}

interface UnifiedAnalysisOptions {
  systemPrompt?: string;
  injectText?: string;
  bundleId?: string;
  enableFullPipeline?: boolean;
  debugMode?: boolean;
}

/**
 * Generate Structure/Intensity Map (renamed from Depth Map)
 * Non-destructive - creates new files without overwriting originals
 */
async function generateStructureMap(imageBuffer: Buffer, outputPath?: string): Promise<string | undefined> {
  try {
    console.log('🏗️ Generating Structure/Intensity Map');
    
    // Create unique filename to avoid overwrites
    const timestamp = Date.now();
    const tempStructurePath = outputPath || path.join(process.cwd(), 'server', 'temp', `structure_${timestamp}.png`);
    
    // Generate structure map using blur + normalization for intensity analysis
    await sharp(imageBuffer)
      .grayscale()
      .blur(3)
      .normalise()
      .png()
      .toFile(tempStructurePath);

    const structureBuffer = fs.readFileSync(tempStructurePath);
    const structureBase64 = structureBuffer.toString('base64');
    
    // Clean up temp file only if we created it
    if (!outputPath) {
      fs.unlinkSync(tempStructurePath);
    }
    
    console.log('✓ Generated Structure/Intensity Map');
    return structureBase64;
  } catch (err) {
    console.warn(`⚠️ Failed to generate Structure/Intensity Map:`, err);
    return undefined;
  }
}

/**
 * Generate Edge Map using Laplacian edge detection
 */
async function generateEdgeMap(imageBuffer: Buffer, outputPath?: string): Promise<string | undefined> {
  try {
    console.log('🔲 Generating Edge Map');
    
    const timestamp = Date.now();
    const tempEdgePath = outputPath || path.join(process.cwd(), 'server', 'temp', `edge_${timestamp}.png`);
    
    await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] // Laplacian edge detection
      })
      .normalise()
      .png()
      .toFile(tempEdgePath);

    const edgeBuffer = fs.readFileSync(tempEdgePath);
    const edgeBase64 = edgeBuffer.toString('base64');
    
    if (!outputPath) {
      fs.unlinkSync(tempEdgePath);
    }
    
    console.log('✓ Generated Edge Map');
    return edgeBase64;
  } catch (err) {
    console.warn(`⚠️ Failed to generate Edge Map:`, err);
    return undefined;
  }
}

/**
 * Generate Gradient Map using Sobel filter
 */
async function generateGradientMap(imageBuffer: Buffer, outputPath?: string): Promise<string | undefined> {
  try {
    console.log('📉 Generating Gradient Map');
    
    const timestamp = Date.now();
    const tempGradientPath = outputPath || path.join(process.cwd(), 'server', 'temp', `gradient_${timestamp}.png`);
    
    await sharp(imageBuffer)
      .grayscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1] // Sobel X
      })
      .normalise()
      .png()
      .toFile(tempGradientPath);

    const gradientBuffer = fs.readFileSync(tempGradientPath);
    const gradientBase64 = gradientBuffer.toString('base64');
    
    if (!outputPath) {
      fs.unlinkSync(tempGradientPath);
    }
    
    console.log('✓ Generated Gradient Map');
    return gradientBase64;
  } catch (err) {
    console.warn(`⚠️ Failed to generate Gradient Map:`, err);
    return undefined;
  }
}

/**
 * Process images with full visual pipeline and server-side embeddings
 */
async function processImagesWithPipeline(
  imageInputs: Array<{ path?: string; buffer?: Buffer; url?: string }>,
  enableFullPipeline: boolean = true
): Promise<ProcessedImageData[]> {
  const processedData: ProcessedImageData[] = [];

  for (let i = 0; i < imageInputs.length; i++) {
    const input = imageInputs[i];
    console.log(`🔄 Processing image ${i + 1}/${imageInputs.length}`);

    let imageBuffer: Buffer;
    let imagePath: string | undefined;

    // Handle different input types
    if (input.buffer) {
      imageBuffer = input.buffer;
    } else if (input.path) {
      imageBuffer = fs.readFileSync(input.path);
      imagePath = input.path;
    } else if (input.url?.startsWith('data:')) {
      // Handle base64 data URLs
      const base64Data = input.url.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error(`Invalid image input for index ${i}`);
    }

    try {
      // 1. Generate server-side CLIP embedding for RAG search
      let embedding: number[] | undefined;
      let similarCharts: Array<{ chart: any; similarity: number }> = [];

      if (enableFullPipeline) {
        console.log(`🧠 Generating server-side CLIP embedding for image ${i + 1}`);
        
        // Create temp file if we don't have a path
        if (!imagePath) {
          imagePath = path.join(process.cwd(), 'server', 'temp', `temp_${Date.now()}_${i}.png`);
          fs.writeFileSync(imagePath, imageBuffer);
        }

        const embeddingResult = await generateCLIPEmbedding(imagePath);
        
        if (embeddingResult.embedding && embeddingResult.embedding.length === 1024) {
          embedding = embeddingResult.embedding;
          console.log(`🔍 Performing vector similarity search for image ${i + 1}`);
          similarCharts = await storage.findSimilarCharts(embedding, 3);
          console.log(`✓ Found ${similarCharts.length} similar charts for RAG context`);
        }

        // Clean up temp file if we created one
        if (!input.path) {
          fs.unlinkSync(imagePath);
        }
      }

      // 2. Generate visual maps if full pipeline is enabled
      let structureBase64: string | undefined;
      let edgeBase64: string | undefined;
      let gradientBase64: string | undefined;

      if (enableFullPipeline) {
        // Generate all maps in parallel for efficiency
        const [structure, edge, gradient] = await Promise.all([
          generateStructureMap(imageBuffer),
          generateEdgeMap(imageBuffer),
          generateGradientMap(imageBuffer)
        ]);

        structureBase64 = structure;
        edgeBase64 = edge;
        gradientBase64 = gradient;
      }

      // 3. Convert original to base64
      const originalBase64 = imageBuffer.toString('base64');

      processedData.push({
        original: originalBase64,
        structureMap: structureBase64,
        edgeMap: edgeBase64,
        gradientMap: gradientBase64,
        similarCharts,
        embedding,
        index: i
      });

    } catch (error) {
      console.error(`❌ Error processing image ${i + 1}:`, error);
      throw error;
    }
  }

  return processedData;
}

/**
 * Get bundle context for prompt inclusion
 */
async function getBundleContext(bundleId: string): Promise<string> {
  try {
    const bundle = await storage.getBundle(bundleId);
    if (!bundle) {
      return '';
    }

    const charts = await storage.getChartsByBundleId(bundleId);
    const metadata = JSON.parse(bundle.metadata);

    let bundleContext = `\n--- BUNDLE CONTEXT ---\n`;
    bundleContext += `Bundle: ${bundle.instrument} - ${bundle.session || 'No session'}\n`;
    bundleContext += `Timeframes: ${metadata.timeframes?.join(', ') || 'Unknown'}\n`;
    bundleContext += `Charts in bundle (ordered frames):\n`;

    charts.forEach((chart, index) => {
      bundleContext += `${index + 1}. ${chart.originalName} (${chart.timeframe}, ${chart.instrument})\n`;
      if (chart.comment) {
        bundleContext += `   Note: ${chart.comment}\n`;
      }
    });

    bundleContext += `--- END BUNDLE CONTEXT ---\n\n`;
    return bundleContext;
  } catch (error) {
    console.warn('⚠️ Failed to get bundle context:', error);
    return '';
  }
}

/**
 * Main unified analysis function with strict JSON schema enforcement
 */
export async function performUnifiedAnalysis(
  imageInputs: Array<{ path?: string; buffer?: Buffer; url?: string }>,
  options: UnifiedAnalysisOptions = {}
): Promise<AnalysisResponse> {
  const {
    systemPrompt,
    injectText,
    bundleId,
    enableFullPipeline = true,
    debugMode = false
  } = options;

  try {
    console.log(`🚀 Starting unified analysis for ${imageInputs.length} image(s)`);

    // 1. Process images with full pipeline
    const processedImages = await processImagesWithPipeline(imageInputs, enableFullPipeline);

    // 2. Build comprehensive RAG context
    let ragContext = "";
    const allSimilarCharts = processedImages.flatMap(img => img.similarCharts);
    
    if (allSimilarCharts.length > 0) {
      ragContext = "\n--- HISTORICAL SIMILAR PATTERNS ---\n";
      // Remove duplicates based on chart ID
      const uniqueCharts = allSimilarCharts.filter((item, index, self) => 
        index === self.findIndex(t => t.chart.id === item.chart.id)
      );
      
      uniqueCharts.slice(0, 5).forEach((item, index) => {
        const chart = item.chart;
        ragContext += `${index + 1}. ${chart.originalName || chart.filename} (${chart.instrument}, ${chart.timeframe})\n`;
        ragContext += `   - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
        ragContext += `   - Session: ${chart.session || 'Unknown'}\n`;
        if (chart.comment) {
          ragContext += `   - Notes: ${chart.comment}\n`;
        }
        ragContext += `\n`;
      });
      ragContext += "--- END HISTORICAL PATTERNS ---\n\n";
    }

    // 3. Get bundle context if provided
    let bundleContext = "";
    if (bundleId) {
      bundleContext = await getBundleContext(bundleId);
    }

    // 4. Build comprehensive system prompt
    const baseSystemPrompt = systemPrompt || `You are an expert forex and trading chart analyst with advanced pattern recognition capabilities.

You will analyze trading charts with their complete visual processing pipeline:
- Original chart images (price action, candlesticks, indicators)
- Structure/Intensity Maps (3D perception for pattern strength)
- Edge Maps (structural boundaries and trend lines)  
- Gradient Maps (price momentum and slope analysis)

CRITICAL: You must respond ONLY with valid JSON in this exact format:
{
  "session": "Asia|London|NY|Sydney",
  "direction_bias": "Up|Down|Sideways", 
  "confidence": 0-100,
  "rationale": "Detailed analysis explaining your prediction",
  "pattern_match": ["pattern1", "pattern2"],
  "risk_notes": "Risk management considerations",
  "next_steps": "Recommended actions"
}

Key Analysis Points:
1. **Session Timing**: Consider optimal trading session
2. **Visual Maps**: Use structure/edge/gradient maps for pattern strength
3. **Historical Context**: Reference similar patterns when available
4. **Risk Assessment**: Identify key risk factors
5. **Confidence**: Base on pattern clarity and historical success`;

    const finalSystemPrompt = `${baseSystemPrompt}${injectText ? `\n\nAdditional Instructions: ${injectText}` : ''}${ragContext}${bundleContext}`;

    // 5. Prepare OpenAI content array
    const content: any[] = [
      {
        type: "text",
        text: "Analyze the following trading chart(s) and provide your assessment in the required JSON format:"
      }
    ];

    // Add all visual data
    processedImages.forEach((img, index) => {
      content.push({
        type: "text",
        text: `\n--- CHART ${index + 1} ---`
      });

      // Original chart
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${img.original}`,
          detail: "high"
        }
      });

      // Structure/Intensity Map
      if (img.structureMap) {
        content.push({
          type: "text",
          text: "Structure/Intensity Map:"
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${img.structureMap}`,
            detail: "high"
          }
        });
      }

      // Edge Map
      if (img.edgeMap) {
        content.push({
          type: "text",
          text: "Edge Map:"
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${img.edgeMap}`,
            detail: "high"
          }
        });
      }

      // Gradient Map
      if (img.gradientMap) {
        content.push({
          type: "text",
          text: "Gradient Map:"
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${img.gradientMap}`,
            detail: "high"
          }
        });
      }
    });

    // 6. Debug logging if enabled
    if (debugMode || process.env.PROMPT_DEBUG === 'true') {
      console.log('🐛 PROMPT_DEBUG - System Prompt Length:', finalSystemPrompt.length);
      console.log('🐛 PROMPT_DEBUG - Content Parts:', content.length);
      console.log('🐛 PROMPT_DEBUG - System Prompt Preview:', finalSystemPrompt.substring(0, 500) + '...');
    }

    // 7. Call OpenAI GPT-4o
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: finalSystemPrompt
        },
        {
          role: 'user',
          content: content
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });

    const aiResponseText = response.choices[0]?.message?.content || '';

    // 8. Parse and validate JSON response
    let parsedResponse: any;
    try {
      // Extract JSON from response if it's wrapped in text
      const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : aiResponseText;
      parsedResponse = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError);
      console.error('❌ Raw AI Response:', aiResponseText);
      throw new Error(`Invalid JSON response from AI: ${parseError}`);
    }

    // 9. Validate against schema
    try {
      const validatedResponse = AnalysisResponseSchema.parse(parsedResponse);
      console.log('✅ Analysis completed with valid JSON schema');
      return validatedResponse;
    } catch (validationError) {
      console.error('❌ Schema Validation Error:', validationError);
      console.error('❌ Invalid Response:', parsedResponse);
      throw new Error(`Response does not match required schema: ${validationError}`);
    }

  } catch (error) {
    console.error('❌ Unified analysis error:', error);
    throw error;
  }
}

/**
 * Health check endpoint data
 */
export async function getHealthStatus() {
  return {
    service: 'unified-analysis',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      server_side_embeddings: true,
      structure_intensity_maps: true,
      json_schema_enforcement: true,
      bundle_support: true,
      non_destructive_processing: true
    },
    dependencies: {
      openai: !!process.env.OPENAI_API_KEY,
      storage: true,
      image_processing: true
    }
  };
}
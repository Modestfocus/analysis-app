import { analyzeMultipleChartsWithAllMaps } from './openai';
// Removed transformers-clip import - using unified embeddings service
import { processChartImage } from './opencv-processing';
import { storage } from '../storage';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AnalyzeChartsOptions {
  systemPrompt?: string;
  stream?: boolean;
  usePreprocessing?: boolean;
  useRAG?: boolean;
}

export interface ChartAnalysisResult {
  analysis: any;
  confidence?: number;
  similarCharts?: any[];
  targetVisuals?: any;
}

/**
 * Shared analysis function that handles both Quick Chart Analysis and Chat Analysis
 * Processes images with preprocessing, RAG, and OpenAI vision analysis
 */
export async function analyzeCharts({
  imageUrls,
  systemPrompt,
  options = {}
}: {
  imageUrls: string[];
  systemPrompt?: string;
  options?: AnalyzeChartsOptions;
}, req?: any): Promise<ChartAnalysisResult> {
  const {
    stream = false,
    usePreprocessing = true,
    useRAG = true
  } = options;

  try {
    console.log(`🔍 Starting chart analysis for ${imageUrls.length} image(s)`);
    
    // Prepare chart data with preprocessing if enabled
    const chartData: any[] = [];
    let similarCharts: any[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      let imagePath = '';
      
      // Handle different image URL formats
      if (imageUrl.startsWith('data:')) {
        // Convert base64 to file
        const base64Data = imageUrl.split(',')[1];
        const tempPath = `server/uploads/temp_chat_${Math.floor(Date.now() / 1000)}_${i}.png`;
        fs.writeFileSync(tempPath, base64Data, 'base64');
        imagePath = tempPath;
      } else if (imageUrl.startsWith('/')) {
        // Absolute file path
        imagePath = imageUrl.substring(1); // Remove leading slash
      } else {
        // Assume it's already a relative path
        imagePath = imageUrl;
      }

      const chartItem: any = {
        originalImage: imagePath,
        imageUrl: imageUrl,
        index: i
      };

      if (usePreprocessing) {
        try {
          // Generate visual maps using the new non-destructive preprocessing service
          const { ensureVisualMaps } = await import('./preprocess');
          const visualMaps = await ensureVisualMaps(imagePath);
          
          chartItem.depthMapPath = visualMaps.depthMapPath;
          chartItem.edgeMapPath = visualMaps.edgeMapPath;
          chartItem.gradientMapPath = visualMaps.gradientMapPath;
        } catch (error) {
          console.warn(`⚠️ Visual map generation failed for image ${i}:`, error);
        }
      }

      if (useRAG) {
        try {
          // Generate CLIP embedding and find similar charts using new vector search
          const { embedImageToVectorCached, EMB_DIM, EMB_MODEL_ID } = await import('./embeddings');
          const { getTopSimilarCharts } = await import('./retrieval');
          
          // Compute hash for caching (same approach as preprocessing)
          const fs = await import('fs');
          const crypto = await import('crypto');
          const buf = await fs.promises.readFile(imagePath);
          const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
          
          const vec = await embedImageToVectorCached(imagePath, sha);
          
          // Dimension guardrail
          console.assert(vec.length === EMB_DIM, "query dim mismatch");
          console.log('[RAG] query sha', sha, 'k=3', { dim: vec.length, model: EMB_MODEL_ID });
          
          // Convert Float32Array to number[] for new function signature
          const vecArray = Array.from(vec);
          const neighbors = await getTopSimilarCharts(vecArray, 3);

          // Map to expected format with proper paths
          const { toAbsoluteUrl } = await import('./visual-maps');
          const similar = neighbors.map(n => ({
            chart: {
              id: n.id,
              filename: n.filename,
              timeframe: n.timeframe,
              instrument: n.instrument,
              depthMapPath: toAbsoluteUrl(n.depthMapPath ?? `/depthmaps/depth_chart_${n.id}.png`, req),
              edgeMapPath: toAbsoluteUrl(n.edgeMapPath ?? `/edgemaps/edge_chart_${n.id}.png`, req),
              gradientMapPath: toAbsoluteUrl(n.gradientMapPath ?? `/gradientmaps/gradient_chart_${n.id}.png`, req),
            },
            similarity: n.similarity, // float 0..1
          }));
          
          if (similar.length > 0) {
            console.table(similar.map(s => ({ 
              id: s.chart.id, 
              sim: Number(s.similarity).toFixed(4) 
            })));
          }
          
          similarCharts = [...similarCharts, ...similar];
        } catch (error) {
          console.warn(`⚠️ RAG search failed for image ${i}:`, error);
        }
      }

      chartData.push(chartItem);
    }

    // Use the existing analysis pipeline for multiple charts
    if (chartData.length > 1) {
      // Multi-chart analysis
      const result = await analyzeMultipleChartsWithAllMaps(
        chartData,
        similarCharts,
        systemPrompt
      );
      
      // Format the result for chat display
      const formattedAnalysis = formatAnalysisForChat(result, similarCharts);
      
      return {
        analysis: formattedAnalysis,
        confidence: typeof result.confidence === 'string' ? 
          (result.confidence === 'High' ? 0.9 : result.confidence === 'Medium' ? 0.7 : 0.5) : 
          result.confidence || 0.85,
        similarCharts,
        targetVisuals: chartData.length > 0 ? {
          depthMapPath: chartData[0].depthMapPath,
          edgeMapPath: chartData[0].edgeMapPath,
          gradientMapPath: chartData[0].gradientMapPath
        } : undefined
      };
    } else {
      // Single chart analysis using OpenAI vision directly
      const result = await analyzeSingleChartWithVision(
        chartData[0],
        similarCharts,
        systemPrompt
      );
      
      // Format the result for chat display
      const formattedAnalysis = typeof result === 'string' ? result : formatAnalysisForChat(result, similarCharts);
      
      return {
        analysis: formattedAnalysis,
        confidence: result.confidence || 0.85,
        similarCharts,
        targetVisuals: chartData.length > 0 ? {
          depthMapPath: chartData[0].depthMapPath,
          edgeMapPath: chartData[0].edgeMapPath,
          gradientMapPath: chartData[0].gradientMapPath
        } : undefined
      };
    }

  } catch (error) {
    console.error('❌ Error in chart analysis:', error);
    throw error;
  }
}

/**
 * Format analysis result for chat display
 */
function formatAnalysisForChat(result: any, similarCharts: any[] = []): string {
  if (typeof result === 'string') {
    return result;
  }

  // If it's a structured analysis result from GPT, format it nicely
  if (result.prediction && result.reasoning) {
    let formatted = `## Technical Analysis\n\n`;
    
    formatted += `**Prediction:** ${result.prediction}\n`;
    formatted += `**Best Session:** ${result.session}\n`;
    formatted += `**Confidence:** ${result.confidence}\n\n`;
    
    formatted += `**Analysis:**\n${result.reasoning}\n\n`;
    
    if (similarCharts && similarCharts.length > 0) {
      formatted += `**Similar Historical Patterns:**\n`;
      similarCharts.slice(0, 3).forEach((item, index) => {
        const chart = item.chart;
        formatted += `${index + 1}. ${chart.originalName || chart.filename} (${chart.instrument}, ${chart.timeframe}) - ${(item.similarity * 100).toFixed(1)}% similarity\n`;
      });
    }
    
    return formatted;
  }
  
  // Fallback for any other format
  return typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
}

/**
 * Analyze a single chart using OpenAI vision with all preprocessing maps
 */
async function analyzeSingleChartWithVision(
  chartData: any,
  similarCharts: any[] = [],
  customSystemPrompt?: string
): Promise<any> {
  try {
    // Build RAG context
    let ragContext = "";
    if (similarCharts.length > 0) {
      ragContext = "\nHistorical similar patterns found:\n\n";
      similarCharts.slice(0, 3).forEach((item, index) => {
        const chart = item.chart;
        ragContext += `${index + 1}. ${chart.originalName} (${chart.instrument}, ${chart.timeframe})\n`;
        ragContext += `   - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
        ragContext += `   - Session: ${chart.session || 'Unknown'}\n\n`;
      });
    }

    // Build system prompt
    const baseSystemPrompt = customSystemPrompt || `You are a professional forex and trading chart analyst with expertise in technical analysis.

You will receive a trading chart with visual processing pipeline:
- Original chart image (price action, candlesticks, indicators)
- Depth maps (3D depth perception for pattern recognition) 
- Edge maps (structural boundaries and trend lines)
- Gradient maps (price momentum and slope analysis)

Analyze the chart and provide comprehensive technical insights.

Key Analysis Points:
1. **Trend Analysis**: Current trend direction and strength
2. **Pattern Recognition**: Chart patterns (triangles, flags, head & shoulders, etc.)
3. **Support/Resistance**: Key levels and zones
4. **Volume/Momentum**: Price momentum and strength
5. **Structure Analysis**: Key structural elements
6. **Trading Setup**: Entry/exit strategies and risk management`;

    const systemPrompt = `${baseSystemPrompt}

${ragContext}

Provide detailed technical analysis including:
- Current trend direction and strength
- Key support and resistance levels
- Chart patterns and their implications
- Volume analysis if visible
- Potential price targets and entry/exit points
- Risk assessment and confidence level`;

    // Prepare content array with all visual data
    const content: any[] = [
      {
        type: "text",
        text: "Please analyze this trading chart using all provided visual data."
      }
    ];

    // Add original chart image
    if (chartData.originalImage) {
      const imageBuffer = fs.readFileSync(chartData.originalImage);
      const base64Image = imageBuffer.toString('base64');
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`
        }
      });
    }

    // Add preprocessing maps if available
    if (chartData.depthMapPath && fs.existsSync(chartData.depthMapPath)) {
      content.push({
        type: "text",
        text: "Depth map for pattern structure analysis:"
      });
      const depthBuffer = fs.readFileSync(chartData.depthMapPath);
      const base64Depth = depthBuffer.toString('base64');
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Depth}`
        }
      });
    }

    if (chartData.edgeMapPath && fs.existsSync(chartData.edgeMapPath)) {
      content.push({
        type: "text",
        text: "Edge map for structural boundaries:"
      });
      const edgeBuffer = fs.readFileSync(chartData.edgeMapPath);
      const base64Edge = edgeBuffer.toString('base64');
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Edge}`
        }
      });
    }

    if (chartData.gradientMapPath && fs.existsSync(chartData.gradientMapPath)) {
      content.push({
        type: "text",
        text: "Gradient map for momentum analysis:"
      });
      const gradientBuffer = fs.readFileSync(chartData.gradientMapPath);
      const base64Gradient = gradientBuffer.toString('base64');
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Gradient}`
        }
      });
    }

    // Call OpenAI
    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: content
      }
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 2000,
      temperature: 0.2,
    });

    const analysisText = response.choices[0].message.content || '';
    
    // Try to extract structured data or return text
    return {
      analysis: analysisText,
      confidence: 0.85, // Default confidence
      technical: {
        trend: "Analysis provided in text format",
        supportResistance: "Check analysis text",
        patterns: []
      }
    };

  } catch (error) {
    console.error("❌ Error in single chart vision analysis:", error);
    throw error;
  }
}

/**
 * Streaming version of the analysis for real-time responses
 */
export async function* analyzeChartsStream({
  imageUrls,
  systemPrompt,
  options = {}
}: {
  imageUrls: string[];
  systemPrompt?: string;
  options?: AnalyzeChartsOptions;
}): AsyncGenerator<string, void, unknown> {
  // This would implement streaming analysis
  // For now, just yield the complete result
  try {
    const result = await analyzeCharts({ imageUrls, systemPrompt, options });
    yield JSON.stringify(result);
  } catch (error) {
    yield JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
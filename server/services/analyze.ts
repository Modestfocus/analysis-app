import { analyzeMultipleChartsWithAllMaps } from './openai';
// Removed transformers-clip import - using unified embeddings service
import { processChartImage } from './opencv-processing';
import { storage } from '../storage';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { buildUnifiedPrompt, ChartMaps } from './prompt-builder';
import { getCurrentPrompt } from './system-prompt';
import { logUnifiedPromptDebugOnce } from './chat/unifiedPromptDebug';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AnalyzeChartsOptions {
  systemPrompt?: string;
  stream?: boolean;
  usePreprocessing?: boolean;
  useRAG?: boolean;
  injectText?: string; // Contains debugPromptId and other injection text
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
    useRAG = true,
    injectText
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
        systemPrompt,
        injectText,
        req
      );
      
      // Format the result for chat display
      const formattedAnalysis = formatAnalysisForChat(result, similarCharts);
      
      console.log("[RAG] similarCharts in response:", similarCharts?.length);
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
        systemPrompt,
        injectText,
        req
      );
      
      // Format the result for chat display
      const formattedAnalysis = typeof result === 'string' ? result : formatAnalysisForChat(result, similarCharts);
      
      console.log("[RAG] similarCharts in response:", similarCharts?.length);
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
 * Analyze a single chart using OpenAI vision with all preprocessing maps and unified prompt
 */
async function analyzeSingleChartWithVision(
  chartData: any,
  similarCharts: any[] = [],
  customSystemPrompt?: string,
  injectText?: string,
  req?: any
): Promise<any> {
  try {
    console.log(`[CHAT] Building unified prompt for single chart analysis`);
    
    // Get base prompt from dashboard or use custom/default
    const basePrompt = await getCurrentPrompt(customSystemPrompt);
    
    // Helper to build absolute URLs
    const { toAbsoluteUrl } = await import('./visual-maps');
    
    // Build target chart data - use original imageUrl if it's a data URL, otherwise convert file path
    const target: ChartMaps = {
      originalPath: chartData.imageUrl && chartData.imageUrl.startsWith('data:') ? chartData.imageUrl : toAbsoluteUrl(chartData.originalImage, req),
      depthMapPath: chartData.depthMapPath ? toAbsoluteUrl(chartData.depthMapPath, req) : null,
      edgeMapPath: chartData.edgeMapPath ? toAbsoluteUrl(chartData.edgeMapPath, req) : null,
      gradientMapPath: chartData.gradientMapPath ? toAbsoluteUrl(chartData.gradientMapPath, req) : null,
      instrument: chartData.metadata?.instrument,
      timeframe: chartData.metadata?.timeframe,
      similarity: null,
      id: chartData.metadata?.id,
      filename: chartData.metadata?.filename || chartData.metadata?.originalName,
    };

    // Build similar charts data with absolute URLs
    const similars: ChartMaps[] = similarCharts.slice(0, 3).map(item => ({
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

    // Build unified messages using the new unified prompt system
    const { buildUnifiedMessages, logUnifiedPrompt } = await import('./chat/unifiedPrompt');
    const { getCurrentPromptText } = await import('./system-prompt');
    
    // Get the current prompt text from dashboard
    const currentPromptText = await getCurrentPromptText(customSystemPrompt);
    
    // Build target data for unified prompt - pass data URL directly if available
    const targetVisuals = {
      filename: chartData.imageUrl && chartData.imageUrl.startsWith('data:') ? chartData.imageUrl : path.basename(chartData.originalImage || ''),
      depthMapPath: target.depthMapPath || undefined,
      edgeMapPath: target.edgeMapPath || undefined,
      gradientMapPath: target.gradientMapPath || undefined,
    };
    
    // Convert similars to unified format
    const similarItems = similars.map(item => ({
      chart: {
        filename: item.filename,
        depthMapPath: item.depthMapPath || undefined,
        edgeMapPath: item.edgeMapPath || undefined,
        gradientMapPath: item.gradientMapPath || undefined,
        timeframe: item.timeframe || undefined,
        instrument: item.instrument || undefined,
      },
      similarity: item.similarity || undefined,
    }));
    
    // Build unified messages with system = dashboard Current Prompt and user = short text + images
    const messages = buildUnifiedMessages({
      currentPromptText,
      injectText: injectText, // Pass debugPromptId if present
      target: targetVisuals,
      similars: similarItems,
    });
    
    // Extract target metadata for logging
    const targetTimeframe = target?.timeframe ?? "UNKNOWN";
    const targetInstrument = target?.instrument ?? "UNKNOWN";
    
    console.log(`[CHAT] unified messages built - target: ${targetInstrument}/${targetTimeframe} similars: ${similarItems.length}`);
    
    // Debug logging (only when DEBUG_UNIFIED_PROMPT=1)
    logUnifiedPrompt(messages);

    const response = await openai.chat.completions.create({
      model: process.env.VISION_MODEL || 'gpt-4o',
      messages: messages as any,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 1000,
    });

    const analysisText = response.choices[0].message.content || '';
    console.log(`✅ Received OpenAI response (${analysisText.length} chars)`);
    
    const parsedResult = JSON.parse(analysisText);
    
    return {
      analysis: parsedResult.analysis || analysisText,
      confidence: parsedResult.confidence || 0.85,
      prediction: parsedResult.prediction,
      session: parsedResult.session,
      reasoning: parsedResult.reasoning,
      technical: parsedResult.technical,
      targetVisuals: parsedResult.targetVisuals
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
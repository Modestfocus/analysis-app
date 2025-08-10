/**
 * Chat-specific analysis service - Updated to use Unified Analysis Service
 * Provides route parity with Dashboard analysis endpoints
 */

import { performUnifiedAnalysis, type AnalysisResponse } from './unified-analysis';

/**
 * Main function called by chat analysis endpoint - Updated to use unified service
 */
export async function analyzeChatCharts({
  content,
  systemPrompt
}: {
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
  systemPrompt?: string;
}): Promise<{
  session: string;
  direction_bias: string; 
  confidence: number;
  rationale: string;
  analysis: string;
  similarCharts: Array<{ chartId: number; filename: string; instrument: string; timeframe: string; similarity: number }>;
}> {
  console.log(`🚀 Starting chat chart analysis using unified service`);

  // Extract image URLs from content
  const imageUrls = content
    .filter(part => part.type === 'image_url' && part.image_url?.url)
    .map(part => part.image_url!.url);

  if (imageUrls.length === 0) {
    throw new Error('No images found in chat content');
  }

  console.log(`📸 Processing ${imageUrls.length} images for unified analysis`);

  // Convert to unified analysis format
  const imageInputs = imageUrls.map(url => ({ url }));

  // Use unified analysis service with chat-specific options
  const result = await performUnifiedAnalysis(imageInputs, {
    systemPrompt,
    enableFullPipeline: true,
    debugMode: process.env.PROMPT_DEBUG === 'true'
  });

  console.log(`✅ Chat analysis completed: ${result.direction_bias} bias, ${result.confidence}% confidence`);

  // Return in expected chat format (maintaining backward compatibility)
  return {
    session: result.session,
    direction_bias: result.direction_bias,
    confidence: result.confidence,
    rationale: result.rationale,
    analysis: result.rationale, // Use rationale as analysis for compatibility
    similarCharts: [] // Will be populated by the unified service internally
  };
}
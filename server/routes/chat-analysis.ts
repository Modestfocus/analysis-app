/**
 * Chat analysis routes - dedicated endpoint for chat-based chart analysis
 */

import { Request, Response } from 'express';
import { analyzeChatCharts } from '../services/chat-analysis';

/**
 * POST /api/chat/analyze - Analyze charts in chat with same pipeline as Quick Chart Analysis
 */
export const analyzeChatChartsEndpoint = async (req: Request, res: Response) => {
  try {
    const { content, systemPrompt, conversationId, isFollowUp } = req.body;

    // Validate request
    if (!content || !Array.isArray(content)) {
      return res.status(400).json({ 
        error: 'Invalid request format. Expected content array.' 
      });
    }

    if (!systemPrompt || typeof systemPrompt !== 'string') {
      return res.status(400).json({ 
        error: 'System prompt is required.' 
      });
    }

    // Check for images
    const imageCount = content.filter(part => part.type === 'image_url').length;
    
    // For new conversations, require at least one image
    // For follow-up questions, allow text-only questions
    if (imageCount === 0 && !isFollowUp) {
      return res.status(422).json({ 
        error: 'No images attached. Please attach at least one chart image for analysis.' 
      });
    }

    // For follow-up questions without images, handle differently
    if (imageCount === 0 && isFollowUp) {
      console.log(`💬 Follow-up chat question - conversation: ${conversationId}`);
      
      // For text-only follow-ups, use a simplified OpenAI call without vision
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const textContent = content.find(part => part.type === 'text')?.text || '';
      
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are continuing a chart analysis conversation. The user is asking a follow-up question about their previously analyzed trading charts. Provide helpful insights based on the context of chart analysis. Keep your response concise and focused on trading insights.`
          },
          {
            role: 'user',
            content: textContent
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      });

      const aiResponse = response.choices[0]?.message?.content || 'Unable to process follow-up question.';

      return res.json({
        success: true,
        session: 'Follow-up',
        direction: 'neutral',
        confidence: 'medium',
        rationale: aiResponse,
        analysis: aiResponse,
        similarCharts: [] // No similar charts for follow-up questions
      });
    }

    console.log(`🔍 Chat analysis request - ${imageCount} images, system prompt: ${systemPrompt.length} chars`);

    // Extract image URLs from content
    const imageUrls = content
      .filter(part => part.type === 'image_url')
      .map(part => part.image_url.url);

    if (imageUrls.length === 0) {
      return res.status(422).json({ 
        error: 'No images found in content for analysis' 
      });
    }

    // Use the unified analysis service for consistent processing
    const { analyzeChartsUnified } = await import('../services/unified-analysis');
    
    const result = await analyzeChartsUnified({
      imageUrls,
      systemPrompt,
      includeHistoricalContext: true,
      maxSimilarCharts: 3
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('❌ Chat analysis endpoint error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Analysis failed',
      details: error instanceof Error ? error.stack : undefined
    });
  }
};
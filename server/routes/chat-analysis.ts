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
    const { content, systemPrompt } = req.body;

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
    if (imageCount === 0) {
      return res.status(422).json({ 
        error: 'No images attached. Please attach at least one chart image for analysis.' 
      });
    }

    console.log(`🔍 Chat analysis request - ${imageCount} images, system prompt: ${systemPrompt.length} chars`);

    // Perform analysis
    const result = await analyzeChatCharts({ content, systemPrompt });

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
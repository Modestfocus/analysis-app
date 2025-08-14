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
    const { content, systemPrompt, conversationId, isFollowUp, enableFullAnalysis, injectText } = req.body;

    // Validate request
    if (!content || !Array.isArray(content)) {
      return res.status(400).json({ 
        error: 'Invalid request format. Expected content array.' 
      });
    }

    // systemPrompt is now optional when enableFullAnalysis is true
    if (!enableFullAnalysis && (!systemPrompt || typeof systemPrompt !== 'string')) {
      return res.status(400).json({ 
        error: 'System prompt is required when enableFullAnalysis is false.' 
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

    // Use unified RAG flow when enableFullAnalysis is true
    if (enableFullAnalysis) {
      console.log("[CHAT] /api/chat/analyze -> USING BACKEND RAG FLOW");
      console.log(`🔍 Chat analysis request (RAG) - ${imageCount} images, conversationId: ${conversationId}`);
      
      // Import and use the unified backend analysis service
      const { analyzeCharts } = await import('../services/analyze');
      
      // Extract image URLs from content
      const imageUrls = content
        .filter(part => part.type === 'image_url')
        .map(part => part.image_url.url);
      
      // Use the injectText from request (Current Prompt from dashboard) or fallback
      const { getCurrentPrompt } = await import('../services/system-prompt');
      const finalSystemPrompt = await getCurrentPrompt(injectText);
      
      const result = await analyzeCharts({ 
        imageUrls, 
        systemPrompt: finalSystemPrompt,
        options: { useRAG: true, usePreprocessing: true }
      }, req);
      
      return res.json({
        success: true,
        ...result
      });
    }

    console.log(`🔍 Chat analysis request (legacy) - ${imageCount} images, injectText: ${injectText?.length || 0} chars`);

    // Legacy path - perform full analysis for messages with images
    // Use injectText as the system prompt since frontend passes current dashboard prompt as injectText
    const result = await analyzeChatCharts({ content, systemPrompt: injectText || systemPrompt }, req);

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
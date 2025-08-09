import { Request, Response } from 'express';
import multer from 'multer';
import { storage } from './storage';
import { insertChatConversationSchema, insertChatMessageSchema } from '@shared/schema';
import { z } from 'zod';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { getSystemPromptMergedFromDB } from './services/system-prompt';

// Configure multer for image uploads
const upload = multer({
  dest: 'server/uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper function to convert image to base64
const imageToBase64 = (imagePath: string): string => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64Image}`;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    return '';
  }
};

// Helper function to analyze chart with GPT-4o
const analyzeChartWithGPT = async (
  systemPrompt: string,
  userMessage: string,
  imageUrls: string[],
  conversationHistory: any[]
) => {
  try {
    // Prepare messages with conversation history
    const messages: any[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Add conversation history (last 10 messages to keep context manageable)
    const recentHistory = conversationHistory.slice(-10);
    recentHistory.forEach(msg => {
      if (msg.role !== 'system') {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    });

    // Add current user message with images
    const userContent: any[] = [
      {
        type: 'text',
        text: userMessage || 'Please analyze this chart and provide insights.',
      }
    ];

    // Add images to the message
    imageUrls.forEach(url => {
      if (url.startsWith('data:')) {
        // Base64 data URL
        userContent.push({
          type: 'image_url',
          image_url: { url }
        });
      } else {
        // Convert file path to base64
        const base64Url = imageToBase64(url);
        if (base64Url) {
          userContent.push({
            type: 'image_url',
            image_url: { url: base64Url }
          });
        }
      }
    });

    messages.push({
      role: 'user',
      content: userContent,
    });

    // Get GPT-4o response
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages,
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Error analyzing chart with GPT-4o:', error);
    throw new Error('Failed to analyze chart with GPT-4o');
  }
};

// Get user's chat conversations
export const getChatConversations = async (req: Request, res: Response) => {
  try {
    const userId = '1'; // TODO: Get from session
    const conversations = await storage.getUserChatConversations(userId);
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

// Create new conversation
export const createChatConversation = async (req: Request, res: Response) => {
  try {
    const userId = 1; // TODO: Get from session
    const { title } = insertChatConversationSchema.parse({
      ...req.body,
      userId,
    });

    const conversation = await storage.createChatConversation({
      userId,
      title,
    });

    res.json(conversation);
  } catch (error) {
    console.error('Error creating conversation:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  }
};

// Get messages for a conversation
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const messages = await storage.getConversationMessages(conversationId);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

// Send message to conversation (updated to handle AI responses from chat analysis)
export const sendChatMessage = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { content, imageUrls, aiResponse } = req.body;

    // Validate input
    if (!content && (!imageUrls || imageUrls.length === 0)) {
      return res.status(400).json({ error: 'Message content or images required' });
    }

    // Create user message
    const userMessage = await storage.createChatMessage({
      conversationId,
      role: 'user',
      content: content || '',
      imageUrls: imageUrls || [],
    });

    // If AI response is provided (from chat analysis), save it
    if (aiResponse) {
      // Format the AI response for display
      let formattedResponse = '';
      if (aiResponse.prediction && aiResponse.reasoning) {
        formattedResponse = `## Technical Analysis\n\n`;
        formattedResponse += `**Prediction:** ${aiResponse.prediction}\n`;
        formattedResponse += `**Best Session:** ${aiResponse.session}\n`;
        formattedResponse += `**Confidence:** ${aiResponse.confidence}\n\n`;
        formattedResponse += `**Analysis:**\n${aiResponse.reasoning}`;
        
        if (aiResponse.similarCharts && aiResponse.similarCharts.length > 0) {
          formattedResponse += `\n\n**Similar Historical Patterns:**\n`;
          aiResponse.similarCharts.forEach((chart: any, index: number) => {
            formattedResponse += `${index + 1}. ${chart.filename} (${chart.instrument}, ${chart.timeframe}) - ${(chart.similarity * 100).toFixed(1)}% similarity\n`;
          });
        }
      } else {
        formattedResponse = typeof aiResponse === 'object' ? JSON.stringify(aiResponse, null, 2) : String(aiResponse);
      }

      // Create assistant message
      const assistantMessage = await storage.createChatMessage({
        conversationId,
        role: 'assistant',
        content: formattedResponse,
        metadata: {
          confidence: aiResponse.confidence === 'High' ? 0.9 : aiResponse.confidence === 'Medium' ? 0.7 : 0.5,
          analysisType: 'chat_analysis',
          visualMapsIncluded: aiResponse.visualMapsIncluded,
          similarChartsCount: aiResponse.similarCharts?.length || 0
        }
      });
    }

    // Update conversation timestamp
    await storage.updateChatConversation(conversationId, {
      updatedAt: new Date(),
    });

    res.json({
      success: true,
      userMessage,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request data', details: error.errors });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
};

// Upload image for chat
export const uploadChatImage = [
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      // Return the file path that can be used in chat messages
      res.json({
        imageUrl: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname,
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  },
];
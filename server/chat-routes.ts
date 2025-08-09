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

// Send message to conversation
export const sendChatMessage = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { content, systemPrompt } = req.body;

    // Extract text and images from vision content format
    let textContent = '';
    let imageUrls: string[] = [];
    
    if (Array.isArray(content)) {
      // New vision content format
      content.forEach((item: any) => {
        if (item.type === 'text') {
          textContent = item.text;
        } else if (item.type === 'image_url') {
          imageUrls.push(item.image_url.url);
        }
      });
    } else if (typeof content === 'string') {
      // Legacy text content
      textContent = content;
    }

    // Validate input
    if (!textContent && imageUrls.length === 0) {
      return res.status(400).json({ error: 'Message content or images required' });
    }

    // Get conversation history for context
    const conversationHistory = await storage.getConversationMessages(conversationId);

    // Create user message
    const userMessage = await storage.createChatMessage({
      conversationId,
      role: 'user',
      content: textContent || '',
      imageUrls: imageUrls || [],
    });

    // Analyze with shared analysis service if images are provided or if it's a follow-up question
    let assistantResponse = '';
    let metadata = null;

    if (imageUrls.length > 0 || textContent) {
      try {
        // Use shared analysis service
        const { analyzeCharts } = await import('./services/analyze');
        
        if (imageUrls.length > 0) {
          // Chart analysis with images
          const finalSystemPrompt = systemPrompt || await getSystemPromptMergedFromDB();
          const result = await analyzeCharts({
            imageUrls,
            systemPrompt: finalSystemPrompt,
            options: {
              usePreprocessing: true,
              useRAG: true,
              stream: false
            }
          });
          
          assistantResponse = typeof result.analysis === 'string' ? result.analysis : JSON.stringify(result.analysis, null, 2);
          metadata = {
            confidence: result.confidence || 0.85,
            analysisType: 'chart_analysis',
            similarChartsCount: result.similarCharts?.length || 0
          };
        } else {
          // Text-only response using GPT-4o
          const finalSystemPrompt = systemPrompt || await getSystemPromptMergedFromDB();
          assistantResponse = await analyzeChartWithGPT(
            finalSystemPrompt,
            textContent,
            [],
            conversationHistory
          );
          
          metadata = {
            confidence: 0.8,
            analysisType: 'text_response',
          };
        }
      } catch (error) {
        assistantResponse = 'I apologize, but I encountered an error while analyzing your request. Please try again or contact support if the issue persists.';
        console.error('Analysis error:', error);
      }
    }

    // Create assistant message
    const assistantMessage = await storage.createChatMessage({
      conversationId,
      role: 'assistant',
      content: assistantResponse,
      metadata,
    });

    // Update conversation timestamp
    await storage.updateChatConversation(conversationId, {
      updatedAt: new Date(),
    });

    res.json({
      userMessage,
      assistantMessage,
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
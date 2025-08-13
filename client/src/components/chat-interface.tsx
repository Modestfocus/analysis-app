import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Bot, 
  User, 
  Send, 
  Upload, 
  Image as ImageIcon, 
  Loader2,
  Maximize2,
  Copy,
  Paperclip,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Utility function to generate UUID
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Utility function to compute SHA-256 hash
async function computeFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Utility function to get image dimensions
function getImageDimensions(dataUrl: string): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Component to display similar chart images
function SimilarChartImage({ chartId, filename }: { chartId: number; filename: string }) {
  const { data: chart, isLoading, error } = useQuery({
    queryKey: ['/api/charts', chartId],
    enabled: !!chartId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error || !chart) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Failed to load chart image</p>
        <p className="text-sm">{filename}</p>
      </div>
    );
  }

  const imageUrl = `/uploads/${(chart as any).filename}`;

  return (
    <div className="space-y-3">
      <img
        src={imageUrl}
        alt={`Chart: ${filename}`}
        className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600"
        onError={(e) => {
          console.error('Failed to load chart image:', imageUrl);
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      {(chart as any).depthMapPath && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Depth Map Analysis:
          </h5>
          <img
            src={(chart as any).depthMapPath}
            alt={`Depth map for ${filename}`}
            className="w-full h-auto rounded-lg border border-gray-200 dark:border-gray-600"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrls?: string[];
  metadata?: any;
  createdAt: string;
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatInterfaceProps {
  systemPrompt?: string;
  isExpanded?: boolean;
}

type UploadedImage = {
  id: string;              // uuid
  name: string;
  sizeBytes: number;
  mime: string;
  dataUrl: string;         // base64 data URL
  width?: number;          // populated after decode (optional)
  height?: number;         // populated after decode (optional)
  createdAt: number;       // Date.now()
};

export default function ChatInterface({ systemPrompt, isExpanded = false }: ChatInterfaceProps) {
  // Get current prompt from localStorage to match dashboard System Prompt tab
  const getCurrentPrompt = () => {
    const savedDefault = localStorage.getItem('systemPrompt_default') || "You are an expert trading chart analyst. Analyze the provided chart with precision and provide detailed technical insights including support/resistance levels, trend analysis, and potential trading opportunities.";
    const savedInject = localStorage.getItem('systemPrompt_inject') || '';
    return `${savedDefault}${savedInject ? `\n\n${savedInject}` : ''}`;
  };
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's conversations
  const { data: conversations } = useQuery({
    queryKey: ['/api/chat/conversations'],
  });

  // Fetch active conversation messages
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/chat/conversations', activeConversationId, 'messages'],
    enabled: !!activeConversationId,
  });

  // Create new conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/chat/conversations', { title });
      return response.json();
    },
    onSuccess: (conversation: any) => {
      setActiveConversationId(conversation.id);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, userMessage }: { 
      conversationId: string; 
      userMessage: string;
    }) => {
      // Build vision content array from text and uploaded images
      const visionContent: any[] = [
        { type: "text", text: userMessage?.trim() || "Analyze this chart" },
        ...uploadedImages.map(img => ({
          type: "image_url",
          image_url: { url: img.dataUrl, detail: "high" }
        }))
      ];
      
      // Calculate total payload size for safety check
      const totalPayloadSize = uploadedImages.reduce((sum, img) => sum + img.sizeBytes, 0);
      if (totalPayloadSize > 9 * 1024 * 1024) { // 9MB limit
        throw new Error(`Payload too large: ${(totalPayloadSize / (1024 * 1024)).toFixed(2)}MB. Maximum is 9MB.`);
      }
      
      // Get inject text from dashboard if present
      const injectText = localStorage.getItem('systemPrompt_inject') || '';
      
      // Check if this is a follow-up
      const hasExistingMessages = Array.isArray(messages) && messages.length > 0;
      const isFollowUp = Boolean(conversationId) && hasExistingMessages;
      
      // Debug logging
      if (localStorage.getItem('NET_DEBUG') === '1') {
        const payloadSummary = {
          textLength: userMessage?.length || 0,
          imageCount: uploadedImages.length,
          totalBytes: totalPayloadSize,
          dataUrlPreviews: uploadedImages.map(img => img.dataUrl.substring(0, 40) + '...')
        };
        console.log('[POST] /api/chat/analyze', payloadSummary);
      }
      
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 45000); // 45s timeout
      
      try {
        // POST to analysis endpoint
        const response = await fetch("/api/chat/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: visionContent,
            systemPrompt: undefined,        // let backend build the unified prompt
            conversationId,
            isFollowUp,
            enableFullAnalysis: true,
            injectText: injectText || undefined,
          }),
          signal: abortController.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Save both user message and AI response to conversation
        await apiRequest('POST', `/api/chat/conversations/${conversationId}/messages`, { 
          content: userMessage || '',
          imageUrls: uploadedImages.map(img => img.dataUrl),
          aiResponse: result
        });
        
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        if (abortController.signal.aborted) {
          throw new Error('Request timeout - analysis took too long');
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/chat/conversations', activeConversationId, 'messages'] 
      });
      setMessage('');
      setUploadedImages([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error sending message",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Global paste listener for images
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Only handle paste if we're not in an input field
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') === 0) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        // Create a FileList-like object from the files array
        const fileListData = Object.assign(imageFiles, {
          item: (index: number) => imageFiles[index] || null,
        });
        
        handleFileUpload(fileListData as unknown as FileList);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [uploadedImages, activeConversationId]);

  // Handle file uploads with enhanced validation and deduplication
  const handleFileUpload = async (files: FileList) => {
    const fileArray = Array.from(files);
    
    // Validate each file
    const validationResults = await Promise.allSettled(
      fileArray.map(async (file) => {
        console.assert(file.size <= 10 * 1024 * 1024, "File too large");
        
        // MIME validation
        if (!file.type.startsWith('image/')) {
          throw new Error(`Invalid file type: ${file.type}. Only image files are allowed.`);
        }
        
        // Size validation
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum size is 10MB.`);
        }
        
        return file;
      })
    );
    
    // Extract valid files and collect errors
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    validationResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        validFiles.push(result.value);
      } else {
        errors.push(`${fileArray[index].name}: ${result.reason.message}`);
      }
    });
    
    // Show error toast if there were validation failures
    if (errors.length > 0) {
      toast({
        title: "Invalid files",
        description: errors.join('\n'),
        variant: "destructive",
      });
    }
    
    if (validFiles.length > 0) {
      // Auto-start conversation if this is the first image and no conversation exists
      if (!activeConversationId) {
        const title = `Chart Analysis - ${new Date().toLocaleDateString()}`;
        createConversationMutation.mutate(title);
      }

      // Process each valid file
      const newImages: UploadedImage[] = [];
      
      for (const file of validFiles) {
        try {
          // Compute hash for deduplication
          const fileHash = await computeFileHash(file);
          
          // Check if image already exists (by hash)
          const existingImage = uploadedImages.find(img => {
            // Extract hash from data URL if we stored it
            return img.id.includes(fileHash.substring(0, 8));
          });
          
          if (existingImage) {
            console.log(`Skipping duplicate image: ${file.name}`);
            continue;
          }
          
          // Convert to data URL
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          // Get image dimensions
          const dimensions = await getImageDimensions(dataUrl);
          
          // Create UploadedImage object
          const uploadedImage: UploadedImage = {
            id: `${generateId()}-${fileHash.substring(0, 8)}`,
            name: file.name,
            sizeBytes: file.size,
            mime: file.type,
            dataUrl,
            width: dimensions.width,
            height: dimensions.height,
            createdAt: Date.now(),
          };
          
          newImages.push(uploadedImage);
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          toast({
            title: "File processing error",
            description: `Failed to process ${file.name}`,
            variant: "destructive",
          });
        }
      }
      
      // Add new images to state
      if (newImages.length > 0) {
        setUploadedImages(prev => [...prev, ...newImages]);
        
        // Debug logging
        if (localStorage.getItem('UPLOAD_DEBUG') === '1') {
          console.table(newImages.map(({id, name, sizeBytes, mime}) => ({id, name, sizeBytes, mime})));
        }
      }
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    if (e.dataTransfer.files) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      // Create a FileList-like object from the files array
      const fileListData = Object.assign(imageFiles, {
        item: (index: number) => imageFiles[index] || null,
      });
      
      handleFileUpload(fileListData as unknown as FileList);
    }
  };

  // Send message
  const handleSendMessage = () => {
    // Allow text-only messages if there's an active conversation with existing messages
    const hasExistingMessages = Array.isArray(messages) && messages.length > 0;
    const canSendTextOnly = hasExistingMessages && message.trim();
    
    if ((!message.trim() && uploadedImages.length === 0) || sendMessageMutation.isPending) {
      return;
    }

    // For new conversations, require at least one image or text
    if (!activeConversationId && uploadedImages.length === 0 && !message.trim()) {
      return;
    }

    if (!activeConversationId) {
      const title = `Chat - ${new Date().toLocaleDateString()}`;
      createConversationMutation.mutate(title);
      return;
    }

    sendMessageMutation.mutate({
      conversationId: activeConversationId,
      userMessage: message.trim(),
    });
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    
    // Debug logging
    if (localStorage.getItem('UPLOAD_DEBUG') === '1') {
      console.log(`Removed image at index ${index}`);
    }
  };

  return (
    <div className={`flex flex-col h-full transition-all duration-300 ${
      isExpanded ? 'w-full' : 'flex-1'
    }`}>
      {/* Chat Header */}
      <div className="border-b border-gray-200 dark:border-[#3a3a3a] p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          GPT-4o Chart Analysis
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Upload charts, ask questions, and get AI-powered insights using your current dashboard prompt
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Show upload area only when no messages exist in the active conversation */}
        {(!activeConversationId || !messages || (Array.isArray(messages) && messages.length === 0)) && (
          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
          >
            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Start Your Analysis
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Drop a chart image here, paste from clipboard, or upload manually
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="mx-auto"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Chart
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              className="hidden"
            />
          </div>
        )}

        {/* Messages */}
        {activeConversationId && (
          <>
            {messagesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : (
              (messages as ChatMessage[])?.map((msg: ChatMessage) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-4 ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-[#2d3748] text-gray-900 dark:text-white'
                    }`}
                  >
                    <div className="flex items-center mb-2">
                      {msg.role === 'user' ? (
                        <User className="w-4 h-4 mr-2" />
                      ) : (
                        <Bot className="w-4 h-4 mr-2" />
                      )}
                      <span className="text-xs font-medium">
                        {msg.role === 'user' ? 'You' : 'GPT-4o'}
                      </span>
                      <span className="text-xs opacity-60 ml-2">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    {/* Display uploaded images */}
                    {msg.imageUrls && msg.imageUrls.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {msg.imageUrls.map((url, index) => (
                          <Dialog key={index}>
                            <DialogTrigger>
                              <img
                                src={url}
                                alt={`Uploaded chart ${index + 1}`}
                                className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80"
                              />
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                              <DialogTitle>Chart Image {index + 1}</DialogTitle>
                              <DialogDescription>
                                Full view of uploaded chart image
                              </DialogDescription>
                              <div className="pb-4">
                                <img
                                  src={url}
                                  alt={`Full chart ${index + 1}`}
                                  className="w-full h-auto rounded-lg"
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        ))}
                      </div>
                    )}
                    
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {/* Display analysis metadata */}
                    {msg.metadata && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.metadata.confidence && (
                            <Badge variant="secondary">
                              Confidence: {(typeof msg.metadata.confidence === 'number' ? (msg.metadata.confidence * 100) : msg.metadata.confidence).toString().replace('%', '')}%
                            </Badge>
                          )}
                          {msg.metadata.similarCharts && (
                            <Badge variant="outline">
                              {msg.metadata.similarCharts.length} Similar Charts
                            </Badge>
                          )}
                        </div>
                        
                        {/* Similar Historical Patterns */}
                        {msg.metadata.similarCharts && msg.metadata.similarCharts.length > 0 && (
                          <div className="mt-3 space-y-3">
                            <div className="text-sm font-medium flex items-center gap-2">
                              <Activity className="h-4 w-4 text-purple-600" />
                              Similar Historical Patterns ({msg.metadata.similarCharts.length})
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {msg.metadata.similarCharts.slice(0, 3).map((s: any, i: number) => {
                                const c = s.chart;
                                const similarity = (s.similarity * 100).toFixed(1);
                                const originalChartPath = `/charts/${c.filename}`;
                                
                                return (
                                  <div key={c.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    {/* Chart thumbnail - clickable to open original */}
                                    <div className="cursor-pointer" onClick={() => window.open(originalChartPath, '_blank')}>
                                      <div className="relative mb-2">
                                        <img 
                                          src={originalChartPath} 
                                          alt={`${c.instrument} ${c.timeframe} chart`}
                                          className="w-full h-20 object-cover rounded border"
                                          onError={(e) => {
                                            e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100%" height="100%" fill="%23f3f4f6"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%236b7280">Chart</text></svg>';
                                          }}
                                        />
                                        <div className="absolute top-1 right-1">
                                          <Badge variant="secondary" className="text-xs bg-white/90 text-gray-800">
                                            {similarity}%
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Chart info */}
                                    <div className="space-y-1 mb-2">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {c.instrument ?? "UNKNOWN"}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400">
                                        {c.timeframe ?? "Unknown timeframe"}
                                      </div>
                                    </div>
                                    
                                    {/* Action links */}
                                    <div className="flex gap-2">
                                      {c.depthMapPath && (
                                        <button 
                                          onClick={() => window.open(c.depthMapPath, '_blank')}
                                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                        >
                                          Depth
                                        </button>
                                      )}
                                      {c.edgeMapPath && (
                                        <button 
                                          onClick={() => window.open(c.edgeMapPath, '_blank')}
                                          className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
                                        >
                                          Edge
                                        </button>
                                      )}
                                      {c.gradientMapPath && (
                                        <button 
                                          onClick={() => window.open(c.gradientMapPath, '_blank')}
                                          className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                                        >
                                          Gradient
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-[#3a3a3a] p-4">
        {/* Uploaded Images Preview */}
        {uploadedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {uploadedImages.map((image, index) => (
              <div key={image.id} className="relative">
                <img
                  src={image.dataUrl}
                  alt={`Upload preview: ${image.name}`}
                  title={`${image.name} (${(image.sizeBytes / (1024 * 1024)).toFixed(2)}MB)${image.width && image.height ? ` - ${image.width}x${image.height}` : ''}`}
                  className="w-16 h-16 object-cover rounded border"
                />
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute -top-2 -right-2 w-5 h-5 p-0 rounded-full"
                  onClick={() => removeImage(index)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                uploadedImages.length > 0 
                  ? "Ask a question about your chart..." 
                  : "Type a message or paste an image..."
              }
              className="resize-none min-h-[60px] pr-12"
              disabled={sendMessageMutation.isPending}
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute bottom-2 right-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
          </div>
          
          <Button
            onClick={handleSendMessage}
            disabled={(!message.trim() && uploadedImages.length === 0) || sendMessageMutation.isPending}
            className="self-end"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
          className="hidden"
        />

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Press Shift + Enter for new line, Enter to send
        </p>
      </div>
    </div>
  );
}
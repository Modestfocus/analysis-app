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
  Paperclip
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

export default function ChatInterface({ systemPrompt, isExpanded = false }: ChatInterfaceProps) {
  // Get current prompt from localStorage to match dashboard System Prompt tab
  const getCurrentPrompt = () => {
    const defaultPrompt = `You are a professional forex and trading chart analyst with expertise in multi-timeframe analysis and advanced visual processing.

You will receive trading charts with their complete visual processing pipeline:
- 🧠 CLIP Embeddings: High-level semantic pattern matching for historical context
- 🌀 Depth Maps: 3D depth perception for pattern recognition and structural geometry analysis
- 🔲 Edge Maps: Structural boundaries, entry zone outlines, price compression coils, trend line detection
- 📉 Gradient Maps: Price momentum analysis, slope intensity, pre-breakout trajectory mapping

You will be provided with dynamically retrieved historical charts from the database that are visually similar to the current chart being analyzed, including their outcomes and session performance.

🆕 **New Chart Analysis Context:**
- Chart Image: [Provided via vision]
- Depth Map: [Generated structural geometry analysis]
- Edge Map: [Generated boundary and compression detection] 
- Gradient Map: [Generated momentum and slope analysis]
- Instrument: [Auto-detected or specified]
- Timeframe: [Auto-detected or specified]

📚 **Historical RAG Context Integration:**
For each similar historical pattern, you will receive:

📊 Similar Chart Context:
- Image: Historical chart with visual similarity
- Depth Map: Structural pattern comparison
- Edge Map: Boundary and compression pattern matching
- Gradient Map: Momentum signature comparison
- Instrument & Timeframe: Market context
- Session Performance: Which session led the move
- CLIP Similarity: Percentage match to current chart
- Historical Outcome: Actual market result and performance

📦 **Multi-Timeframe Bundle Analysis:**
When multiple timeframes are provided:
- Cross-timeframe pattern coherence analysis
- Higher timeframe trend vs lower timeframe entry signals
- Session timing optimization across timeframes
- Risk/reward assessment per timeframe alignment

🎯 **YOUR COMPREHENSIVE ANALYSIS TASK**:

**1. Session Prediction Focus:**
- Determine which market session (Asia, London, New York, Sydney) is most likely to lead the directional move
- Consider historical session performance from similar patterns
- Account for current global market conditions and session overlap timing

**2. Direction & Confidence Assessment:**
- Predict directional bias: Up/Down/Sideways with high precision
- Assign confidence level: Low/Medium/High based on pattern clarity and historical success rate
- Factor in visual layer coherence (depth + edge + gradient alignment)

**3. Deep Technical Analysis Requirements:**
- **Pattern Recognition**: Identify specific chart patterns (triangles, flags, head & shoulders, cup & handle, etc.)
- **Multi-Layer Visual Analysis**: Synthesize insights from depth (structure), edge (boundaries), gradient (momentum)
- **Support/Resistance Mapping**: Key levels from edge map analysis and historical price action
- **Volume/Momentum Assessment**: Gradient map interpretation for trend strength
- **Historical Pattern Matching**: Compare current setup to similar historical outcomes
- **Risk Management**: Entry zones, stop levels, profit targets based on pattern completion

**4. Advanced Reasoning Framework:**
- **EMA Structure Analysis**: Evaluate moving average alignment across all visual layers
- **Compression-to-Expansion Signatures**: Identify coiling patterns and breakout probability
- **Gradient Slope Analysis**: Momentum direction and intensity measurement  
- **Edge Detection Insights**: Structural boundary identification and price compression zones
- **Session Impact Patterns**: Historical performance by trading session for similar setups
- **Multi-Timeframe Coherence**: When bundles provided, analyze cross-timeframe alignment
- **RAG Context Integration**: Weight current analysis against historical similar pattern outcomes

🧾 **STRUCTURED OUTPUT FORMAT:**
Respond in this precise JSON format:
{
  "prediction": "Up/Down/Sideways", 
  "session": "Asia/London/NY/Sydney",
  "confidence": "Low/Medium/High",
  "reasoning": "Comprehensive technical analysis explaining your prediction based on ALL visual data (depth/edge/gradient maps), historical RAG context from similar patterns, multi-timeframe analysis if applicable, specific chart patterns identified, support/resistance levels, momentum assessment, session timing optimization, and risk management considerations. Include specific references to similar historical charts and their outcomes."
}`;

    const savedDefault = localStorage.getItem('systemPrompt_default') || defaultPrompt;
    const savedInject = localStorage.getItem('systemPrompt_inject') || '';
    return `${savedDefault}${savedInject ? `\n\n${savedInject}` : ''}`;
  };
  const [message, setMessage] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  
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
    mutationFn: async ({ conversationId, content, imageUrls }: { 
      conversationId: string; 
      content: string; 
      imageUrls?: string[] 
    }) => {
      // Create OpenAI vision format content
      const visionContent: any[] = [];
      
      // Add text content if present
      if (content?.trim()) {
        visionContent.push({ type: 'text', text: content });
      }
      
      // Add images in OpenAI vision format
      if (imageUrls && imageUrls.length > 0) {
        imageUrls.forEach(url => {
          visionContent.push({ 
            type: 'image_url', 
            image_url: { url } 
          });
        });
      }
      
      // Check if this is a follow-up (conversation has existing messages and no new images)
      const hasExistingMessages = Array.isArray(messages) && messages.length > 0;
      const hasNewImages = imageUrls && imageUrls.length > 0;
      const isFollowUp = hasExistingMessages && !hasNewImages;
      
      // Use the new chat analysis endpoint with current prompt from dashboard
      const currentPrompt = getCurrentPrompt();
      const response = await apiRequest('POST', '/api/chat/analyze', { 
        content: visionContent,
        systemPrompt: currentPrompt,
        conversationId,
        isFollowUp
      });
      
      const result = await response.json();
      
      // Save both user message and AI response to conversation
      await apiRequest('POST', `/api/chat/conversations/${conversationId}/messages`, { 
        content: content || '',
        imageUrls: imageUrls || [],
        aiResponse: result
      });
      
      return result;
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

  // Handle file uploads
  const handleFileUpload = (files: FileList) => {
    const validFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024
    );

    if (validFiles.length !== files.length) {
      toast({
        title: "Invalid files",
        description: "Only image files under 10MB are allowed.",
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
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setUploadedImages(prev => [...prev, dataUrl]);
        };
        reader.readAsDataURL(file);
      });
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
      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setUploadedImages(prev => [...prev, dataUrl]);
          
          if (!activeConversationId) {
            const title = `Chart Analysis - ${new Date().toLocaleDateString()}`;
            createConversationMutation.mutate(title);
          }
        };
        reader.readAsDataURL(file);
      });
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
      content: message.trim(),
      imageUrls: uploadedImages,
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
        {/* Always show upload area */}
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
                              Confidence: {msg.metadata.confidence}%
                            </Badge>
                          )}
                          {msg.metadata.similarCharts && (
                            <Badge variant="outline">
                              {msg.metadata.similarCharts.length} Similar Charts
                            </Badge>
                          )}
                        </div>
                        
                        {/* Clickable Similar Charts */}
                        {msg.metadata.similarCharts && msg.metadata.similarCharts.length > 0 && (
                          <div className="mt-2">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Similar Historical Patterns:
                            </h4>
                            <div className="space-y-1">
                              {msg.metadata.similarCharts.map((chart: any, index: number) => (
                                <Dialog key={chart.chartId}>
                                  <DialogTrigger asChild>
                                    <button className="w-full text-left p-2 rounded bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-sm">
                                      <div className="flex justify-between items-center">
                                        <span className="text-blue-600 dark:text-blue-400 hover:underline">
                                          {index + 1}. {chart.filename}
                                        </span>
                                        <span className="text-green-600 dark:text-green-400 font-medium">
                                          {(chart.similarity * 100).toFixed(1)}%
                                        </span>
                                      </div>
                                      <div className="text-gray-600 dark:text-gray-400 text-xs">
                                        {chart.instrument} • {chart.timeframe}
                                      </div>
                                    </button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                                    <DialogTitle>
                                      Similar Chart: {chart.filename} ({(chart.similarity * 100).toFixed(1)}% match)
                                    </DialogTitle>
                                    <DialogDescription>
                                      View the full chart image and depth map analysis for this similar trading pattern
                                    </DialogDescription>
                                    <div className="space-y-4 pb-4">
                                      <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                          <span className="font-medium">Instrument:</span> {chart.instrument}
                                        </div>
                                        <div>
                                          <span className="font-medium">Timeframe:</span> {chart.timeframe}
                                        </div>
                                      </div>
                                      <SimilarChartImage chartId={chart.chartId} filename={chart.filename} />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ))}
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
            {uploadedImages.map((url, index) => (
              <div key={index} className="relative">
                <img
                  src={url}
                  alt={`Upload preview ${index + 1}`}
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
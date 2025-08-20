import { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Bot, 
  User, 
  Send, 
  Upload, 
  Image as ImageIcon, 
  Loader2,
  Paperclip,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import AnalysisCard from "./AnalysisCard";
import { normalizeAnalysis } from '../lib/normalize-analysis';

// Safely turn whatever the assistant returned into an object
function safeParseAI(raw: any) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

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

  // Local client-side buffer so we can append bubbles immediately
  const [clientMessages, setClientMessages] = useState<ChatMessage[]>([]);

 // Minimal helper to add a user/assistant message to the buffer
function addMessage(m: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  aiResponse?: any;      // only for assistant
  imageUrls?: string[];  // NEW
  createdAt: number;     // Date.now()
}) {
  setClientMessages((prev) => [
    ...prev,
    {
      id: m.id,
      role: m.role,
      content: m.content,
      // pass-through so AnalysisCard can read it
      // @ts-ignore
      aiResponse: m.aiResponse,
      imageUrls: m.imageUrls ?? [], // NEW
      // ChatMessage expects a string; store ISO
      createdAt: new Date(m.createdAt).toISOString(),
    } as ChatMessage,
  ]);
}

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

  // Send message mutation (posts to our server and appends assistant message)
  const sendMessageMutation = useMutation({
  mutationFn: async ({
    text,
    images,
  }: {
    text: string;
    images: string[];
  }) => {
    // pull the live “Current Prompt” from the dashboard tab (Default + Inject)
    const systemPrompt =
      (localStorage.getItem("systemPrompt_default") || "") +
      ((localStorage.getItem("systemPrompt_inject") || "")
        ? "\n\n" + localStorage.getItem("systemPrompt_inject")
        : "");

    const wantSimilar = true;

    const res = await fetch("/api/chat/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, images, systemPrompt, wantSimilar }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`analyze failed: ${res.status} ${errText}`);
    }

    return res.json(); // -> { result: {...} }
  }, // <-- REQUIRED comma to separate props

onSuccess: (json: any) => {
  addMessage({
    id:
      crypto?.randomUUID?.() ??
      `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    role: "assistant",
    content: "",
    aiResponse: json, // <— use the server JSON directly
    createdAt: Date.now(),
  });

  try { setUploadedImages([]); } catch {}
},

  onError: (error: any) => {
    toast({
      title: "Error sending message",
      description: error?.message || "Failed to send message. Please try again.",
      variant: "destructive",
    });
  },
});

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, clientMessages]);

  // Clear local buffer when switching conversations
  useEffect(() => {
    setClientMessages([]);
  }, [activeConversationId]);

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

    // Show the user's bubble before clearing the input
    const userText = message.trim();
   addMessage({
  id:
    crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  role: "user",
  content: userText,
  imageUrls: uploadedImages.map((img) => img.dataUrl), // NEW
  createdAt: Date.now(),
});

    // clear the input so the UI is responsive
    setMessage("");

    // kick off analysis
    sendMessageMutation.mutate({
      text: userText,                                   // text for the server
      images: uploadedImages.map((img) => img.dataUrl), // base64 data URLs
    });

    // clear uploaded images after send
    try { setUploadedImages?.([]); } catch {}
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

  // Merge server-fetched messages with local buffer
  const fetchedMessages: ChatMessage[] = Array.isArray(messages)
    ? (messages as ChatMessage[])
    : [];
  const displayedMessages: ChatMessage[] = [...fetchedMessages, ...clientMessages];

  return (
    <div
      className={`flex flex-col h-full transition-all duration-300 ${
        isExpanded ? 'w-full' : 'flex-1'
      }`}
    >
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
        {/* Empty-state uploader */}
        {(!activeConversationId || displayedMessages.length === 0) && (
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
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="mx-auto">
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

        {/* Conversation messages */}
        {activeConversationId && (
          <>
            {messagesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : (
              displayedMessages.map((msg: ChatMessage) => (
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

                    {/* Assistant -> card ; User -> text */}
                    {msg.role === 'assistant' ? (
                      (() => {
                        const parsed = safeParseAI((msg as any).aiResponse ?? msg.content);
console.debug('[AI RAW]', (msg as any).aiResponse ?? msg.content);
                        if (!parsed) {
                          return <pre className="text-xs whitespace-pre-wrap">{msg.content}</pre>;
                        }
                        const data = normalizeAnalysis(parsed);
                       return (
  <>
    <AnalysisCard data={data} />
        {/* Target chart (clickable) */}
    {data?.targetVisuals?.original && (
      <div className="mt-4">
        <div className="text-sm font-semibold mb-2">Target Chart</div>
        <a href={data.targetVisuals.original} target="_blank" rel="noreferrer">
          <img
            src={data.targetVisuals.original}
            alt="target"
            className="w-full max-w-2xl rounded-lg border border-gray-700"
          />
        </a>

        {/* Optional: quick map thumbnails */}
        <div className="mt-3 grid grid-cols-3 gap-2 max-w-2xl">
          {data.targetVisuals.depth && (
            <a href={data.targetVisuals.depth} target="_blank" rel="noreferrer" title="Depth">
              <img src={data.targetVisuals.depth} alt="depth" className="w-full h-24 object-cover rounded-md border border-gray-700" />
            </a>
          )}
          {data.targetVisuals.edge && (
            <a href={data.targetVisuals.edge} target="_blank" rel="noreferrer" title="Edge">
              <img src={data.targetVisuals.edge} alt="edge" className="w-full h-24 object-cover rounded-md border border-gray-700" />
            </a>
          )}
          {data.targetVisuals.gradient && (
            <a href={data.targetVisuals.gradient} target="_blank" rel="noreferrer" title="Gradient">
              <img src={data.targetVisuals.gradient} alt="gradient" className="w-full h-24 object-cover rounded-md border border-gray-700" />
            </a>
          )}
        </div>
      </div>
    )}
    {/* Similar charts gallery (clickable thumbnails) */}
    {Array.isArray(data.similarImages) && data.similarImages.length > 0 && (
      <div className="mt-6">
        <div className="text-sm font-semibold mb-3">Similar Charts</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.similarImages.map((s: any, idx: number) => (
            <div key={s.id || idx} className="rounded-xl border border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm opacity-80">{s.label || `Similar ${idx + 1}`}</div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline opacity-80 hover:opacity-100"
                  >
                    Open
                  </a>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {s.original && (
                  <a href={s.original} target="_blank" rel="noreferrer" title="Original">
                    <img src={s.original} alt="original" className="w-full h-20 object-cover rounded-md" />
                  </a>
                )}
                {s.depth && (
                  <a href={s.depth} target="_blank" rel="noreferrer" title="Depth map">
                    <img src={s.depth} alt="depth" className="w-full h-20 object-cover rounded-md" />
                  </a>
                )}
                {s.edge && (
                  <a href={s.edge} target="_blank" rel="noreferrer" title="Edge map">
                    <img src={s.edge} alt="edge" className="w-full h-20 object-cover rounded-md" />
                  </a>
                )}
                {s.gradient && (
                  <a href={s.gradient} target="_blank" rel="noreferrer" title="Gradient map">
                    <img src={s.gradient} alt="gradient" className="w-full h-20 object-cover rounded-md" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </>
);
                      })()
                   ) : (
  <>
    <div className="whitespace-pre-wrap">{msg.content}</div>

    {Array.isArray(msg.imageUrls) && msg.imageUrls.length > 0 && (
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {msg.imageUrls.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`upload ${i + 1}`}
            className="w-full h-24 object-cover rounded-md border border-gray-600"
          />
        ))}
      </div>
    )}
  </>
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
        {uploadedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {uploadedImages.map((image, index) => (
              <div key={image.id} className="relative">
                <img
                  src={image.dataUrl}
                  alt={`Upload preview: ${image.name}`}
                  title={`${image.name} (${(image.sizeBytes / (1024 * 1024)).toFixed(2)}MB)${
                    image.width && image.height ? ` - ${image.width}x${image.height}` : ''
                  }`}
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
                  ? 'Ask a question about your chart...'
                  : 'Type a message or paste an image...'
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
            disabled={
              (!message.trim() && uploadedImages.length === 0) || sendMessageMutation.isPending
            }
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
}  // <— close function

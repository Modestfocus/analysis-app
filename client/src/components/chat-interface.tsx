import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
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
  systemPrompt: string;
  isExpanded?: boolean;
}

export default function ChatInterface({ systemPrompt, isExpanded = false }: ChatInterfaceProps) {
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
    mutationFn: (title: string) => apiRequest('/api/chat/conversations', 'POST', { title }),
    onSuccess: (conversation: any) => {
      setActiveConversationId(conversation.id);
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations'] });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: ({ conversationId, content, imageUrls }: { 
      conversationId: string; 
      content: string; 
      imageUrls?: string[] 
    }) => apiRequest(`/api/chat/conversations/${conversationId}/messages`, 'POST', { 
      content, 
      imageUrls, 
      systemPrompt 
    }),
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

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setUploadedImages(prev => [...prev, dataUrl]);
        
        // Auto-start conversation if this is the first image
        if (!activeConversationId) {
          const title = `Chart Analysis - ${new Date().toLocaleDateString()}`;
          createConversationMutation.mutate(title);
        }
      };
      reader.readAsDataURL(file);
    });
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

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          handleFileUpload(new FileList());
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
        }
      }
    }
  };

  // Send message
  const handleSendMessage = () => {
    if ((!message.trim() && uploadedImages.length === 0) || sendMessageMutation.isPending) {
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
          Upload charts, ask questions, and get AI-powered insights
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeConversationId ? (
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
        ) : (
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
                            <DialogContent className="max-w-4xl">
                              <img
                                src={url}
                                alt={`Full chart ${index + 1}`}
                                className="w-full h-auto"
                              />
                            </DialogContent>
                          </Dialog>
                        ))}
                      </div>
                    )}
                    
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {/* Display analysis metadata */}
                    {msg.metadata && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex flex-wrap gap-2">
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
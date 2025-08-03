import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import DragDropZone from "@/components/drag-drop-zone";
import type { Timeframe } from "@shared/schema";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Clock, 
  Target,
  BarChart3,
  PieChart,
  Activity,
  ChevronUp,
  ChevronDown,
  Minimize2,
  Zap,
  Upload,
  Camera,
  Bolt,
  X,
  RefreshCw,
  CloudUpload,
  CheckCircle,
  Eye
} from 'lucide-react';

interface Position {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: string;
}

interface Order {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop';
  size: number;
  price: number;
  status: 'pending' | 'filled' | 'cancelled';
  createTime: string;
}

interface TradingPanelProps {
  currentSymbol: string;
  onPlaceOrder: (order: any) => void;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  onQuickAnalysis?: () => void;
  isQuickAnalysisOpen?: boolean;
  onCloseQuickAnalysis?: () => void;
  quickAnalysisFiles?: File[];
  onTakeScreenshot?: () => void;
  onClearScreenshots?: () => void;
}

// Mock data for demonstration
const mockPositions: Position[] = [
  {
    id: '1',
    symbol: 'NAS100',
    type: 'buy',
    size: 0.1,
    entryPrice: 22650.00,
    currentPrice: 22763.56,
    pnl: 113.56,
    pnlPercent: 0.50,
    openTime: '2025-01-31 18:30'
  },
  {
    id: '2',
    symbol: 'EURUSD',
    type: 'sell',
    size: 0.05,
    entryPrice: 1.0450,
    currentPrice: 1.0435,
    pnl: 75.00,
    pnlPercent: 1.44,
    openTime: '2025-01-31 16:15'
  }
];

const mockOrders: Order[] = [
  {
    id: '1',
    symbol: 'XAUUSD',
    type: 'buy',
    orderType: 'limit',
    size: 0.02,
    price: 2720.00,
    status: 'pending',
    createTime: '2025-01-31 20:45'
  }
];

export default function TradingPanel({ 
  currentSymbol, 
  onPlaceOrder, 
  isMinimized, 
  onToggleMinimize, 
  onQuickAnalysis, 
  isQuickAnalysisOpen, 
  onCloseQuickAnalysis, 
  quickAnalysisFiles: propQuickAnalysisFiles,
  onTakeScreenshot,
  onClearScreenshots
}: TradingPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [size, setSize] = useState('0.1');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [selectedTab, setSelectedTab] = useState("trading");
  
  // Quick Chart Analysis state (moved from Upload page)
  const [internalQuickAnalysisFiles, setInternalQuickAnalysisFiles] = useState<File[]>([]);
  const [quickAnalysisTimeframes, setQuickAnalysisTimeframes] = useState<{ [fileName: string]: Timeframe }>({});
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePreviewName, setImagePreviewName] = useState<string>('');
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [fileObjectUrls, setFileObjectUrls] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Combine prop files with internal files
  const quickAnalysisFiles = useMemo(() => {
    const propFiles = propQuickAnalysisFiles || [];
    return [...propFiles, ...internalQuickAnalysisFiles];
  }, [propQuickAnalysisFiles, internalQuickAnalysisFiles]);

  const totalPnL = mockPositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const accountBalance = 10000; // Mock account balance
  const equity = accountBalance + totalPnL;

  // Handle screenshot files - auto switch to Analysis tab when files are added
  useEffect(() => {
    if (quickAnalysisFiles && quickAnalysisFiles.length > 0) {
      setSelectedTab("analysis");
    }
  }, [quickAnalysisFiles]);

  // Cleanup image URLs on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Update timeframes when new prop files are received
  useEffect(() => {
    if (propQuickAnalysisFiles && propQuickAnalysisFiles.length > 0) {
      const newTimeframes: { [fileName: string]: Timeframe } = {};
      propQuickAnalysisFiles.forEach((file) => {
        if (!quickAnalysisTimeframes[file.name]) {
          newTimeframes[file.name] = "5M"; // Default for screenshots
        }
      });
      if (Object.keys(newTimeframes).length > 0) {
        setQuickAnalysisTimeframes(prev => ({ ...prev, ...newTimeframes }));
      }
    }
  }, [propQuickAnalysisFiles, quickAnalysisTimeframes]);

  // Handle screenshot button - call parent handler and switch to Analysis tab
  const handleTakeScreenshot = () => {
    setSelectedTab("analysis");
    if (onTakeScreenshot) {
      onTakeScreenshot();
    }
  };

  // Quick Chart Analysis functions (moved from Upload page)
  const handleQuickAnalysisFiles = useCallback((files: FileList | File[] | File) => {
    // Convert FileList or File to File array
    let fileArray: File[];
    if (files instanceof FileList) {
      fileArray = Array.from(files);
    } else if (Array.isArray(files)) {
      fileArray = files;
    } else {
      fileArray = [files];
    }
    
    setInternalQuickAnalysisFiles((prev: File[]) => [...prev, ...fileArray]);
    
    // Initialize timeframes for new files with default "1H"
    const newTimeframes: { [fileName: string]: Timeframe } = {};
    fileArray.forEach((file) => {
      newTimeframes[file.name] = "1H";
    });
    setQuickAnalysisTimeframes(prev => ({ ...prev, ...newTimeframes }));
  }, []);

  const updateQuickAnalysisTimeframe = useCallback((fileName: string, timeframe: Timeframe) => {
    setQuickAnalysisTimeframes(prev => ({ ...prev, [fileName]: timeframe }));
  }, []);

  const removeQuickAnalysisFile = useCallback((index: number) => {
    console.log('🗑️ Remove file clicked - Index:', index);
    console.log('📊 Current state:', {
      propFileCount: propQuickAnalysisFiles?.length || 0,
      internalFileCount: internalQuickAnalysisFiles.length,
      totalFiles: quickAnalysisFiles.length,
      propFiles: propQuickAnalysisFiles?.map(f => f.name) || [],
      internalFiles: internalQuickAnalysisFiles.map(f => f.name)
    });
    
    const propFileCount = propQuickAnalysisFiles?.length || 0;
    const totalFiles = quickAnalysisFiles.length;
    
    // Check if it's a prop file (screenshot from chart) or internal file (uploaded)
    if (index < propFileCount) {
      // This is a screenshot from the chart - allow removal by calling parent handler
      console.log('🗑️ Removing screenshot via parent handler');
      if (onClearScreenshots) {
        // For individual screenshot removal, we'll clear all screenshots for now
        // since the parent component manages screenshot files
        onClearScreenshots();
        toast({
          title: "Screenshot removed",
          description: "Screenshot has been removed from the analysis.",
        });
      } else {
        toast({
          title: "Cannot remove screenshot",
          description: "Screenshot removal is not available.",
          variant: "destructive"
        });
      }
      return;
    }
    
    // This is an uploaded file - can be removed
    const internalIndex = index - propFileCount;
    console.log('✅ Removing internal file at index:', internalIndex);
    
    const fileToRemove = internalQuickAnalysisFiles[internalIndex];
    
    if (!fileToRemove) {
      console.error('❌ File not found at internal index:', internalIndex);
      console.error('Available internal files:', internalQuickAnalysisFiles.map((f, i) => ({ index: i, name: f.name })));
      return;
    }
    
    console.log('🗑️ Removing file:', fileToRemove.name);
    
    // Clean up URL for this file
    const fileKey = `${fileToRemove.name}_${fileToRemove.size}_${fileToRemove.lastModified}`;
    const url = fileObjectUrls.get(fileKey);
    if (url) {
      URL.revokeObjectURL(url);
      setFileObjectUrls(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileKey);
        return newMap;
      });
    }
    
    // Remove from internal files
    setInternalQuickAnalysisFiles((prev: File[]) => {
      const newFiles = prev.filter((_: File, i: number) => i !== internalIndex);
      console.log('📝 Files after removal:', newFiles.map(f => f.name));
      return newFiles;
    });
    
    // Remove timeframe for this file
    setQuickAnalysisTimeframes((prevTf: { [fileName: string]: Timeframe }) => {
      const newTf = { ...prevTf };
      delete newTf[fileToRemove.name];
      return newTf;
    });
    
    toast({
      title: "File removed",
      description: `Removed ${fileToRemove.name}`,
    });
  }, [propQuickAnalysisFiles, internalQuickAnalysisFiles, fileObjectUrls, quickAnalysisFiles, toast]);

  const clearQuickAnalysisFiles = useCallback(() => {
    // Clean up URLs for internal files
    internalQuickAnalysisFiles.forEach(file => {
      const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
      const url = fileObjectUrls.get(fileKey);
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
    
    // Clear internal files
    setInternalQuickAnalysisFiles([]);
    setQuickAnalysisTimeframes({});
    setFileObjectUrls(new Map());
    
    // Clear screenshot files from parent component
    if (onClearScreenshots) {
      onClearScreenshots();
    }
    
    // Don't clear analysis results when clearing files
  }, [onClearScreenshots]);

  // Quick Analysis mutation
  const quickAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!Array.isArray(quickAnalysisFiles) || quickAnalysisFiles.length === 0) {
        throw new Error("No files selected for analysis");
      }

      const formData = new FormData();
      quickAnalysisFiles.forEach((file) => {
        formData.append('charts', file);
      });

      // Create timeframe mapping
      const timeframeMapping: { [fileName: string]: Timeframe } = {};
      quickAnalysisFiles.forEach((file) => {
        timeframeMapping[file.name] = quickAnalysisTimeframes[file.name] || "1H";
      });
      
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));

      const response = await fetch('/api/analyze/quick', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();

      return data;
    },
    onSuccess: (data) => {
      console.log('🔍 Analysis results received:', data);
      setAnalysisResults(data);
      // Don't clear files immediately - let user see results first
      toast({
        title: "Analysis Complete",
        description: `Quick analysis completed for ${quickAnalysisFiles.length} chart(s)`,
      });
    },
    onError: (error) => {
      console.error('Quick analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze charts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const runQuickAnalysis = () => {
    quickAnalysisMutation.mutate();
  };

  // Get or create object URL for a file
  const getFileUrl = useCallback((file: File) => {
    const fileKey = `${file.name}_${file.size}_${file.lastModified}`;
    let url = fileObjectUrls.get(fileKey);
    if (!url) {
      url = URL.createObjectURL(file);
      setFileObjectUrls(prev => new Map(prev).set(fileKey, url!));
    }
    return url;
  }, [fileObjectUrls]);

  // Image preview functions
  const openImagePreview = (file: File) => {
    const imageUrl = getFileUrl(file);
    setImagePreviewUrl(imageUrl);
    setImagePreviewName(file.name);
    setIsImagePreviewOpen(true);
  };

  const closeImagePreview = () => {
    setImagePreviewUrl(null);
    setImagePreviewName('');
    setIsImagePreviewOpen(false);
  };

  // Cleanup URLs when files are removed
  useEffect(() => {
    return () => {
      // Cleanup all URLs on unmount
      fileObjectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [fileObjectUrls]);

  // Screenshot drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    if (files.length > 0) {
      handleQuickAnalysisFiles(files);
    }
  };

  // Handle paste events
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (selectedTab !== "analysis") return;
    
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length > 0) {
      e.preventDefault();
      const files: File[] = [];
      
      imageItems.forEach((item, index) => {
        const file = item.getAsFile();
        if (file) {
          const newFile = new File([file], `pasted-chart-${Date.now()}-${index}.png`, {
            type: file.type,
            lastModified: Date.now(),
          });
          files.push(newFile);
        }
      });
      
      if (files.length > 0) {
        handleQuickAnalysisFiles(files);
      }
    }
  }, [selectedTab, handleQuickAnalysisFiles]);

  // Set up paste event listener
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handlePlaceOrder = () => {
    const order = {
      symbol: currentSymbol,
      type: tradeType,
      orderType,
      size: parseFloat(size),
      price: orderType === 'market' ? null : parseFloat(price),
      stopLoss: stopLoss ? parseFloat(stopLoss) : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      timestamp: new Date().toISOString()
    };
    
    onPlaceOrder(order);
    console.log('Placing order:', order);
  };

  return (
    <div className="h-full bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="h-full px-4 flex flex-col">
        {/* Header with toggle button */}
        <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-sm font-medium">Trading Panel</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleMinimize}
            className="h-6 w-6 p-0"
          >
            {isMinimized ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {!isMinimized && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
              <TabsList className="grid grid-cols-5 w-full max-w-2xl mt-2 flex-shrink-0">
                <TabsTrigger value="trading">Trading</TabsTrigger>
                <TabsTrigger value="positions">Positions</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="analysis" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-700">
                  <Zap className="h-3 w-3 mr-1" />
                  Analysis
                </TabsTrigger>
              </TabsList>

              <div className="py-4 flex-1 min-h-0 overflow-y-auto">
            {/* Trading Tab */}
            <TabsContent value="trading">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Order Form */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Place Order - {currentSymbol}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Trade Type */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={tradeType === 'buy' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTradeType('buy')}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <TrendingUp className="h-4 w-4 mr-1" />
                        Buy
                      </Button>
                      <Button
                        variant={tradeType === 'sell' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTradeType('sell')}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        <TrendingDown className="h-4 w-4 mr-1" />
                        Sell
                      </Button>
                    </div>

                    {/* Order Type */}
                    <div className="space-y-1">
                      <Label className="text-xs">Order Type</Label>
                      <Select value={orderType} onValueChange={(value: any) => setOrderType(value)}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">Market</SelectItem>
                          <SelectItem value="limit">Limit</SelectItem>
                          <SelectItem value="stop">Stop</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Size */}
                    <div className="space-y-1">
                      <Label className="text-xs">Size</Label>
                      <Input
                        type="number"
                        placeholder="0.1"
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                        className="h-8"
                      />
                    </div>

                    {/* Price (for limit/stop orders) */}
                    {orderType !== 'market' && (
                      <div className="space-y-1">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          placeholder="Enter price"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    )}

                    {/* Stop Loss & Take Profit */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Stop Loss</Label>
                        <Input
                          type="number"
                          placeholder="SL"
                          value={stopLoss}
                          onChange={(e) => setStopLoss(e.target.value)}
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Take Profit</Label>
                        <Input
                          type="number"
                          placeholder="TP"
                          value={takeProfit}
                          onChange={(e) => setTakeProfit(e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>

                    <Button 
                      onClick={handlePlaceOrder}
                      className="w-full h-8"
                      size="sm"
                    >
                      Place {tradeType.toUpperCase()} Order
                    </Button>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Account Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-medium">${accountBalance.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Equity:</span>
                      <span className="font-medium">${equity.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">P&L:</span>
                      <span className={`font-medium ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Open Positions:</span>
                      <span className="font-medium">{mockPositions.length}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Market Info */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Market Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Spread:</span>
                      <span className="font-medium">1.2 pips</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Margin:</span>
                      <span className="font-medium">1:100</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Session:</span>
                      <Badge variant="outline" className="text-xs">NY Open</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Positions Tab */}
            <TabsContent value="positions">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <PieChart className="h-4 w-4" />
                    Open Positions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mockPositions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No open positions
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mockPositions.map((position) => (
                        <div
                          key={position.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant={position.type === 'buy' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {position.type.toUpperCase()}
                            </Badge>
                            <div>
                              <div className="font-medium text-sm">{position.symbol}</div>
                              <div className="text-xs text-muted-foreground">
                                Size: {position.size} | Entry: {position.entryPrice}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-medium text-sm ${
                              position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                            </div>
                            <div className={`text-xs ${
                              position.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mockOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pending orders
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mockOrders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs">
                              {order.orderType.toUpperCase()}
                            </Badge>
                            <div>
                              <div className="font-medium text-sm">{order.symbol}</div>
                              <div className="text-xs text-muted-foreground">
                                {order.type.toUpperCase()} {order.size} @ {order.price}
                              </div>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {order.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Account Tab */}
            <TabsContent value="account">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Account Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Balance:</span>
                      <span className="font-medium">${accountBalance.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Equity:</span>
                      <span className="font-medium">${equity.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Free Margin:</span>
                      <span className="font-medium">${(equity * 0.8).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margin Level:</span>
                      <span className="font-medium">850%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total P&L:</span>
                      <span className={`font-medium ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Win Rate:</span>
                      <span className="font-medium">67%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Trades:</span>
                      <span className="font-medium">24</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Best Trade:</span>
                      <span className="font-medium text-green-600">+$340.50</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Quick Chart Analysis Tab - Moved from Upload Page */}
            <TabsContent value="analysis">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px] max-h-[80vh]">
                {/* Left Column - Quick Chart Analysis */}
                <Card>
                  <CardContent className="p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Bolt className="text-amber-500 mr-2 h-5 w-5" />
                      Quick Chart Analysis
                    </h2>
                    
                    <DragDropZone
                      onFilesSelected={handleQuickAnalysisFiles}
                      className="mb-6 hover:border-amber-400"
                      isLoading={quickAnalysisMutation.isPending}
                      placeholder="Paste (Ctrl/Cmd+V) or Drag & Drop chart image(s) here"
                      multiple={true}
                    />

                    {/* Quick Analysis Files Preview */}
                    {quickAnalysisFiles.length > 0 && (
                      <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            Quick Analysis Files ({quickAnalysisFiles.length})
                          </h3>
                          <Button 
                            onClick={clearQuickAnalysisFiles}
                            variant="outline" 
                            size="sm" 
                            className="text-amber-600 hover:text-amber-700 border-amber-300"
                          >
                            Clear All
                          </Button>
                        </div>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {quickAnalysisFiles.map((file, index) => {
                            const imageUrl = getFileUrl(file);
                            return (
                              <div key={`${file.name}-${index}`} className="bg-white dark:bg-gray-700 p-2 rounded border">
                                <div className="flex items-center space-x-3 mb-2">
                                  <div className="flex-shrink-0">
                                    <div className="relative group cursor-pointer" onClick={() => openImagePreview(file)}>
                                      <img 
                                        src={imageUrl} 
                                        alt={file.name}
                                        className="w-8 h-8 object-cover rounded border hover:opacity-75 transition-opacity"
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-20 rounded">
                                        <Eye className="w-3 h-3 text-white" />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate block">
                                      {file.name}
                                    </span>
                                  </div>
                                  <Button
                                    onClick={() => removeQuickAnalysisFile(index)}
                                    variant="ghost"
                                    size="sm"
                                    className="text-gray-400 hover:text-red-500 h-5 w-5 p-0 flex-shrink-0"
                                  >
                                    ×
                                  </Button>
                                </div>
                                
                                {/* Individual Timeframe Selector */}
                                <div className="flex items-center space-x-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-400">TF:</span>
                                  <div className="flex space-x-1">
                                    {["5M", "15M", "1H", "4H", "Daily"].map((timeframe) => (
                                      <Button
                                        key={timeframe}
                                        size="sm"
                                        variant={quickAnalysisTimeframes[file.name] === timeframe ? "default" : "outline"}
                                        onClick={() => updateQuickAnalysisTimeframe(file.name, timeframe as Timeframe)}
                                        className="h-4 text-xs px-1"
                                      >
                                        {timeframe}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <Button 
                      onClick={runQuickAnalysis}
                      className="w-full bg-amber-500 hover:bg-amber-600"
                      disabled={quickAnalysisMutation.isPending || quickAnalysisFiles.length === 0}
                    >
                      {quickAnalysisMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing Visual Maps & GPT-4o Analysis...
                        </>
                      ) : (
                        <>
                          <Bolt className="mr-2 h-4 w-4" />
                          Run Quick Analysis {quickAnalysisFiles.length > 0 && `(${quickAnalysisFiles.length} files)`}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Right Column - Analysis Panel */}
                <Card className="flex flex-col h-full">
                  <CardContent className="p-6 flex flex-col h-full max-h-[600px]">
                    <div className="flex items-center justify-between mb-4 flex-shrink-0">
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                        <BarChart3 className="text-blue-500 mr-2 h-5 w-5" />
                        Analysis Panel
                      </h2>
                    </div>
                    
                    {analysisResults ? (
                      <div className="flex-1 overflow-y-auto min-h-0 max-h-[500px] border border-gray-200 rounded-lg">
                        <div className="space-y-3 p-4">
                          {/* GPT-4o Analysis Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-blue-600" />
                            <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">GPT-4o Analysis</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="text-xs">
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Regenerate
                            </Button>
                            <Button 
                              onClick={() => setAnalysisResults(null)}
                              variant="outline" 
                              size="sm" 
                              className="text-xs text-gray-600 hover:text-gray-700 border-gray-300"
                            >
                              Clear Analysis
                            </Button>
                          </div>
                        </div>

                        {/* Top 3 Matched Vector Charts */}
                        {analysisResults.similarCharts && analysisResults.similarCharts.length > 0 && (
                          <div className="space-y-3">
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">Top 3 Matched Vector Charts</h3>
                            <div className="space-y-2">
                              {analysisResults.similarCharts.slice(0, 3).map((chart: any, index: number) => (
                                <div key={chart.chartId || index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {chart.filename || `Chart ${chart.chartId}`}
                                      </span>
                                      <Badge variant="outline" className="text-xs">
                                        {chart.timeframe || 'Unknown'}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs">
                                        {chart.instrument || 'Unknown'}
                                      </Badge>
                                      {chart.similarity && (
                                        <Badge variant="outline" className="text-xs text-green-600">
                                          {Math.round(chart.similarity * 100)}% match
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button 
                                      variant="link" 
                                      size="sm" 
                                      className="text-xs text-blue-600 p-1 h-auto"
                                      onClick={() => {
                                        const chartUrl = chart.filePath || `/uploads/${chart.filename}`;
                                        window.open(chartUrl, '_blank');
                                      }}
                                    >
                                      View full chart
                                    </Button>
                                    <Button 
                                      variant="link" 
                                      size="sm" 
                                      className="text-xs text-blue-600 p-1 h-auto"
                                      onClick={() => {
                                        const depthMapUrl = chart.depthMapUrl || chart.depthMapPath;
                                        if (depthMapUrl) {
                                          window.open(depthMapUrl, '_blank');
                                        }
                                      }}
                                    >
                                      View Depth map
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Market Prediction Section */}
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <TrendingUp className="h-4 w-4 text-gray-600" />
                              <span className="font-medium text-gray-900 dark:text-gray-100">Market Prediction</span>
                            </div>
                            {analysisResults.prediction?.prediction && (
                              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                                {analysisResults.prediction.prediction}
                              </div>
                            )}
                          </div>

                          {/* Expected Session */}
                          {analysisResults.prediction?.session && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Clock className="h-4 w-4 text-gray-600" />
                                <span className="font-medium text-gray-900 dark:text-gray-100">Expected Session</span>
                              </div>
                              <div className="text-lg text-gray-900 dark:text-gray-100">
                                {analysisResults.prediction.session}
                              </div>
                            </div>
                          )}

                          {/* Confidence Level */}
                          {analysisResults.prediction?.confidence && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Target className="h-4 w-4 text-gray-600" />
                                <span className="font-medium text-gray-900 dark:text-gray-100">Confidence Level</span>
                              </div>
                              <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium ${
                                analysisResults.prediction.confidence === 'High' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  : analysisResults.prediction.confidence === 'Medium'
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              }`}>
                                <CheckCircle className="h-4 w-4" />
                                {analysisResults.prediction.confidence}
                              </div>
                            </div>
                          )}

                          {/* Analysis Summary */}
                          {analysisResults.analysis && (
                            <div className="bg-white dark:bg-gray-800 p-3 rounded border">
                              <h4 className="font-medium text-sm mb-2">Analysis Summary</h4>
                              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {analysisResults.analysis}
                              </div>
                            </div>
                          )}

                          {/* Analysis Reasoning */}
                          {analysisResults.prediction?.reasoning && (
                            <div>
                              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Analysis Reasoning</h3>
                              <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {analysisResults.prediction.reasoning}
                              </div>
                            </div>
                          )}

                          {/* Dialogue Text Box */}
                          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                                  This analysis used advanced AI pattern recognition with vector similarity matching from your historical charts. 
                                  The prediction considers technical indicators, price action patterns, and optimal trading session timing.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-center">
                        <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-gray-500 text-sm mb-2">Upload a chart to see GPT-4o analysis with RAG similarity matching</p>
                        <p className="text-xs text-gray-400">
                          Analysis results will appear here after running Quick Chart Analysis
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>

    {/* Image Preview Modal */}
    <Dialog open={isImagePreviewOpen} onOpenChange={setIsImagePreviewOpen}>
      <DialogContent className="max-w-4xl w-full h-[80vh] p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {imagePreviewName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex items-center justify-center p-4 pt-2">
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl || ''}
              alt={imagePreviewName}
              className="max-w-full max-h-full object-contain rounded-lg"
              onLoad={() => {
                // Keep the URL for the modal, don't revoke it here
              }}
            />
          )}
        </div>
        <div className="p-4 pt-2 flex justify-end">
          <Button variant="outline" onClick={closeImagePreview}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );
}
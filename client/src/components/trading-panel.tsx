import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  CloudUpload
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
  onTakeScreenshot
}: TradingPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [size, setSize] = useState('0.1');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [selectedTab, setSelectedTab] = useState("trading");
  
  // Quick Chart Analysis state (moved from Upload page)
  const [quickAnalysisFiles, setQuickAnalysisFiles] = useState<File[]>([]);
  const [quickAnalysisTimeframes, setQuickAnalysisTimeframes] = useState<{ [fileName: string]: Timeframe }>({});
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPnL = mockPositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const accountBalance = 10000; // Mock account balance
  const equity = accountBalance + totalPnL;

  // Handle screenshot files - auto switch to Analysis tab when files are added
  useEffect(() => {
    if (quickAnalysisFiles && quickAnalysisFiles.length > 0) {
      setSelectedTab("analysis");
    }
  }, [quickAnalysisFiles]);

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
    
    setQuickAnalysisFiles(prev => [...prev, ...fileArray]);
    
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
    setQuickAnalysisFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      // Also remove timeframe for this file
      const removedFile = prev[index];
      if (removedFile) {
        setQuickAnalysisTimeframes(prevTf => {
          const newTf = { ...prevTf };
          delete newTf[removedFile.name];
          return newTf;
        });
      }
      return newFiles;
    });
  }, []);

  const clearQuickAnalysisFiles = useCallback(() => {
    setQuickAnalysisFiles([]);
    setQuickAnalysisTimeframes({});
    setAnalysisResults(null);
  }, []);

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
      setAnalysisResults(data);
      clearQuickAnalysisFiles(); // Clear files after successful analysis
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
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4">
        {/* Header with toggle button */}
        <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
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
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <TabsList className="grid grid-cols-5 w-full max-w-2xl mt-2">
              <TabsTrigger value="trading">Trading</TabsTrigger>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="analysis" className="bg-gradient-to-r from-blue-500 to-purple-600 text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-700">
                <Zap className="h-3 w-3 mr-1" />
                Analysis
              </TabsTrigger>
            </TabsList>

          <div className="py-4">
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
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
                            const imageUrl = URL.createObjectURL(file);
                            return (
                              <div key={index} className="bg-white dark:bg-gray-700 p-2 rounded border">
                                <div className="flex items-center space-x-3 mb-2">
                                  <div className="flex-shrink-0">
                                    <img 
                                      src={imageUrl} 
                                      alt={file.name}
                                      className="w-8 h-8 object-cover rounded border"
                                      onLoad={() => URL.revokeObjectURL(imageUrl)}
                                    />
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
                          Analyzing...
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
                <Card>
                  <CardContent className="p-6 h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                        <BarChart3 className="text-blue-500 mr-2 h-5 w-5" />
                        Analysis Panel
                      </h2>
                    </div>
                    
                    {analysisResults ? (
                      <div className="space-y-4 h-full overflow-y-auto">
                        {/* Debug info - remove later */}
                        <div className="text-xs text-gray-500 p-2 bg-gray-100 rounded">
                          Debug: {JSON.stringify(analysisResults, null, 2).substring(0, 200)}...
                        </div>
                        
                        {/* Multi-Chart Analysis Results */}
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-amber-800 dark:text-amber-200 flex items-center">
                              <Bolt className="mr-2 h-4 w-4" />
                              Quick Analysis Results
                            </h3>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                {analysisResults.chartCount} Charts
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                Multi-Timeframe
                              </Badge>
                            </div>
                          </div>

                          {/* Overall Prediction */}
                          {(analysisResults.analysis?.prediction || analysisResults.analysis?.session || analysisResults.analysis?.confidence) && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {analysisResults.analysis.prediction && (
                                <Badge className="bg-amber-500 hover:bg-amber-600">
                                  {analysisResults.analysis.prediction}
                                </Badge>
                              )}
                              {analysisResults.analysis.session && (
                                <Badge variant="secondary">
                                  {analysisResults.analysis.session} Session
                                </Badge>
                              )}
                              {analysisResults.analysis.confidence && (
                                <Badge variant="outline">
                                  Confidence: {analysisResults.analysis.confidence}
                                </Badge>
                              )}
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

                          {/* Reasoning */}
                          {analysisResults.analysis?.reasoning && (
                            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200">
                              <h4 className="font-medium text-sm text-blue-800 dark:text-blue-200 mb-2">Technical Reasoning</h4>
                              <div className="text-sm text-blue-700 dark:text-blue-300">
                                {analysisResults.analysis.reasoning}
                              </div>
                            </div>
                          )}

                          {/* Individual Chart Results */}
                          {analysisResults.results && analysisResults.results.length > 0 && (
                            <div className="mt-4 space-y-3">
                              <h4 className="font-medium text-sm">Individual Chart Analysis</h4>
                              {analysisResults.results.map((result: any, index: number) => (
                                <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded border border-l-4 border-l-amber-400">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium">Chart {index + 1}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {result.timeframe || "Unknown"}
                                    </Badge>
                                  </div>
                                  
                                  {result.analysis && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      {result.analysis.substring(0, 150)}...
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Action Button */}
                          <div className="text-center mt-4">
                            <Button 
                              onClick={() => setAnalysisResults(null)}
                              variant="outline" 
                              size="sm" 
                              className="text-amber-600 hover:text-amber-700 border-amber-300"
                            >
                              Clear Analysis
                            </Button>
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
        )}
      </div>
    </div>
  );
}
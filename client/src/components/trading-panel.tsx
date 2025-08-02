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
  quickAnalysisFiles,
  onTakeScreenshot
}: TradingPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [size, setSize] = useState('0.1');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [analysisFiles, setAnalysisFiles] = useState<File[]>([]);
  const [selectedTab, setSelectedTab] = useState("trading");
  
  // Quick Chart Analysis state
  const [selectedTimeframes, setSelectedTimeframes] = useState<{ [key: number]: string }>({});
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPnL = mockPositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const accountBalance = 10000; // Mock account balance
  const equity = accountBalance + totalPnL;

  // Handle screenshot files - auto switch to Analysis tab and load files
  useEffect(() => {
    if (quickAnalysisFiles && quickAnalysisFiles.length > 0) {
      setAnalysisFiles(quickAnalysisFiles);
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

  // Quick Chart Analysis functions
  const handleQuickAnalysisFiles = useCallback((files: File[]) => {
    setAnalysisFiles(prev => [...prev, ...files]);
    
    // Initialize timeframes for new files
    const newTimeframes: { [key: number]: string } = {};
    files.forEach((_, index) => {
      const fileIndex = analysisFiles.length + index;
      newTimeframes[fileIndex] = "1H"; // Default timeframe
    });
    setSelectedTimeframes(prev => ({ ...prev, ...newTimeframes }));
  }, [analysisFiles.length]);

  // Remove a file from quick analysis
  const removeQuickAnalysisFile = useCallback((index: number) => {
    setAnalysisFiles(prev => prev.filter((_, i) => i !== index));
    setSelectedTimeframes(prev => {
      const updated = { ...prev };
      delete updated[index];
      // Reindex remaining timeframes
      const reindexed: { [key: number]: string } = {};
      Object.entries(updated).forEach(([oldIndex, timeframe]) => {
        const oldIdx = parseInt(oldIndex);
        if (oldIdx > index) {
          reindexed[oldIdx - 1] = timeframe;
        } else if (oldIdx < index) {
          reindexed[oldIdx] = timeframe;
        }
      });
      return reindexed;
    });
  }, []);

  // Clear all files
  const clearQuickAnalysisFiles = useCallback(() => {
    setAnalysisFiles([]);
    setSelectedTimeframes({});
    setAnalysisResults(null);
  }, []);

  // Quick analysis mutation - exactly like Upload page
  const quickAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (analysisFiles.length === 0) {
        throw new Error("No files selected for analysis");
      }

      const formData = new FormData();
      
      // Add all files to FormData
      analysisFiles.forEach((file) => {
        formData.append('charts', file);
      });
      
      // Add timeframe mapping as JSON string for quick analysis
      const timeframeMapping: Record<string, string> = {};
      analysisFiles.forEach((file, index) => {
        timeframeMapping[file.name] = selectedTimeframes[index] || "1H";
      });
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));

      // Use Quick Analysis endpoint - processes temporarily without saving to dashboard
      const quickAnalysisResponse = await apiRequest('POST', '/api/analyze/quick', formData);
      const quickAnalysisData = await quickAnalysisResponse.json();
      
      // Return comprehensive quick analysis (no database save)
      return {
        isQuickAnalysis: true,
        chartCount: quickAnalysisData.chartCount,
        timeframes: Object.values(timeframeMapping),
        savedToDatabase: false, // Quick Analysis does NOT save to database
        multiChartAnalysis: true,
        chartsProcessed: quickAnalysisData.chartCount,
        visualMapsIncluded: quickAnalysisData.visualMapsIncluded,
        // Include analysis results for UI display
        ...quickAnalysisData
      };
    },
    onSuccess: (data: any) => {
      setAnalysisResults(data);
      // Clear files after successful analysis
      setAnalysisFiles([]);
      setSelectedTimeframes({});
      
      // Quick Analysis doesn't save to dashboard, so no need to invalidate queries
      let description = `${data.chartCount} chart(s) analyzed temporarily (not saved to dashboard)`;
      if (data.visualMapsIncluded) {
        description += ` with depth maps`;
      }
      
      toast({
        title: "Quick Analysis Complete",
        description: description,
      });
    },
    onError: (error) => {
      console.error("Quick analysis failed:", error);
      toast({
        title: "Quick Analysis Failed",
        description: "Failed to analyze charts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      handleQuickAnalysisFiles(imageFiles);
    }
  }, [handleQuickAnalysisFiles]);

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

            {/* Quick Chart Analysis Tab */}
            <TabsContent value="analysis">
              <div className="space-y-4">
                <Card className="h-80 overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Bolt className="h-4 w-4 text-amber-500" />
                      Quick Chart Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 h-full overflow-y-auto">
                    {/* Drag & Drop Zone or Files Preview */}
                    {analysisFiles.length === 0 ? (
                      <div
                        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                          isDragOver 
                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' 
                            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <CloudUpload className="h-6 w-6 text-gray-400" />
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            <p className="font-medium">Paste (Ctrl/Cmd+V) or Drag & Drop chart image(s) here</p>
                            <p className="text-xs mt-1">Supports PNG, JPG, GIF up to 10MB</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Files Preview Section */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-amber-800 dark:text-amber-200">
                            Files ({analysisFiles.length})
                          </Label>
                          <Button 
                            onClick={clearQuickAnalysisFiles}
                            variant="outline" 
                            size="sm" 
                            className="text-amber-600 hover:text-amber-700 border-amber-300 h-5 px-2 text-xs"
                          >
                            Clear
                          </Button>
                        </div>
                        
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {analysisFiles.map((file, index) => {
                            const imageUrl = URL.createObjectURL(file);
                            return (
                              <div key={index} className="bg-white dark:bg-gray-700 p-2 rounded border">
                                <div className="flex items-center space-x-2 mb-1">
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
                                    <span className="text-xs text-gray-500">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
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
                                
                                {/* Timeframe Selection */}
                                <div className="flex items-center space-x-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-400">TF:</span>
                                  <Select
                                    value={selectedTimeframes[index] || "1H"}
                                    onValueChange={(value) => setSelectedTimeframes(prev => ({ ...prev, [index]: value }))}
                                  >
                                    <SelectTrigger className="w-12 h-5 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1M">1M</SelectItem>
                                      <SelectItem value="5M">5M</SelectItem>
                                      <SelectItem value="15M">15M</SelectItem>
                                      <SelectItem value="30M">30M</SelectItem>
                                      <SelectItem value="1H">1H</SelectItem>
                                      <SelectItem value="4H">4H</SelectItem>
                                      <SelectItem value="1D">1D</SelectItem>
                                      <SelectItem value="1W">1W</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Analysis Button */}
                        <Button
                          onClick={() => quickAnalysisMutation.mutate()}
                          disabled={analysisFiles.length === 0 || quickAnalysisMutation.isPending}
                          className="w-full bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs"
                        >
                          {quickAnalysisMutation.isPending ? (
                            <>
                              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Zap className="mr-1 h-3 w-3" />
                              Run Quick Analysis
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Screenshot Button */}
                    <div className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTakeScreenshot}
                        className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white border-0 h-7 text-xs"
                      >
                        <Camera className="h-3 w-3 mr-1" />
                        Take Screenshot
                      </Button>
                    </div>

                    {/* Analysis Results */}
                    {analysisResults && (
                      <div className="space-y-2 border-t pt-2">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-xs">Analysis Results</h4>
                        <div className="max-h-32 overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded p-2">
                          <div className="text-xs space-y-1">
                            {analysisResults.isQuickAnalysis && (
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  Quick Analysis
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {analysisResults.chartCount} Charts
                                </Badge>
                              </div>
                            )}
                            
                            {analysisResults.analysis && (
                              <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {analysisResults.analysis}
                              </div>
                            )}
                            
                            {analysisResults.prediction && (
                              <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-xs">Prediction:</span>
                                  <Badge variant="outline" className="text-xs">
                                    {analysisResults.prediction}
                                  </Badge>
                                  {analysisResults.confidence && (
                                    <Badge variant="secondary" className="text-xs">
                                      {analysisResults.confidence}
                                    </Badge>
                                  )}
                                </div>
                                {analysisResults.session && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400">
                                    Session: {analysisResults.session}
                                  </div>
                                )}
                                {analysisResults.reasoning && (
                                  <div className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                                    {analysisResults.reasoning}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          handleQuickAnalysisFiles(files);
                        }
                      }}
                      className="hidden"
                    />

                    <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                      AI-powered technical analysis with pattern recognition
                    </div>
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
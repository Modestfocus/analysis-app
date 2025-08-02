import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Zap
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

export default function TradingPanel({ currentSymbol, onPlaceOrder, isMinimized, onToggleMinimize, onQuickAnalysis }: TradingPanelProps) {
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop'>('market');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [size, setSize] = useState('0.1');
  const [price, setPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');

  const totalPnL = mockPositions.reduce((sum, pos) => sum + pos.pnl, 0);
  const accountBalance = 10000; // Mock account balance
  const equity = accountBalance + totalPnL;

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
          <div className="flex items-center gap-2">
            {onQuickAnalysis && (
              <Button
                variant="outline"
                size="sm"
                onClick={onQuickAnalysis}
                className="h-7 px-2 text-xs font-medium bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 hover:from-blue-600 hover:to-purple-700"
              >
                <Zap className="h-3 w-3 mr-1" />
                Quick Chart Analysis
              </Button>
            )}
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
        </div>

        {!isMinimized && (
          <Tabs defaultValue="trading" className="w-full">
            <TabsList className="grid grid-cols-4 w-full max-w-md mt-2">
              <TabsTrigger value="trading">Trading</TabsTrigger>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
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
          </div>
        </Tabs>
        )}
      </div>
    </div>
  );
}
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface ChartWatchlistProps {
  currentSymbol: string;
  onSymbolSelect: (symbol: string) => void;
}

const watchlistData: WatchlistItem[] = [
  { symbol: 'NAS100', name: 'NASDAQ 100', price: 21245.67, change: 125.45, changePercent: 0.59 },
  { symbol: 'SPX500', name: 'S&P 500', price: 5847.23, change: -23.12, changePercent: -0.39 },
  { symbol: 'US30', name: 'Dow Jones', price: 44987.32, change: 234.56, changePercent: 0.52 },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.0856, change: 0.0023, changePercent: 0.21 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', price: 1.2741, change: -0.0034, changePercent: -0.27 },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', price: 157.45, change: 0.87, changePercent: 0.56 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', price: 2748.34, change: 12.45, changePercent: 0.45 },
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', price: 94567.23, change: -1234.56, changePercent: -1.29 },
  { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', price: 3421.67, change: 89.34, changePercent: 2.68 },
];

export default function ChartWatchlist({ currentSymbol, onSymbolSelect }: ChartWatchlistProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Watchlist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-0">
        <div className="max-h-96 overflow-y-auto px-4 pb-4">
          {watchlistData.map((item) => (
            <Button
              key={item.symbol}
              variant={currentSymbol === item.symbol ? "default" : "ghost"}
              className="w-full justify-start p-3 h-auto flex-col items-start space-y-1"
              onClick={() => onSymbolSelect(item.symbol)}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-semibold text-sm">{item.symbol}</span>
                <span className="text-sm font-medium">
                  {item.price.toFixed(item.symbol.includes('USD') && !item.symbol.includes('JPY') ? 4 : 2)}
                </span>
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-xs text-muted-foreground truncate max-w-20">
                  {item.name}
                </span>
                <Badge 
                  variant={item.change >= 0 ? "default" : "destructive"}
                  className={`text-xs ${item.change >= 0 ? "bg-green-500" : "bg-red-500"}`}
                >
                  {item.change >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                </Badge>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
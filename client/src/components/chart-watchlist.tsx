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
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', price: 113885.8, change: -2652.1, changePercent: -2.28 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', price: 3363.21, change: 73.18, changePercent: 2.22 },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar', price: 37.036, change: 0.319, changePercent: 0.87 },
  { symbol: 'NAS100', name: 'NASDAQ 100', price: 22761.3, change: -452.2, changePercent: -1.95 },
  { symbol: 'US30', name: 'Dow Jones', price: 43544.50, change: -562.00, changePercent: -1.27 },
  { symbol: 'WTI', name: 'West Texas Intermediate', price: 66.445, change: -2.210, changePercent: -3.22 },
  { symbol: 'NATGAS', name: 'Natural Gas', price: 3.063, change: -0.006, changePercent: -0.20 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', price: 1.32719, change: 0.00691, changePercent: 0.52 },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.15853, change: 0.01730, changePercent: 1.52 },
];

export default function ChartWatchlist({ currentSymbol, onSymbolSelect }: ChartWatchlistProps) {
  return (
    <Card className="h-full border-0 shadow-none">
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-gray-700">Watchlist</CardTitle>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
            <span className="text-lg">+</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Table Header */}
        <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-gray-50 border-y border-gray-100 text-xs font-medium text-gray-600">
          <div>Symbol</div>
          <div className="text-right">Last</div>
          <div className="text-right">Chg</div>
          <div className="text-right">Chg%</div>
        </div>
        
        {/* Table Rows */}
        <div className="max-h-80 overflow-y-auto">
          {watchlistData.map((item) => {
            const isSelected = currentSymbol === item.symbol;
            return (
              <div
                key={item.symbol}
                onClick={() => onSymbolSelect(item.symbol)}
                className={`grid grid-cols-4 gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-50 transition-colors ${
                  isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                }`}
              >
                {/* Symbol */}
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    item.change >= 0 ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {item.symbol}
                  </span>
                </div>
                
                {/* Last Price */}
                <div className="text-right">
                  <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {item.price.toFixed(item.symbol.includes('USD') && !item.symbol.includes('JPY') ? 2 : 2)}
                  </span>
                </div>
                
                {/* Change */}
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    item.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}
                  </span>
                </div>
                
                {/* Change % */}
                <div className="text-right">
                  <span className={`text-sm font-medium ${
                    item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
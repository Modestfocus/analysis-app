import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, X, TrendingUp, Search, Star, TrendingDown, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TradingViewImportModal from "./tradingview-import-modal";

interface WatchlistItem {
  id: string;
  userId: string;
  symbol: string;
  createdAt: string;
}

interface WatchlistManagerProps {
  onSymbolSelect: (symbol: string) => void;
  currentSymbol?: string;
}

interface SymbolDetails {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
}

// Mock symbol data - in production this would come from a real API
const getSymbolDetails = (symbol: string): SymbolDetails => {
  const mockData: Record<string, SymbolDetails> = {
    'NAS100': { symbol: 'NAS100', price: 22763.56, change: 103.45, changePercent: 0.46, volume: 268012 },
    'SPX500': { symbol: 'SPX500', price: 6022.43, change: -8.22, changePercent: -0.14, volume: 189234 },
    'US30': { symbol: 'US30', price: 44293.13, change: 234.78, changePercent: 0.53, volume: 156789 },
    'EURUSD': { symbol: 'EURUSD', price: 1.0435, change: -0.0012, changePercent: -0.11, volume: 2345678 },
    'GBPUSD': { symbol: 'GBPUSD', price: 1.2387, change: 0.0089, changePercent: 0.72, volume: 1876543 },
    'USDJPY': { symbol: 'USDJPY', price: 157.42, change: -0.23, changePercent: -0.15, volume: 1234567 },
    'XAUUSD': { symbol: 'XAUUSD', price: 2734.12, change: 12.45, changePercent: 0.46, volume: 98765 },
    'BTCUSD': { symbol: 'BTCUSD', price: 104234.56, change: -1234.45, changePercent: -1.17, volume: 456789 },
    'ETHUSD': { symbol: 'ETHUSD', price: 3456.78, change: 67.89, changePercent: 2.00, volume: 345678 }
  };
  return mockData[symbol] || { symbol, price: 0, change: 0, changePercent: 0, volume: 0 };
};

export default function WatchlistManager({ onSymbolSelect, currentSymbol }: WatchlistManagerProps) {
  const { toast } = useToast();
  const [newSymbol, setNewSymbol] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // Get current symbol details
  const currentSymbolDetails = currentSymbol ? getSymbolDetails(currentSymbol) : null;

  // Fetch user's watchlist
  const { data: watchlist = [], isLoading } = useQuery({
    queryKey: ["/api/watchlist"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/watchlist");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.watchlist || [];
      } catch (error) {
        console.error("Error fetching watchlist:", error);
        return [];
      }
    },
  });

  // Add symbol to watchlist
  const addSymbolMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest("POST", "/api/watchlist", { symbol });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: "Symbol added",
        description: `${data.watchlistItem.symbol} added to watchlist`,
      });
      setNewSymbol("");
      setIsAdding(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add symbol",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Remove symbol from watchlist
  const removeSymbolMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest("DELETE", `/api/watchlist/${symbol}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({
        title: "Symbol removed",
        description: "Symbol removed from watchlist",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove symbol",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleAddSymbol = () => {
    if (!newSymbol.trim()) return;
    
    const symbol = newSymbol.toUpperCase().trim();
    addSymbolMutation.mutate(symbol);
  };

  const handleRemoveSymbol = (symbol: string) => {
    removeSymbolMutation.mutate(symbol);
  };

  const handleSymbolClick = (symbol: string) => {
    try {
      onSymbolSelect(symbol);
      toast({
        title: "Chart updated",
        description: `Switched to ${symbol}`,
      });
    } catch (error) {
      console.error("Error selecting symbol:", error);
      toast({
        title: "Error switching chart",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  // Popular trading symbols for quick access
  const popularSymbols = [
    "NAS100", "SPX500", "US30", 
    "EURUSD", "GBPUSD", "USDJPY", 
    "XAUUSD", "BTCUSD", "ETHUSD"
  ];

  // Filter symbols based on search
  const filteredSymbols = popularSymbols.filter(symbol =>
    symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Current Symbol Details */}
      {currentSymbolDetails && (
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold">{currentSymbolDetails.symbol}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {currentSymbolDetails.price?.toLocaleString()}
              </span>
              <div className={`flex items-center gap-1 ${
                (currentSymbolDetails.changePercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {(currentSymbolDetails.changePercent || 0) >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="font-medium">
                  {currentSymbolDetails.changePercent?.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Change: {(currentSymbolDetails.changePercent || 0) >= 0 ? '+' : ''}{currentSymbolDetails.change?.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">
              Volume: {currentSymbolDetails.volume?.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Watchlist Management */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Watchlist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Symbol Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search symbols..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        {/* Add symbol section */}
        <div className="space-y-2">
          {!isAdding ? (
            <div className="space-y-2">
              <Button 
                onClick={() => setIsAdding(true)}
                variant="outline" 
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Symbol
              </Button>
              
              <Button 
                onClick={() => setIsImportModalOpen(true)}
                variant="outline" 
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Import TradingView Watchlist
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter symbol (e.g., NAS100)"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddSymbol()}
                className="flex-1"
              />
              <Button 
                onClick={handleAddSymbol}
                disabled={!newSymbol.trim() || addSymbolMutation.isPending}
                size="sm"
              >
                Add
              </Button>
              <Button 
                onClick={() => setIsAdding(false)}
                variant="outline"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* User's watchlist */}
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            Loading watchlist...
          </div>
        ) : watchlist.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Your Symbols</h4>
            <div className="flex flex-wrap gap-2">
              {watchlist.map((item: WatchlistItem) => (
                <Badge
                  key={item.id}
                  variant={currentSymbol === item.symbol ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/80 transition-colors group relative"
                  onClick={() => handleSymbolClick(item.symbol)}
                >
                  {item.symbol}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-1 h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveSymbol(item.symbol);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            No symbols in watchlist
          </div>
        )}

        {/* Popular symbols */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Popular Symbols</h4>
          <div className="flex flex-wrap gap-2">
            {filteredSymbols.map((symbol) => {
              const symbolDetails = getSymbolDetails(symbol);
              return (
                <div
                  key={symbol}
                  className={`cursor-pointer p-3 rounded-lg border transition-colors hover:bg-accent ${
                    currentSymbol === symbol ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                  onClick={() => handleSymbolClick(symbol)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{symbol}</span>
                    <div className={`text-sm ${
                      (symbolDetails.changePercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {(symbolDetails.changePercent || 0) >= 0 ? '+' : ''}{symbolDetails.changePercent?.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {symbolDetails.price?.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </CardContent>
      </Card>

      {/* TradingView Import Modal */}
      <TradingViewImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
}
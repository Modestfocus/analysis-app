import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export default function WatchlistManager({ onSymbolSelect, currentSymbol }: WatchlistManagerProps) {
  const { toast } = useToast();
  const [newSymbol, setNewSymbol] = useState("");
  const [isAdding, setIsAdding] = useState(false);

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
    onSymbolSelect(symbol);
    toast({
      title: "Chart updated",
      description: `Switched to ${symbol}`,
    });
  };

  // Popular trading symbols for quick access
  const popularSymbols = [
    "NAS100", "SPX500", "US30", 
    "EURUSD", "GBPUSD", "USDJPY", 
    "XAUUSD", "BTCUSD", "ETHUSD"
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Watchlist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add symbol section */}
        <div className="space-y-2">
          {!isAdding ? (
            <Button 
              onClick={() => setIsAdding(true)}
              variant="outline" 
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Symbol
            </Button>
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
              {watchlist.map((item) => (
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
            {popularSymbols.map((symbol) => (
              <Badge
                key={symbol}
                variant={currentSymbol === symbol ? "default" : "secondary"}
                className="cursor-pointer hover:bg-primary/80 transition-colors"
                onClick={() => handleSymbolClick(symbol)}
              >
                {symbol}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
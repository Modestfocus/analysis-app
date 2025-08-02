import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { X, Plus, Download, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface TradingViewImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SelectedSymbol {
  symbol: string;
  name?: string;
  exchange?: string;
}

export default function TradingViewImportModal({ isOpen, onClose }: TradingViewImportModalProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedSymbols, setSelectedSymbols] = useState<SelectedSymbol[]>([]);
  const [isChartReady, setIsChartReady] = useState(false);
  const [manualSymbol, setManualSymbol] = useState("");

  // Common trading symbols for easy selection
  const commonSymbols = [
    { symbol: "NASDAQ:TSLA", name: "Tesla Inc" },
    { symbol: "NASDAQ:AAPL", name: "Apple Inc" },
    { symbol: "NASDAQ:GOOGL", name: "Alphabet Inc" },
    { symbol: "NASDAQ:MSFT", name: "Microsoft Corp" },
    { symbol: "NYSE:SPY", name: "SPDR S&P 500 ETF" },
    { symbol: "FOREXCOM:EURUSD", name: "EUR/USD" },
    { symbol: "FOREXCOM:GBPUSD", name: "GBP/USD" },
    { symbol: "FOREXCOM:USDJPY", name: "USD/JPY" },
    { symbol: "OANDA:XAUUSD", name: "Gold/USD" },
    { symbol: "BITSTAMP:BTCUSD", name: "Bitcoin/USD" },
    { symbol: "BITSTAMP:ETHUSD", name: "Ethereum/USD" },
    { symbol: "PEPPERSTONE:NAS100", name: "NASDAQ 100" },
    { symbol: "PEPPERSTONE:SPX500", name: "S&P 500" },
    { symbol: "PEPPERSTONE:US30", name: "Dow Jones 30" }
  ];

  // Initialize TradingView chart with watchlist enabled
  const initializeTradingViewChart = useCallback(() => {
    if (!containerRef.current || !isOpen) return;

    // More gentle cleanup to avoid DOM errors
    try {
      if (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
    } catch (error) {
      // Ignore DOM errors during cleanup
      console.log('DOM cleanup handled gracefully');
    }

    // Create container div for TradingView widget
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'tradingview_import_chart';
    widgetContainer.style.height = '400px';
    widgetContainer.style.width = '100%';

    // Create TradingView widget script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    
    const config = {
      "autosize": true,
      "symbol": "NASDAQ:AAPL",
      "interval": "60",
      "timezone": "Etc/UTC",
      "theme": "light",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "container_id": "tradingview_import_chart",
      "support_host": "https://www.tradingview.com",
      "width": "100%",
      "height": "400"
    };
    
    script.innerHTML = JSON.stringify(config);

    script.onerror = (error) => {
      console.error("Failed to load TradingView script:", error);
      setIsChartReady(false);
    };

    script.onload = () => {
      setIsChartReady(true);
    };

    // Append container and script to DOM
    widgetContainer.appendChild(script);
    containerRef.current.appendChild(widgetContainer);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Delay initialization to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        initializeTradingViewChart();
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        // Gentle cleanup to avoid DOM errors
        if (containerRef.current) {
          try {
            while (containerRef.current.firstChild) {
              containerRef.current.removeChild(containerRef.current.firstChild);
            }
          } catch (error) {
            // Ignore DOM errors during cleanup
            console.log('DOM cleanup handled gracefully on unmount');
          }
        }
        setIsChartReady(false);
      };
    }
  }, [isOpen, initializeTradingViewChart]);

  // Add symbol to selected list
  const handleAddSymbol = useCallback((symbolData: SelectedSymbol) => {
    const symbolKey = symbolData.symbol.toUpperCase();
    
    // Check if symbol already exists
    if (selectedSymbols.some(s => s.symbol.toUpperCase() === symbolKey)) {
      toast({
        title: "Symbol already added",
        description: `${symbolData.symbol} is already in your selection`,
        variant: "destructive",
      });
      return;
    }

    setSelectedSymbols(prev => [...prev, symbolData]);
    toast({
      title: "Symbol added",
      description: `${symbolData.symbol} added to your selection`,
    });
  }, [selectedSymbols, toast]);

  // Remove symbol from selected list
  const handleRemoveSymbol = useCallback((symbol: string) => {
    setSelectedSymbols(prev => prev.filter(s => s.symbol !== symbol));
  }, []);

  // Add manual symbol
  const handleAddManualSymbol = useCallback(() => {
    if (!manualSymbol.trim()) return;
    
    const symbolData: SelectedSymbol = {
      symbol: manualSymbol.trim().toUpperCase(),
      name: "Manual Entry"
    };
    
    handleAddSymbol(symbolData);
    setManualSymbol("");
  }, [manualSymbol, handleAddSymbol]);

  // Save watchlist mutation
  const saveWatchlistMutation = useMutation({
    mutationFn: async (symbols: string[]) => {
      const promises = symbols.map(symbol => 
        apiRequest('POST', '/api/watchlist', { 
          symbol: symbol.split(':').pop() || symbol // Extract just the symbol part - userId handled by server
        })
      );
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Watchlist imported successfully",
        description: `${selectedSymbols.length} symbols added to your watchlist`,
      });
      
      // Refresh watchlist data
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      
      // Reset and close
      setSelectedSymbols([]);
      onClose();
    },
    onError: (error) => {
      console.error("Failed to save watchlist:", error);
      toast({
        title: "Import failed",
        description: "Failed to save symbols to watchlist. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSaveWatchlist = useCallback(() => {
    if (selectedSymbols.length === 0) {
      toast({
        title: "No symbols selected",
        description: "Please select at least one symbol to import",
        variant: "destructive",
      });
      return;
    }

    const symbols = selectedSymbols.map(s => s.symbol);
    saveWatchlistMutation.mutate(symbols);
  }, [selectedSymbols, saveWatchlistMutation, toast]);

  const handleClose = useCallback(() => {
    setSelectedSymbols([]);
    setManualSymbol("");
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[80vh] p-0" aria-describedby="import-modal-description">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import TradingView Watchlist
          </DialogTitle>
          <div id="import-modal-description" className="sr-only">
            Import symbols from TradingView by selecting them from the chart or using the quick add buttons
          </div>
        </DialogHeader>
        
        <div className="flex-1 p-6 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left Side - TradingView Chart */}
            <div className="space-y-4">
              <Card className="h-[500px]">
                <CardHeader>
                  <CardTitle className="text-sm">TradingView Chart</CardTitle>
                </CardHeader>
                <CardContent className="p-0 h-[calc(100%-60px)]">
                  <div 
                    ref={containerRef}
                    className="tradingview-widget-container h-full w-full"
                    style={{ height: "100%", width: "100%" }}
                  >
                    {!isChartReady && (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <TrendingUp className="h-8 w-8 animate-pulse mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Loading TradingView chart...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Symbol Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Quick Add Popular Symbols</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {commonSymbols.map((symbolData) => (
                      <Button
                        key={symbolData.symbol}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSymbol(symbolData)}
                        className="justify-start text-left"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-medium">{symbolData.symbol.split(':').pop()}</span>
                          <span className="text-xs text-muted-foreground truncate">{symbolData.name}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Side - Selected Symbols */}
            <div className="space-y-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    Selected Symbols ({selectedSymbols.length})
                    <Badge variant="secondary">{selectedSymbols.length} selected</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Manual symbol input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter symbol (e.g., AAPL, EURUSD)"
                      value={manualSymbol}
                      onChange={(e) => setManualSymbol(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddManualSymbol()}
                      className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
                    />
                    <Button 
                      onClick={handleAddManualSymbol}
                      disabled={!manualSymbol.trim()}
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <Separator />

                  {/* Selected symbols list */}
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedSymbols.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No symbols selected yet</p>
                        <p className="text-xs">Click symbols from the chart or use quick add buttons</p>
                      </div>
                    ) : (
                      selectedSymbols.map((symbolData, index) => (
                        <div 
                          key={`${symbolData.symbol}-${index}`}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">
                              {symbolData.symbol.split(':').pop() || symbolData.symbol}
                            </span>
                            {symbolData.name && (
                              <span className="text-xs text-muted-foreground">{symbolData.name}</span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSymbol(symbolData.symbol)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedSymbols.length > 0 && (
                <span>{selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''} ready to import</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveWatchlist}
                disabled={selectedSymbols.length === 0 || saveWatchlistMutation.isPending}
              >
                {saveWatchlistMutation.isPending ? "Saving..." : "Save to My Watchlist"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
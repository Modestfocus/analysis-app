import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { X, Plus, Download, TrendingUp, Search, BarChart3, Star, Link, Globe } from "lucide-react";
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
  category?: string;
}

export default function TradingViewImportModal({ isOpen, onClose }: TradingViewImportModalProps) {
  const { toast } = useToast();
  const [selectedSymbols, setSelectedSymbols] = useState<SelectedSymbol[]>([]);
  const [manualSymbol, setManualSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"browse" | "url">("browse");

  // Comprehensive trading symbols organized by category
  const symbolCategories = {
    "Forex Majors": [
      { symbol: "EURUSD", name: "Euro/US Dollar" },
      { symbol: "GBPUSD", name: "British Pound/US Dollar" },
      { symbol: "USDJPY", name: "US Dollar/Japanese Yen" },
      { symbol: "USDCHF", name: "US Dollar/Swiss Franc" },
      { symbol: "AUDUSD", name: "Australian Dollar/US Dollar" },
      { symbol: "NZDUSD", name: "New Zealand Dollar/US Dollar" },
      { symbol: "USDCAD", name: "US Dollar/Canadian Dollar" },
    ],
    "US Indices": [
      { symbol: "SPX500", name: "S&P 500 Index" },
      { symbol: "NAS100", name: "NASDAQ 100 Index" },
      { symbol: "US30", name: "Dow Jones 30 Index" },
      { symbol: "US2000", name: "Russell 2000 Index" },
    ],
    "Commodities": [
      { symbol: "XAUUSD", name: "Gold/US Dollar" },
      { symbol: "XAGUSD", name: "Silver/US Dollar" },
      { symbol: "WTIUSD", name: "WTI Crude Oil" },
      { symbol: "XBRUSD", name: "Brent Crude Oil" },
    ],
    "Cryptocurrencies": [
      { symbol: "BTCUSD", name: "Bitcoin/US Dollar" },
      { symbol: "ETHUSD", name: "Ethereum/US Dollar" },
      { symbol: "ADAUSD", name: "Cardano/US Dollar" },
      { symbol: "SOLUSD", name: "Solana/US Dollar" },
    ],
    "Popular Stocks": [
      { symbol: "AAPL", name: "Apple Inc" },
      { symbol: "TSLA", name: "Tesla Inc" },
      { symbol: "GOOGL", name: "Alphabet Inc" },
      { symbol: "MSFT", name: "Microsoft Corp" },
      { symbol: "AMZN", name: "Amazon.com Inc" },
      { symbol: "NVDA", name: "NVIDIA Corp" },
    ]
  };

  // Flatten all symbols for search
  const allSymbols = Object.entries(symbolCategories).flatMap(([category, symbols]) =>
    symbols.map(symbol => ({ ...symbol, category }))
  );

  // Filter symbols based on search query
  const filteredSymbols = searchQuery
    ? allSymbols.filter(symbol =>
        symbol.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        symbol.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allSymbols;

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
          symbol: symbol // Extract just the symbol part - userId handled by server
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

  // URL import mutation
  const urlImportMutation = useMutation({
    mutationFn: async (url: string) => {
      return apiRequest('POST', '/api/watchlist/import-url', { url });
    },
    onSuccess: (data: any) => {
      const importedCount = data.symbols?.length || 0;
      toast({
        title: "URL import successful",
        description: `${importedCount} symbols imported from TradingView watchlist`,
      });
      
      // Refresh watchlist data
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      
      // Reset and close
      setImportUrl("");
      onClose();
    },
    onError: (error) => {
      console.error("Failed to import from URL:", error);
      toast({
        title: "URL import failed",
        description: "Failed to import watchlist from URL. Please check the URL and try again.",
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

  const handleUrlImport = useCallback(() => {
    if (!importUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a valid TradingView watchlist URL",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    const urlPattern = /^https:\/\/(?:www\.)?tradingview\.com\/watchlists\/\d+\/?$/;
    if (!urlPattern.test(importUrl.trim())) {
      toast({
        title: "Invalid URL format",
        description: "Please enter a valid TradingView watchlist URL (e.g., https://www.tradingview.com/watchlists/12345/)",
        variant: "destructive",
      });
      return;
    }

    urlImportMutation.mutate(importUrl.trim());
  }, [importUrl, urlImportMutation, toast]);

  const handleClose = useCallback(() => {
    setSelectedSymbols([]);
    setManualSymbol("");
    setSearchQuery("");
    setImportUrl("");
    setActiveTab("browse");
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl h-[80vh] p-0" aria-describedby="import-modal-description">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import Trading Symbols to Watchlist
          </DialogTitle>
          <div id="import-modal-description" className="sr-only">
            Select trading symbols from popular categories or import from TradingView watchlist URL
          </div>
          
          {/* Tab Navigation */}
          <div className="flex gap-2 mt-4">
            <Button
              variant={activeTab === "browse" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("browse")}
              className="flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Browse Symbols
            </Button>
            <Button
              variant={activeTab === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("url")}
              className="flex items-center gap-2"
            >
              <Link className="h-4 w-4" />
              Import from URL
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 p-6 overflow-hidden">
          {activeTab === "browse" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Left Side - Symbol Categories */}
              <div className="space-y-4 overflow-y-auto">
              {/* Search symbols */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Search Symbols
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search symbols (e.g., AAPL, EURUSD, Bitcoin)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Manual symbol input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Add Custom Symbol</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter symbol (e.g., AAPL, EURUSD)"
                      value={manualSymbol}
                      onChange={(e) => setManualSymbol(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleAddManualSymbol()}
                      className="flex-1"
                    />
                    <Button 
                      onClick={handleAddManualSymbol}
                      disabled={!manualSymbol.trim()}
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Symbol categories or search results */}
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {searchQuery ? `Search Results (${filteredSymbols.length})` : 'Popular Trading Symbols'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[400px] overflow-y-auto">
                  {searchQuery ? (
                    // Search results
                    <div className="space-y-2">
                      {filteredSymbols.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No symbols found matching "{searchQuery}"
                        </p>
                      ) : (
                        filteredSymbols.map((symbolData, index) => (
                          <div
                            key={`${symbolData.symbol}-${index}`}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                            onClick={() => handleAddSymbol(symbolData)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{symbolData.symbol}</span>
                              <span className="text-xs text-muted-foreground">{symbolData.name}</span>
                              {symbolData.category && (
                                <Badge variant="outline" className="w-fit text-xs mt-1">
                                  {symbolData.category}
                                </Badge>
                              )}
                            </div>
                            <Button variant="ghost" size="sm">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    // Category-based display
                    <div className="space-y-4">
                      {Object.entries(symbolCategories).map(([category, symbols]) => (
                        <div key={category}>
                          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <BarChart3 className="h-3 w-3" />
                            {category}
                          </h4>
                          <div className="grid grid-cols-1 gap-2">
                            {symbols.map((symbolData) => (
                              <div
                                key={symbolData.symbol}
                                className="flex items-center justify-between p-2 border rounded hover:bg-accent cursor-pointer"
                                onClick={() => handleAddSymbol({ ...symbolData, category })}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium text-xs">{symbolData.symbol}</span>
                                  <span className="text-xs text-muted-foreground">{symbolData.name}</span>
                                </div>
                                <Button variant="ghost" size="sm">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                  {/* Selected symbols list */}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {selectedSymbols.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No symbols selected yet</p>
                        <p className="text-xs">Click symbols from the left panel to add them</p>
                      </div>
                    ) : (
                      selectedSymbols.map((symbolData, index) => (
                        <div 
                          key={`${symbolData.symbol}-${index}`}
                          className="flex items-center justify-between p-3 border rounded-lg bg-accent/50"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{symbolData.symbol}</span>
                            {symbolData.name && (
                              <span className="text-xs text-muted-foreground">{symbolData.name}</span>
                            )}
                            {symbolData.category && (
                              <Badge variant="outline" className="w-fit text-xs mt-1">
                                {symbolData.category}
                              </Badge>
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
          ) : (
            // URL Import Tab
            <div className="max-w-2xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Import from TradingView Watchlist URL
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">TradingView Watchlist URL</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://www.tradingview.com/watchlists/12345/"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleUrlImport()}
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleUrlImport}
                        disabled={!importUrl.trim() || urlImportMutation.isPending}
                      >
                        {urlImportMutation.isPending ? "Importing..." : "Import"}
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">How to use:</h4>
                    <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                      <li>Go to TradingView.com and open any public watchlist</li>
                      <li>Copy the URL from your browser address bar</li>
                      <li>Paste the URL above and click Import</li>
                      <li>All symbols from the watchlist will be added to your account</li>
                    </ol>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                    <h4 className="text-sm font-medium mb-2">Example URLs:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                      <li>• https://www.tradingview.com/watchlists/12345/</li>
                      <li>• https://tradingview.com/watchlists/67890/</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 pt-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {activeTab === "browse" && selectedSymbols.length > 0 && (
                <span>{selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''} ready to import</span>
              )}
              {activeTab === "url" && importUrl && (
                <span>Ready to import from TradingView URL</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {activeTab === "browse" ? (
                <Button 
                  onClick={handleSaveWatchlist}
                  disabled={selectedSymbols.length === 0 || saveWatchlistMutation.isPending}
                >
                  {saveWatchlistMutation.isPending ? "Saving..." : "Save to My Watchlist"}
                </Button>
              ) : (
                <Button 
                  onClick={handleUrlImport}
                  disabled={!importUrl.trim() || urlImportMutation.isPending}
                >
                  {urlImportMutation.isPending ? "Importing..." : "Import from URL"}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
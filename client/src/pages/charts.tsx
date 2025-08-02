import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import WatchlistManager from "@/components/watchlist-manager";
import ChartLayoutManager from "@/components/chart-layout-manager";
import DrawingToolbar from "@/components/drawing-toolbar";
import DrawingSettingsPanel from "@/components/drawing-settings-panel";
import TradingPanel from "@/components/trading-panel";



export default function ChartsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const initializingRef = useRef<boolean>(false);
  const [currentSymbol, setCurrentSymbol] = useState("NAS100");
  const [isChartReady, setIsChartReady] = useState(false);
  const [selectedDrawingTool, setSelectedDrawingTool] = useState("cursor");
  const [isDrawingToolbarCollapsed, setIsDrawingToolbarCollapsed] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<any>(null);
  const [isDrawingSettingsOpen, setIsDrawingSettingsOpen] = useState(false);
  const [drawings, setDrawings] = useState<any[]>([]);
  const [showTradingPanel, setShowTradingPanel] = useState(true);
  const [isTradingPanelMinimized, setIsTradingPanelMinimized] = useState(true);
  const [tvWidget, setTvWidget] = useState<any>(null);
  
  const [chartBounds, setChartBounds] = useState<DOMRect | null>(null);
  


  // Convert our symbol format to TradingView format
  const formatSymbolForTradingView = (symbol: string) => {
    const symbolMap: Record<string, string> = {
      "NAS100": "NASDAQ:NDX", // Changed to a more reliable symbol
      "SPX500": "TVC:SPX", // Changed to TradingView Community version
      "US30": "TVC:DJI", // Changed to TradingView Community version
      "EURUSD": "FX:EURUSD",
      "GBPUSD": "FX:GBPUSD",
      "USDJPY": "FX:USDJPY",
      "XAUUSD": "TVC:GOLD", // Changed to TradingView Community version
      "BTCUSD": "BITSTAMP:BTCUSD", // Changed to more reliable exchange
      "ETHUSD": "BITSTAMP:ETHUSD" // Changed to more reliable exchange
    };
    return symbolMap[symbol] || `FX:${symbol}`;
  };

  // Initialize TradingView widget
  const initializeChart = useCallback((symbol: string = currentSymbol) => {
    if (!containerRef.current) return;
    
    // Prevent multiple concurrent initializations
    if (initializingRef.current) {
      console.log("Chart initialization already in progress, skipping...");
      return;
    }

    try {
      initializingRef.current = true;
      setIsChartReady(false);
      
      // Clear existing content
      containerRef.current.innerHTML = '';

      // Create TradingView widget script
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      
      const config = {
        "autosize": true,
        "symbol": formatSymbolForTradingView(symbol),
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
        "container_id": "tradingview_chart",
        "support_host": "https://www.tradingview.com"
      };
      
      script.innerHTML = JSON.stringify(config);

      // Add error handling for script loading
      script.onerror = (error) => {
        console.error("Failed to load TradingView script:", error);
        setIsChartReady(false);
        initializingRef.current = false;
      };

      // Add event listener for when widget loads
      script.onload = () => {
        setIsChartReady(true);
        initializingRef.current = false;
      };

      containerRef.current.appendChild(script);
    } catch (error) {
      console.error("Error initializing chart:", error);
      setIsChartReady(false);
      initializingRef.current = false;
    }
  }, [currentSymbol]);

  useEffect(() => {
    initializeChart();
    
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      setIsChartReady(false);
    };
  }, [initializeChart]);

  // Update chart bounds when chart is ready
  useEffect(() => {
    if (isChartReady && containerRef.current) {
      const updateBounds = () => {
        const chartContainer = containerRef.current?.querySelector('#tradingview_chart');
        if (chartContainer) {
          setChartBounds(chartContainer.getBoundingClientRect());
        }
      };
      
      updateBounds();
      window.addEventListener('resize', updateBounds);
      
      return () => window.removeEventListener('resize', updateBounds);
    }
  }, [isChartReady]);

  // Handle symbol selection from watchlist
  const handleSymbolSelect = useCallback((symbol: string) => {
    try {
      console.log("Switching to symbol:", symbol);
      
      // Only proceed if symbol is different
      if (symbol === currentSymbol) {
        console.log("Same symbol selected, skipping reinitialization");
        return;
      }
      
      setCurrentSymbol(symbol);
      
      // Add a small delay to ensure state update before reinitializing
      setTimeout(() => {
        if (!initializingRef.current) {
          initializeChart(symbol);
        }
      }, 150);
    } catch (error) {
      console.error("Error in handleSymbolSelect:", error);
    }
  }, [currentSymbol, initializeChart]);

  // Map our tool IDs to TradingView tool names
  const mapToolToTradingView = (toolId: string): string => {
    const toolMap: { [key: string]: string } = {
      'trend-line': 'LineToolTrendLine',
      'horizontal-line': 'LineToolHorzLine', 
      'vertical-line': 'LineToolVertLine',
      'ray': 'LineToolRay',
      'rectangle': 'LineToolRectangle',
      'ellipse': 'LineToolCircle',
      'text': 'LineToolText',
      'brush': 'LineToolBrush'
    };
    return toolMap[toolId] || 'cursor';
  };

  // Simulate drawing tool activation for TradingView
  const activateDrawingTool = useCallback((toolId: string) => {
    console.log(`Activating drawing tool: ${toolId}`);
    
    // Visual feedback for users about tool selection
    if (toolId !== 'cursor') {
      // Show a toast notification about tool usage
      const toolNames: { [key: string]: string } = {
        'trend-line': 'Trend Line',
        'horizontal-line': 'Horizontal Line',
        'vertical-line': 'Vertical Line',
        'ray': 'Ray',
        'rectangle': 'Rectangle',
        'ellipse': 'Ellipse',
        'text': 'Text',
        'brush': 'Brush'
      };
      
      const toolName = toolNames[toolId] || toolId;
      console.log(`${toolName} tool selected - Use TradingView's toolbar above the chart for drawing`);
      
      // In a production implementation with TradingView Charting Library:
      // widget.activeChart().createMultiPointShape([{time: timestamp, price: price}], {
      //   shape: mapToolToTradingView(toolId),
      //   lock: false,
      //   disableSelection: false
      // });
    }
  }, []);

  // Handle saving current chart layout
  const handleSaveLayout = useCallback(async () => {
    try {
      // In a real implementation, we would use TradingView's save_load API
      // For now, we'll save basic configuration
      const layoutConfig = {
        symbol: currentSymbol,
        interval: "60",
        timezone: "Etc/UTC",
        theme: "light",
        style: "1",
        // In production, these would come from the actual TradingView widget
        indicators: [], // Would be populated by widget.getIndicators()
        drawings: [], // Would be populated by widget.getDrawings()
        savedAt: new Date().toISOString()
      };
      
      return layoutConfig;
    } catch (error) {
      console.error("Error getting layout:", error);
      throw error;
    }
  }, [currentSymbol]);

  // Handle loading a saved chart layout
  const handleLayoutLoad = useCallback((layoutConfig: any) => {
    try {
      if (layoutConfig.symbol && layoutConfig.symbol !== currentSymbol) {
        setCurrentSymbol(layoutConfig.symbol);
        initializeChart(layoutConfig.symbol);
      }
      
      // In production, this would restore indicators, drawings, etc.
      // widget.loadLayout(layoutConfig);
      
      console.log("Loading layout:", layoutConfig);
    } catch (error) {
      console.error("Error loading layout:", error);
    }
  }, [currentSymbol, initializeChart]);

  // Drawing tool handlers
  const handleDrawingToolSelect = useCallback((toolId: string) => {
    console.log("Selected drawing tool:", toolId);
    setSelectedDrawingTool(toolId);
    
    // Activate the tool in TradingView
    activateDrawingTool(toolId);
  }, [activateDrawingTool]);

  const handleToggleDrawingToolbar = useCallback(() => {
    setIsDrawingToolbarCollapsed(!isDrawingToolbarCollapsed);
  }, [isDrawingToolbarCollapsed]);

  // Drawing settings handlers
  const handleUpdateDrawing = useCallback((settings: any) => {
    if (selectedDrawing) {
      const updatedDrawings = drawings.map(drawing => 
        drawing.id === selectedDrawing.id ? { ...drawing, ...settings } : drawing
      );
      setDrawings(updatedDrawings);
      setSelectedDrawing({ ...selectedDrawing, ...settings });
    }
  }, [selectedDrawing, drawings]);

  const handleDeleteDrawing = useCallback(() => {
    if (selectedDrawing) {
      const updatedDrawings = drawings.filter(drawing => drawing.id !== selectedDrawing.id);
      setDrawings(updatedDrawings);
      setSelectedDrawing(null);
      setIsDrawingSettingsOpen(false);
    }
  }, [selectedDrawing, drawings]);

  const handleDuplicateDrawing = useCallback(() => {
    if (selectedDrawing) {
      const newDrawing = { 
        ...selectedDrawing, 
        id: `${selectedDrawing.id}_copy_${Date.now()}` 
      };
      setDrawings([...drawings, newDrawing]);
    }
  }, [selectedDrawing, drawings]);

  const handleLockDrawing = useCallback((locked: boolean) => {
    if (selectedDrawing) {
      handleUpdateDrawing({ locked });
    }
  }, [selectedDrawing, handleUpdateDrawing]);

  const handleToggleDrawingVisibility = useCallback((visible: boolean) => {
    if (selectedDrawing) {
      handleUpdateDrawing({ visible });
    }
  }, [selectedDrawing, handleUpdateDrawing]);

  // Trading handlers
  const handlePlaceOrder = useCallback((order: any) => {
    console.log('Order placed:', order);
    // In a real implementation, this would send the order to a trading API
    // For now, we'll just log it as a demo
    alert(`Demo Order Placed: ${order.type.toUpperCase()} ${order.size} ${order.symbol}`);
  }, []);

  const handleToggleTradingPanelMinimize = useCallback(() => {
    setIsTradingPanelMinimized(!isTradingPanelMinimized);
  }, [isTradingPanelMinimized]);



  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Live Charts - {currentSymbol}
              </h1>
            </div>
          </div>
        </div>
      </nav>

      <div className={`flex h-[calc(100vh-80px)] ${isTradingPanelMinimized ? 'pb-12' : 'pb-64'}`}>
        {/* Main Chart Area */}
        <div className="flex-1 p-4">
          <Card className="h-full">
            <CardContent className="p-0 h-full relative">
              <div 
                ref={containerRef}
                className="tradingview-widget-container h-full w-full"
                style={{ height: "100%", width: "100%" }}
              >
                <div className="tradingview-widget-container__widget h-full"></div>
                <div className="tradingview-widget-copyright">
                  <a 
                    href="https://www.tradingview.com/" 
                    rel="noopener nofollow" 
                    target="_blank"
                    className="text-xs text-gray-500"
                  >
                    Track all markets on TradingView
                  </a>
                </div>
              </div>


            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Watchlist and Layout Manager */}
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4 space-y-4 overflow-y-auto">
          <WatchlistManager 
            onSymbolSelect={handleSymbolSelect}
            currentSymbol={currentSymbol}
          />
          
          <ChartLayoutManager 
            onLayoutLoad={handleLayoutLoad}
            onSaveLayout={handleSaveLayout}
          />
        </div>

        {/* Drawing Toolbar - Fixed position on left */}
        <DrawingToolbar 
          onToolSelect={handleDrawingToolSelect}
          selectedTool={selectedDrawingTool}
          isCollapsed={isDrawingToolbarCollapsed}
          onToggleCollapse={handleToggleDrawingToolbar}
        />



        {/* Drawing Settings Panel - Shows when drawing is selected */}
        <DrawingSettingsPanel
          isOpen={isDrawingSettingsOpen}
          onClose={() => setIsDrawingSettingsOpen(false)}
          selectedDrawing={selectedDrawing}
          onUpdateDrawing={handleUpdateDrawing}
          onDeleteDrawing={handleDeleteDrawing}
          onDuplicateDrawing={handleDuplicateDrawing}
          onLockDrawing={handleLockDrawing}
          onToggleVisibility={handleToggleDrawingVisibility}
        />



        {/* Trading Panel - Fixed at bottom */}
        {showTradingPanel && (
          <TradingPanel 
            currentSymbol={currentSymbol}
            onPlaceOrder={handlePlaceOrder}
            isMinimized={isTradingPanelMinimized}
            onToggleMinimize={handleToggleTradingPanelMinimize}
          />
        )}
      </div>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useRef, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import LightweightChart from "@/components/lightweight-chart";
import ChartWatchlist from "@/components/chart-watchlist";
import ChartLayoutManager from "@/components/chart-layout-manager";
import TradingPanel from "@/components/trading-panel";
import ScreenshotSelector from "@/components/screenshot-selector";
import { PanelGroup, Panel, PanelResizeHandle, ImperativePanelHandle } from "react-resizable-panels";

export default function ChartsPage() {
  const tradingPanelRef = useRef<ImperativePanelHandle>(null);
  const [currentSymbol, setCurrentSymbol] = useState("NAS100");
  const [showTradingPanel, setShowTradingPanel] = useState(true);
  const [isTradingPanelMinimized, setIsTradingPanelMinimized] = useState(true); // Start minimized as per user preference
  
  // Panel visibility and resize states
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(false);
  
  // Screenshot files for Analysis tab
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [isScreenshotSelectorOpen, setIsScreenshotSelectorOpen] = useState(false);
  const { toast } = useToast();

  // Handle symbol selection from watchlist
  const handleSymbolSelect = useCallback((symbol: string) => {
    console.log("Switching to symbol:", symbol);
    setCurrentSymbol(symbol);
  }, []);

  // Handle right sidebar toggle
  const handleToggleRightSidebar = useCallback(() => {
    setIsRightSidebarCollapsed(prev => !prev);
  }, []);

  // Handle trading panel resize
  const handlePanelResize = useCallback(() => {
    // Panel resize handler
  }, []);

  // Handle trading panel minimize toggle
  const handleToggleTradingPanelMinimize = useCallback(() => {
    setIsTradingPanelMinimized(prev => !prev);
  }, []);

  // Handle place order (placeholder)
  const handlePlaceOrder = useCallback((orderData: any) => {
    console.log("Place order:", orderData);
    toast({
      title: "Order Placed",
      description: "Your order has been placed successfully",
    });
  }, [toast]);

  // Screenshot capture functionality
  const handleTakeScreenshot = useCallback(() => {
    setIsScreenshotSelectorOpen(true);
  }, []);

  const handleScreenshotCapture = useCallback((file: File) => {
    setScreenshotFiles(prev => [...prev, file]);
    
    toast({
      title: "Screenshot Captured",
      description: "Selected area screenshot added to Analysis tab",
    });
  }, [toast]);

  const handleCloseScreenshotSelector = useCallback(() => {
    setIsScreenshotSelectorOpen(false);
  }, []);

  const handleClearScreenshots = useCallback(() => {
    setScreenshotFiles([]);
  }, []);

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

      {/* Main Layout with Resizable Panels */}
      <div className="h-[calc(100vh-80px)]">
        <PanelGroup direction="vertical" onLayout={handlePanelResize}>
          {/* Main content area with horizontal panels */}
          <Panel defaultSize={isTradingPanelMinimized ? 90 : 65} minSize={30}>
            <PanelGroup direction="horizontal" onLayout={handlePanelResize}>
              {/* Main Chart Area */}
              <Panel defaultSize={isRightSidebarCollapsed ? 100 : 75} minSize={40}>
                <div className="h-full p-4">
                  <Card className="h-full">
                    <CardContent className="p-0 h-full relative">
                      {/* Collapse button for right sidebar */}
                      <Button
                        onClick={handleToggleRightSidebar}
                        className="absolute top-2 right-2 z-10 h-8 w-8 p-0"
                        variant="outline"
                        size="sm"
                      >
                        {isRightSidebarCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      
                      {/* Lightweight Chart Component */}
                      <LightweightChart
                        symbol={currentSymbol}
                        onSymbolChange={handleSymbolSelect}
                        className="h-full"
                      />
                    </CardContent>
                  </Card>
                </div>
              </Panel>

              {/* Resizable Handle for Right Sidebar */}
              {!isRightSidebarCollapsed && (
                <PanelResizeHandle className="w-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors cursor-col-resize" />
              )}

              {/* Right Sidebar - Watchlist and Layout Manager */}
              {!isRightSidebarCollapsed && (
                <Panel defaultSize={25} minSize={15} maxSize={40}>
                  <div className="h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4 space-y-4 overflow-y-auto">
                    {/* Take Screenshot Button */}
                    <div className="space-y-2">
                      <Button
                        onClick={handleTakeScreenshot}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                        size="sm"
                      >
                        <Camera className="mr-2 h-4 w-4" />
                        Take Screenshot
                      </Button>
                    </div>
                    
                    <ChartWatchlist 
                      currentSymbol={currentSymbol}
                      onSymbolSelect={handleSymbolSelect}
                    />
                    
                    <ChartLayoutManager 
                      onLayoutLoad={async () => {}}
                      onSaveLayout={async () => {}}
                    />
                  </div>
                </Panel>
              )}
            </PanelGroup>
          </Panel>

          {/* Resizable Handle for Trading Panel */}
          {showTradingPanel && (
            <PanelResizeHandle className="h-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors cursor-row-resize flex items-center justify-center">
              <div className="w-12 h-1 bg-gray-400 rounded-full"></div>
            </PanelResizeHandle>
          )}

          {/* Trading Panel - Always visible, resizable from top */}
          {showTradingPanel && (
            <Panel ref={tradingPanelRef} defaultSize={isTradingPanelMinimized ? 10 : 35} minSize={8} maxSize={60}>
              <div className="h-full relative">
                <TradingPanel 
                  currentSymbol={currentSymbol}
                  onPlaceOrder={handlePlaceOrder}
                  isMinimized={isTradingPanelMinimized}
                  onToggleMinimize={handleToggleTradingPanelMinimize}
                  quickAnalysisFiles={screenshotFiles}
                  onTakeScreenshot={handleTakeScreenshot}
                  onClearScreenshots={handleClearScreenshots}
                />
              </div>
            </Panel>
          )}
        </PanelGroup>

        {/* Screenshot Area Selector */}
        <ScreenshotSelector
          isOpen={isScreenshotSelectorOpen}
          onClose={handleCloseScreenshotSelector}
          onScreenshotCapture={handleScreenshotCapture}
        />
      </div>
    </div>
  );
}
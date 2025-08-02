import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Minus, 
  RotateCcw, 
  Square, 
  Circle, 
  Triangle, 
  Type, 
  Star,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Zap,
  Target,
  X
} from "lucide-react";

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  shortcut: string;
  keyCode: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  description: string;
  category: 'lines' | 'shapes' | 'fibonacci' | 'annotations';
}

interface CustomDrawingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chartContainer: HTMLElement | null;
  activeTool: string | null;
  onToolSelect: (toolId: string) => void;
}

interface KeyboardShortcut {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}

const drawingTools: DrawingTool[] = [
  // Lines Category
  {
    id: 'trend-line',
    name: 'Trend Line',
    icon: <TrendingUp className="w-4 h-4" />,
    shortcut: '⌥ + T',
    keyCode: 't',
    altKey: true,
    description: 'Draw trend lines to identify price direction',
    category: 'lines'
  },
  {
    id: 'horizontal-line',
    name: 'Horizontal Line',
    icon: <Minus className="w-4 h-4" />,
    shortcut: '⌥ + H',
    keyCode: 'h',
    altKey: true,
    description: 'Draw horizontal support/resistance lines',
    category: 'lines'
  },
  {
    id: 'vertical-line',
    name: 'Vertical Line',
    icon: <div className="w-4 h-4 border-l-2 border-current" />,
    shortcut: '⌥ + V',
    keyCode: 'v',
    altKey: true,
    description: 'Draw vertical time-based lines',
    category: 'lines'
  },
  {
    id: 'ray',
    name: 'Ray',
    icon: <ArrowRight className="w-4 h-4" />,
    shortcut: '⌥ + R',
    keyCode: 'r',
    altKey: true,
    description: 'Draw rays extending infinitely',
    category: 'lines'
  },
  
  // Shapes Category
  {
    id: 'rectangle',
    name: 'Rectangle',
    icon: <Square className="w-4 h-4" />,
    shortcut: '⌥ + Shift + R',
    keyCode: 'r',
    altKey: true,
    shiftKey: true,
    description: 'Draw rectangular areas',
    category: 'shapes'
  },
  {
    id: 'circle',
    name: 'Circle',
    icon: <Circle className="w-4 h-4" />,
    shortcut: '⌥ + C',
    keyCode: 'c',
    altKey: true,
    description: 'Draw circular patterns',
    category: 'shapes'
  },
  {
    id: 'triangle',
    name: 'Triangle',
    icon: <Triangle className="w-4 h-4" />,
    shortcut: '⌥ + Shift + T',
    keyCode: 't',
    altKey: true,
    shiftKey: true,
    description: 'Draw triangle patterns',
    category: 'shapes'
  },
  
  // Fibonacci Category
  {
    id: 'fib-retracement',
    name: 'Fib Retracement',
    icon: <Zap className="w-4 h-4" />,
    shortcut: '⌥ + F',
    keyCode: 'f',
    altKey: true,
    description: 'Fibonacci retracement levels',
    category: 'fibonacci'
  },
  {
    id: 'fib-extension',
    name: 'Fib Extension',
    icon: <Target className="w-4 h-4" />,
    shortcut: '⌥ + E',
    keyCode: 'e',
    altKey: true,
    description: 'Fibonacci extension levels',
    category: 'fibonacci'
  },
  
  // Annotations Category
  {
    id: 'text',
    name: 'Text',
    icon: <Type className="w-4 h-4" />,
    shortcut: '⌥ + Shift + A',
    keyCode: 'a',
    altKey: true,
    shiftKey: true,
    description: 'Add text annotations',
    category: 'annotations'
  },
  {
    id: 'note',
    name: 'Note',
    icon: <Star className="w-4 h-4" />,
    shortcut: '⌥ + N',
    keyCode: 'n',
    altKey: true,
    description: 'Add note markers',
    category: 'annotations'
  }
];

const categoryLabels = {
  lines: 'Lines & Rays',
  shapes: 'Shapes',
  fibonacci: 'Fibonacci',
  annotations: 'Annotations'
};

export default function CustomDrawingPanel({
  isOpen,
  onClose,
  chartContainer,
  activeTool,
  onToolSelect
}: CustomDrawingPanelProps) {
  const [processingTool, setProcessingTool] = useState<string | null>(null);
  
  // Function to activate TradingView drawing tools using postMessage API
  const dispatchShortcutToChart = async (tool: DrawingTool) => {
    if (processingTool) return; // Prevent double clicks
    
    setProcessingTool(tool.id);
    
    try {
      // Find the TradingView iframe
      const iframe = document.querySelector('iframe[src*="tradingview"]') as HTMLIFrameElement;
      
      if (!iframe) {
        console.warn('TradingView iframe not found');
        setProcessingTool(null);
        return;
      }
      
      console.log(`Activating ${tool.name} drawing tool via TradingView API`);
      
      // Close the drawing panel first to restore focus to the chart
      onClose();
      
      // Map our tool IDs to TradingView's drawing tool names
      const tradingViewToolMap: Record<string, string> = {
        'trend-line': 'LineToolTrendLine',
        'horizontal-line': 'LineToolHorzLine',
        'vertical-line': 'LineToolVertLine',
        'rectangle': 'LineToolRectangle',
        'ellipse': 'LineToolCircle',
        'text': 'LineToolText',
        'arrow': 'LineToolArrow',
        'cursor': 'cursor'
      };
      
      const tvToolName = tradingViewToolMap[tool.id] || tool.id;
      
      // Wait for panel to close
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Try TradingView's official postMessage API for drawing tools
      if (iframe.contentWindow) {
        // Method 1: Try TradingView's chart API
        iframe.contentWindow.postMessage({
          name: 'activate-drawing-tool',
          data: {
            tool: tvToolName,
            toolName: tool.name
          }
        }, '*');
        
        // Method 2: Try alternative format
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'drawing-tool',
              payload: {
                action: 'activate',
                tool: tvToolName
              }
            }, '*');
          }
        }, 100);
        
        // Method 3: Try TradingView widget command format
        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              name: 'widget-command',
              data: {
                command: 'selectDrawingTool',
                tool: tvToolName
              }
            }, '*');
          }
        }, 200);
        
        console.log(`📡 Sent TradingView API commands for ${tool.name} (${tvToolName})`);
      }
      
      // Fallback: Focus the chart and show user instruction
      setTimeout(() => {
        if (chartContainer) {
          chartContainer.focus();
          chartContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        iframe.focus();
        
        // Show clear user instruction
        console.log(`💡 ${tool.name} tool selected. If not activated automatically, press ${tool.shortcut} on your keyboard or use TradingView's toolbar.`);
      }, 300);
      
      // Update tool selection
      onToolSelect(tool.id);
      
    } catch (error) {
      console.error('Error activating drawing tool:', error);
    } finally {
      // Reset processing state
      setTimeout(() => setProcessingTool(null), 800);
    }
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const [focusedTool, setFocusedTool] = useState<string | null>(null);

  // Handle tool selection with automated shortcut dispatch
  const handleToolSelect = (tool: DrawingTool) => {
    setFocusedTool(tool.id);
    
    console.log(`🎯 Activating ${tool.name} with ${tool.shortcut} shortcut`);
    
    // Dispatch shortcut automatically and close panel
    dispatchShortcutToChart(tool);
    
    // Clear focus highlight after tool is activated
    setTimeout(() => {
      setFocusedTool(null);
    }, 1500);
  };

  // Group tools by category
  const toolsByCategory = drawingTools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, DrawingTool[]>);

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm">
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <Card ref={panelRef} className="w-80 max-h-[80vh] overflow-y-auto shadow-xl border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Drawing Tools</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Click any tool to activate it on the chart
            </p>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {Object.entries(toolsByCategory).map(([category, tools]) => (
              <div key={category} className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {categoryLabels[category as keyof typeof categoryLabels]}
                </h3>
                
                <div className="grid gap-2">
                  {tools.map((tool) => (
                    <Button
                      key={tool.id}
                      variant={activeTool === tool.id ? "default" : "ghost"}
                      className={`justify-start h-auto p-3 transition-all duration-200 ${
                        focusedTool === tool.id ? 'ring-2 ring-primary' : ''
                      } ${processingTool === tool.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => handleToolSelect(tool)}
                      disabled={processingTool === tool.id}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex-shrink-0">
                          {tool.icon}
                        </div>
                        
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tool.name}</span>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                              {tool.shortcut}
                            </Badge>
                            {processingTool === tool.id && (
                              <Badge variant="default" className="text-xs px-1.5 py-0.5 animate-pulse">
                                Activating...
                              </Badge>
                            )}
                            {focusedTool === tool.id && processingTool !== tool.id && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200">
                                Press {tool.shortcut}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tool.description}
                          </p>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            
            <div className="pt-3 border-t border-border/50 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 bg-primary rounded-full" />
                <span>Drawing Tools Integration</span>
              </div>
              
              <div className="text-xs space-y-2">
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                  <div className="font-medium text-blue-900 dark:text-blue-100 mb-2">🎯 Drawing Tool Activation:</div>
                  <ol className="text-blue-800 dark:text-blue-200 space-y-1.5">
                    <li><strong>1.</strong> Click any tool above</li>
                    <li><strong>2.</strong> System sends TradingView API commands</li>
                    <li><strong>3.</strong> If needed, press the keyboard shortcut shown</li>
                    <li><strong>4.</strong> Click and drag on chart to draw</li>
                  </ol>
                </div>
                
                <div className="bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                  <div className="text-amber-800 dark:text-amber-200">
                    <strong>💡 Fallback:</strong> Use TradingView's drawing toolbar if automation doesn't work
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
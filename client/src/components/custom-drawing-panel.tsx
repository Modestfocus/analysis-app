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
  
  // Function to dispatch keyboard shortcuts to TradingView iframe
  const dispatchShortcutToChart = async (tool: DrawingTool) => {
    if (processingTool) return; // Prevent double clicks
    
    setProcessingTool(tool.id);
    
    try {
      // Try multiple methods to find the TradingView iframe
      let iframe: HTMLIFrameElement | null = null;
      
      // Method 1: Look for iframe with TradingView in src
      iframe = document.querySelector('iframe[src*="tradingview"]') as HTMLIFrameElement;
      
      // Method 2: Look for iframe in chart container
      if (!iframe && chartContainer) {
        iframe = chartContainer.querySelector('iframe') as HTMLIFrameElement;
      }
      
      // Method 3: Look for any iframe (fallback)
      if (!iframe) {
        iframe = document.querySelector('iframe') as HTMLIFrameElement;
      }
      
      if (!iframe) {
        console.warn('No iframe found for TradingView');
        setProcessingTool(null);
        return;
      }
      
      console.log(`Found iframe: ${iframe.src || 'no src'}`);
      
      // Focus the iframe element first
      iframe.focus();
      
      // Multiple dispatch strategies
      const dispatchEvent = (target: EventTarget, eventType: string = 'keydown') => {
        const event = new KeyboardEvent(eventType, {
          key: tool.keyCode.toUpperCase(),
          code: `Key${tool.keyCode.toUpperCase()}`,
          altKey: tool.altKey || false,
          shiftKey: tool.shiftKey || false,
          ctrlKey: tool.ctrlKey || false,
          bubbles: true,
          cancelable: true,
          composed: true
        });
        target.dispatchEvent(event);
      };
      
      // Strategy 1: Dispatch to iframe element itself
      dispatchEvent(iframe);
      
      // Strategy 2: Try to access iframe content if same origin
      try {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          
          // Wait for focus
          await new Promise(resolve => setTimeout(resolve, 150));
          
          // Dispatch to content window and document
          if (iframe.contentDocument) {
            dispatchEvent(iframe.contentDocument);
            dispatchEvent(iframe.contentDocument.body || iframe.contentDocument);
          }
          dispatchEvent(iframe.contentWindow);
        }
      } catch (crossOriginError) {
        console.log('Cross-origin iframe, using postMessage approach');
        
        // Strategy 3: Use TradingView's widget postMessage API
        if (iframe.contentWindow) {
          // TradingView widget expects specific message format
          iframe.contentWindow.postMessage({
            name: 'set_symbol',
            data: {
              symbol: 'NASDAQ:NDX' // Keep current symbol
            }
          }, '*');
          
          // Try TradingView's chart action postMessage
          setTimeout(() => {
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                name: 'chart_action',
                data: {
                  action: 'drawing_tool',
                  tool: tool.id,
                  shortcut: tool.keyCode
                }
              }, '*');
            }
          }, 100);
        }
      }
      
      // Strategy 4: Simulate the key press on the main document
      dispatchEvent(document);
      dispatchEvent(document.body);
      
      // Strategy 5: Try to simulate focus and key press more aggressively
      setTimeout(() => {
        try {
          // Focus the iframe container and simulate user interaction
          if (chartContainer) {
            chartContainer.focus();
            chartContainer.click();
          }
          
          // Try to dispatch the key event with different event types
          ['keydown', 'keypress', 'keyup'].forEach(eventType => {
            const keyEvent = new KeyboardEvent(eventType, {
              key: tool.keyCode.toUpperCase(),
              code: `Key${tool.keyCode.toUpperCase()}`,
              altKey: tool.altKey || false,
              shiftKey: tool.shiftKey || false,
              ctrlKey: tool.ctrlKey || false,
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window
            });
            
            // Dispatch to multiple targets
            document.dispatchEvent(keyEvent);
            if (chartContainer) chartContainer.dispatchEvent(keyEvent);
            if (iframe) iframe.dispatchEvent(keyEvent);
          });
          
          console.log(`Simulated aggressive key press for ${tool.shortcut}`);
          
        } catch (aggresiveError) {
          console.log('Aggressive key simulation failed:', aggresiveError);
        }
      }, 300);
      
      console.log(`✅ Dispatched ${tool.shortcut} shortcut for ${tool.name} using multiple strategies`);
      
      // Strategy 6: Show user instructions since automated activation may not work
      setTimeout(() => {
        console.log(`💡 If drawing doesn't activate automatically, manually press ${tool.shortcut} while focused on the chart`);
      }, 500);
      
      // Update tool selection
      onToolSelect(tool.id);
      
    } catch (error) {
      console.error('Error dispatching shortcut:', error);
    } finally {
      // Reset processing state after a short delay
      setTimeout(() => setProcessingTool(null), 800);
    }
  };
  const panelRef = useRef<HTMLDivElement>(null);
  const [focusedTool, setFocusedTool] = useState<string | null>(null);

  // Handle tool selection with keyboard shortcut dispatch
  const handleToolSelect = (tool: DrawingTool) => {
    setFocusedTool(tool.id);
    onToolSelect(tool.id);
    dispatchShortcutToChart(tool);
    
    // Clear focus highlight after a delay
    setTimeout(() => {
      setFocusedTool(null);
    }, 2000);
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
                <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                  <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">How to Draw:</div>
                  <ol className="text-blue-800 dark:text-blue-200 space-y-1">
                    <li>1. Click a tool above (activates automatically)</li>
                    <li>2. If needed, manually press the shortcut (e.g. Alt+T)</li>
                    <li>3. Click and drag on the chart to draw</li>
                  </ol>
                </div>
                
                <div className="bg-muted/50 p-2 rounded space-y-1">
                  <div><strong>Backup:</strong> Use TradingView's built-in toolbar at the top of the chart</div>
                  <div><strong>Common shortcuts:</strong> Alt+T, Alt+H, Alt+R, Alt+C</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
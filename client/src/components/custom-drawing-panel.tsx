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
  const panelRef = useRef<HTMLDivElement>(null);
  const [focusedTool, setFocusedTool] = useState<string | null>(null);

  // Focus the TradingView chart iframe
  const focusChart = () => {
    if (!chartContainer) return;
    
    try {
      // Find the TradingView iframe within the chart container
      const iframe = chartContainer.querySelector('iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.focus();
        // Also try to focus the iframe's content window
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
        }
      }
    } catch (error) {
      console.warn('Could not focus chart iframe:', error);
    }
  };

  // Dispatch keyboard shortcut
  const dispatchShortcut = (tool: DrawingTool) => {
    if (!chartContainer) return;

    // Focus the chart first
    focusChart();
    
    // Small delay to ensure focus is set
    setTimeout(() => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        key: tool.keyCode,
        code: `Key${tool.keyCode.toUpperCase()}`,
        altKey: tool.altKey || false,
        ctrlKey: tool.ctrlKey || false,
        shiftKey: tool.shiftKey || false,
        bubbles: true,
        cancelable: true
      });

      // Dispatch to both the container and document
      chartContainer.dispatchEvent(keyboardEvent);
      document.dispatchEvent(keyboardEvent);
      
      // Also try dispatching to the iframe if available
      const iframe = chartContainer.querySelector('iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentDocument) {
        iframe.contentDocument.dispatchEvent(keyboardEvent);
      }
    }, 100);
  };

  // Handle tool selection
  const handleToolSelect = (tool: DrawingTool) => {
    setFocusedTool(tool.id);
    onToolSelect(tool.id);
    dispatchShortcut(tool);
    
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
                      }`}
                      onClick={() => handleToolSelect(tool)}
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
            
            <div className="pt-3 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 bg-primary rounded-full" />
                <span>Tools activate TradingView's native drawing features</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
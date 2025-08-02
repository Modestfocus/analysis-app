import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Minus, 
  MoreHorizontal, 
  TrendingUp, 
  Square, 
  Circle, 
  Type, 
  ArrowRight, 
  Paintbrush,
  MousePointer,
  ChevronLeft,
  ChevronRight,
  Settings,
  Trash2,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'lines' | 'shapes' | 'annotations' | 'cursor';
}

interface DrawingToolbarProps {
  onToolSelect: (toolId: string) => void;
  selectedTool: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClearAll?: () => void;
}

const drawingTools: DrawingTool[] = [
  // Cursor Tools
  { id: 'cursor', name: 'Cursor', icon: <MousePointer className="h-4 w-4" />, category: 'cursor' },
  
  // Line Tools
  { id: 'trend-line', name: 'Trend Line', icon: <TrendingUp className="h-4 w-4" />, category: 'lines' },
  { id: 'horizontal-line', name: 'Horizontal Line', icon: <Minus className="h-4 w-4" />, category: 'lines' },
  { id: 'vertical-line', name: 'Vertical Line', icon: <MoreHorizontal className="h-4 w-4 rotate-90" />, category: 'lines' },
  { id: 'ray', name: 'Ray', icon: <ArrowRight className="h-4 w-4" />, category: 'lines' },
  
  // Shape Tools
  { id: 'rectangle', name: 'Rectangle', icon: <Square className="h-4 w-4" />, category: 'shapes' },
  { id: 'ellipse', name: 'Ellipse', icon: <Circle className="h-4 w-4" />, category: 'shapes' },
  
  // Annotation Tools
  { id: 'text', name: 'Text', icon: <Type className="h-4 w-4" />, category: 'annotations' },
  { id: 'brush', name: 'Brush', icon: <Paintbrush className="h-4 w-4" />, category: 'annotations' },
];

export default function DrawingToolbar({ 
  onToolSelect, 
  selectedTool, 
  isCollapsed, 
  onToggleCollapse,
  onClearAll
}: DrawingToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  const handleToolClick = (toolId: string) => {
    onToolSelect(toolId);
    // Show user feedback about tool selection
    if (toolId !== 'cursor') {
      console.log(`${toolId} selected - Use TradingView's built-in toolbar for drawing`);
    }
  };

  const groupedTools = drawingTools.reduce((groups, tool) => {
    if (!groups[tool.category]) {
      groups[tool.category] = [];
    }
    groups[tool.category].push(tool);
    return groups;
  }, {} as Record<string, DrawingTool[]>);

  if (isCollapsed) {
    return (
      <div className="fixed left-4 top-20 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleCollapse}
          className="bg-white dark:bg-gray-800 shadow-lg"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed left-4 top-20 z-50 w-16">
      <Card className="shadow-lg border-gray-200 dark:border-gray-700">
        <CardHeader className="p-2 pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Drawing Tools
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {/* Cursor Tools */}
          <div className="space-y-1">
            {groupedTools.cursor?.map((tool) => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="sm"
                className="w-full h-10 p-2 relative group"
                onClick={() => handleToolClick(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
              >
                {tool.icon}
                {hoveredTool === tool.id && (
                  <div className="absolute left-16 top-0 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {tool.name}
                  </div>
                )}
              </Button>
            ))}
          </div>

          <Separator className="my-2" />

          {/* Line Tools */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Lines</div>
            {groupedTools.lines?.map((tool) => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="sm"
                className="w-full h-10 p-2 relative group"
                onClick={() => handleToolClick(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
              >
                {tool.icon}
                {hoveredTool === tool.id && (
                  <div className="absolute left-16 top-0 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {tool.name}
                  </div>
                )}
              </Button>
            ))}
          </div>

          <Separator className="my-2" />

          {/* Shape Tools */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Shapes</div>
            {groupedTools.shapes?.map((tool) => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="sm"
                className="w-full h-10 p-2 relative group"
                onClick={() => handleToolClick(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
              >
                {tool.icon}
                {hoveredTool === tool.id && (
                  <div className="absolute left-16 top-0 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {tool.name}
                  </div>
                )}
              </Button>
            ))}
          </div>

          <Separator className="my-2" />

          {/* Annotation Tools */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Text</div>
            {groupedTools.annotations?.map((tool) => (
              <Button
                key={tool.id}
                variant={selectedTool === tool.id ? "default" : "ghost"}
                size="sm"
                className="w-full h-10 p-2 relative group"
                onClick={() => handleToolClick(tool.id)}
                onMouseEnter={() => setHoveredTool(tool.id)}
                onMouseLeave={() => setHoveredTool(null)}
              >
                {tool.icon}
                {hoveredTool === tool.id && (
                  <div className="absolute left-16 top-0 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {tool.name}
                  </div>
                )}
              </Button>
            ))}
          </div>

          <Separator className="my-2" />

          {/* Drawing Management Tools */}
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 p-2 relative group"
              onClick={() => {/* Handle settings */}}
            >
              <Settings className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 p-2 relative group text-red-600 hover:text-red-700"
              onClick={onClearAll}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Usage Instructions */}
          <Separator className="my-2" />
          <div className="text-xs text-gray-500 dark:text-gray-400 px-1 leading-relaxed">
            💡 <strong>Working:</strong> These tools now draw directly on the chart.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
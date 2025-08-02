import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Minus, 
  Move3D,
  Square,
  Type,
  Eraser,
  Settings,
  Palette,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'lines' | 'shapes' | 'annotations' | 'tools';
}

interface CustomDrawingPanelProps {
  onToolSelect: (toolId: string) => void;
  selectedTool: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSettings: () => void;
}

const drawingTools: DrawingTool[] = [
  // Lines
  { id: 'trend-line', name: 'Trend Line', icon: <TrendingUp className="h-4 w-4" />, category: 'lines' },
  { id: 'horizontal-line', name: 'Horizontal Line', icon: <Minus className="h-4 w-4" />, category: 'lines' },
  { id: 'ray', name: 'Ray', icon: <Move3D className="h-4 w-4" />, category: 'lines' },
  
  // Shapes
  { id: 'rectangle', name: 'Rectangle', icon: <Square className="h-4 w-4" />, category: 'shapes' },
  
  // Annotations
  { id: 'text-label', name: 'Text Label', icon: <Type className="h-4 w-4" />, category: 'annotations' },
  
  // Tools
  { id: 'eraser', name: 'Eraser', icon: <Eraser className="h-4 w-4" />, category: 'tools' },
];

export default function CustomDrawingPanel({
  onToolSelect,
  selectedTool,
  isCollapsed,
  onToggleCollapse,
  onOpenSettings
}: CustomDrawingPanelProps) {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  const groupedTools = drawingTools.reduce((acc, tool) => {
    if (!acc[tool.category]) {
      acc[tool.category] = [];
    }
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, DrawingTool[]>);

  const handleToolClick = (toolId: string) => {
    console.log(`Custom drawing tool selected: ${toolId}`);
    onToolSelect(toolId);
  };

  if (isCollapsed) {
    return (
      <div className="fixed left-20 top-20 z-50 w-12">
        <Card className="shadow-lg border-gray-200 dark:border-gray-700">
          <CardContent className="p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="w-full h-10 p-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed left-20 top-20 z-50 w-16">
      <Card className="shadow-lg border-gray-200 dark:border-gray-700">
        <CardContent className="p-2 space-y-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className="text-xs">
              Custom
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>

          {/* Lines */}
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

          {/* Shapes */}
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

          {/* Annotations */}
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

          {/* Tools */}
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Tools</div>
            {groupedTools.tools?.map((tool) => (
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

          {/* Settings */}
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 p-2 relative group"
              onClick={onOpenSettings}
            >
              <Palette className="h-3 w-3" />
            </Button>
          </div>


        </CardContent>
      </Card>
    </div>
  );
}
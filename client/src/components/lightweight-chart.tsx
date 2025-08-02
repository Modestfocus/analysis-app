import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, LineStyle, ColorType, Time } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  TrendingUp, 
  Minus, 
  MoreVertical, 
  Square, 
  Circle, 
  Type, 
  MousePointer,
  Trash2,
  Settings
} from 'lucide-react';

interface LightweightChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
}

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'lines' | 'shapes' | 'annotations';
}

const DRAWING_TOOLS: DrawingTool[] = [
  { id: 'cursor', name: 'Cursor', icon: <MousePointer className="h-4 w-4" />, category: 'lines' },
  { id: 'trend-line', name: 'Trend Line', icon: <TrendingUp className="h-4 w-4" />, category: 'lines' },
  { id: 'horizontal-line', name: 'Horizontal Line', icon: <Minus className="h-4 w-4" />, category: 'lines' },
  { id: 'vertical-line', name: 'Vertical Line', icon: <MoreVertical className="h-4 w-4" />, category: 'lines' },
  { id: 'rectangle', name: 'Rectangle', icon: <Square className="h-4 w-4" />, category: 'shapes' },
  { id: 'circle', name: 'Circle', icon: <Circle className="h-4 w-4" />, category: 'shapes' },
  { id: 'text', name: 'Text', icon: <Type className="h-4 w-4" />, category: 'annotations' },
];

export default function LightweightChart({ symbol, onSymbolChange }: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>('cursor');
  const [drawings, setDrawings] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: 'black',
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#cccccc',
      },
      timeScale: {
        borderColor: '#cccccc',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add line series (using correct API)
    const lineSeries = chart.addSeries('Line', {
      color: 'rgba(38, 166, 154, 1)',
      lineWidth: 2,
    });

    seriesRef.current = lineSeries;

    // Generate sample data for the symbol
    const generateSampleData = () => {
      const data = [];
      let basePrice = symbol === 'NASDAQ:AAPL' ? 150 : 
                     symbol === 'NASDAQ:GOOGL' ? 2800 :
                     symbol === 'NASDAQ:TSLA' ? 800 : 100;
      
      for (let i = 0; i < 100; i++) {
        const time = Math.floor(Date.now() / 1000) - (100 - i) * 86400; // Daily data
        const variation = (Math.random() - 0.5) * basePrice * 0.02;
        const open = basePrice;
        const close = basePrice + variation;
        const high = Math.max(open, close) + Math.random() * basePrice * 0.01;
        const low = Math.min(open, close) - Math.random() * basePrice * 0.01;
        
        data.push({
          time: time as Time,
          value: close,
        });
        
        basePrice = close;
      }
      return data;
    };

    lineSeries.setData(generateSampleData());

    // Handle drawing functionality
    let currentDrawing: any = null;
    let drawingLine: any = null;

    const handleMouseDown = (param: any) => {
      if (selectedTool === 'cursor') return;
      
      if (!param.point || !param.time) return;
      
      setIsDrawing(true);
      
      if (selectedTool === 'trend-line') {
        const price = seriesRef.current ? param.seriesData.get(seriesRef.current)?.value || 0 : 0;
        currentDrawing = {
          type: 'trend-line',
          startTime: param.time,
          startPrice: price,
          endTime: param.time,
          endPrice: price,
        };
      } else if (selectedTool === 'horizontal-line') {
        const price = seriesRef.current ? param.seriesData.get(seriesRef.current)?.value || 0 : 0;
        drawingLine = lineSeries.createPriceLine({
          price,
          color: '#2196F3',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Support',
        });
        
        setDrawings(prev => [...prev, {
          type: 'horizontal-line',
          price,
          line: drawingLine,
        }]);
        setIsDrawing(false);
      }
    };

    const handleMouseMove = (param: any) => {
      if (!isDrawing || !currentDrawing || !param.point || !param.time) return;
      
      if (selectedTool === 'trend-line') {
        const price = seriesRef.current ? param.seriesData.get(seriesRef.current)?.value || 0 : 0;
        currentDrawing.endTime = param.time;
        currentDrawing.endPrice = price;
      }
    };

    const handleMouseUp = () => {
      if (!isDrawing) return;
      
      setIsDrawing(false);
      
      if (currentDrawing && selectedTool === 'trend-line') {
        // For trend lines, we'll use price lines as an approximation
        const avgPrice = (currentDrawing.startPrice + currentDrawing.endPrice) / 2;
        drawingLine = lineSeries.createPriceLine({
          price: avgPrice,
          color: '#FF6B6B',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Trend',
        });
        
        setDrawings(prev => [...prev, {
          ...currentDrawing,
          line: drawingLine,
        }]);
      }
      
      currentDrawing = null;
    };

    // Subscribe to chart events
    chart.subscribeClick(handleMouseDown);
    chart.subscribeCrosshairMove(handleMouseMove);
    
    // Handle window resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleMouseUp);
      chart.remove();
    };
  }, [symbol, selectedTool, isDrawing]);

  const handleToolSelect = (toolId: string) => {
    setSelectedTool(toolId);
    console.log(`Selected drawing tool: ${toolId}`);
  };

  const clearAllDrawings = () => {
    drawings.forEach(drawing => {
      if (drawing.line && seriesRef.current) {
        seriesRef.current.removePriceLine(drawing.line);
      }
    });
    setDrawings([]);
  };

  const groupedTools = DRAWING_TOOLS.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, DrawingTool[]>);

  return (
    <div className="flex h-full">
      {/* Drawing Toolbar */}
      <div className="w-16 border-r bg-gray-50 dark:bg-gray-900 flex flex-col">
        <Card className="m-2 border-0 shadow-none bg-transparent">
          <CardHeader className="pb-2 px-2">
            <CardTitle className="text-xs text-center">Drawing Tools</CardTitle>
          </CardHeader>
          <CardContent className="p-1 space-y-3">
            {/* Lines */}
            <div className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Lines</div>
              {groupedTools.lines?.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "ghost"}
                  size="sm"
                  className="w-full h-10 p-2"
                  onClick={() => handleToolSelect(tool.id)}
                  title={tool.name}
                >
                  {tool.icon}
                </Button>
              ))}
            </div>

            {/* Shapes */}
            <div className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Shapes</div>
              {groupedTools.shapes?.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "ghost"}
                  size="sm"
                  className="w-full h-10 p-2"
                  onClick={() => handleToolSelect(tool.id)}
                  title={tool.name}
                  disabled
                >
                  {tool.icon}
                </Button>
              ))}
            </div>

            {/* Text */}
            <div className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 px-1 mb-1">Text</div>
              {groupedTools.annotations?.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "ghost"}
                  size="sm"
                  className="w-full h-10 p-2"
                  onClick={() => handleToolSelect(tool.id)}
                  title={tool.name}
                  disabled
                >
                  {tool.icon}
                </Button>
              ))}
            </div>

            {/* Management */}
            <div className="space-y-1 pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 p-2"
                onClick={clearAllDrawings}
                title="Clear All Drawings"
              >
                <Trash2 className="h-3 w-3 text-red-600" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart Container */}
      <div className="flex-1 flex flex-col">
        {/* Chart Header */}
        <div className="p-4 border-b bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-semibold">{symbol}</h2>
              <div className="text-sm text-gray-500">
                Selected Tool: <span className="font-medium">{DRAWING_TOOLS.find(t => t.id === selectedTool)?.name}</span>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Drawings: {drawings.length}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 p-4">
          <div ref={chartContainerRef} className="w-full h-full border rounded-lg" />
        </div>

        {/* Instructions */}
        <div className="p-4 border-t bg-gray-50 dark:bg-gray-900">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            💡 <strong>Instructions:</strong> Select a drawing tool, then click and drag on the chart to draw. 
            Currently supports trend lines and horizontal support/resistance lines.
          </div>
        </div>
      </div>
    </div>
  );
}
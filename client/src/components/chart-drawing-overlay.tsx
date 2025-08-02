import { useEffect, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
  chartX?: number;
  chartY?: number;
}

interface DrawingObject {
  id: string;
  type: string;
  points: Point[];
  style: {
    color: string;
    thickness: number;
    lineStyle: 'solid' | 'dashed';
  };
  text?: string;
  completed: boolean;
}

interface ChartDrawingOverlayProps {
  selectedTool: string;
  isChartReady: boolean;
  drawings: DrawingObject[];
  onDrawingComplete: (drawing: DrawingObject) => void;
  onDrawingUpdate: (drawings: DrawingObject[]) => void;
}

export default function ChartDrawingOverlay({
  selectedTool,
  isChartReady,
  drawings,
  onDrawingComplete,
  onDrawingUpdate
}: ChartDrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    const updateCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      redrawCanvas();
    };

    updateCanvas();
    
    const resizeObserver = new ResizeObserver(updateCanvas);
    resizeObserver.observe(container);
    
    return () => resizeObserver.disconnect();
  }, [isChartReady]);

  // Redraw canvas
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawings.forEach(drawing => {
      if (drawing.completed) {
        drawShape(ctx, drawing);
      }
    });
  };

  // Draw shape on canvas
  const drawShape = (ctx: CanvasRenderingContext2D, drawing: DrawingObject) => {
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.thickness;
    ctx.setLineDash(drawing.style.lineStyle === 'dashed' ? [5, 5] : []);

    // Convert chart coordinates to current canvas coordinates
    const canvasPoints = drawing.points.map(point => {
      if (point.chartX !== undefined && point.chartY !== undefined) {
        return {
          x: point.chartX * ctx.canvas.width,
          y: point.chartY * ctx.canvas.height
        };
      }
      return point;
    });

    switch (drawing.type) {
      case 'trend-line':
        if (canvasPoints.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
          ctx.lineTo(canvasPoints[1].x, canvasPoints[1].y);
          ctx.stroke();
        }
        break;
        
      case 'horizontal-line':
        if (canvasPoints.length >= 1) {
          ctx.beginPath();
          ctx.moveTo(0, canvasPoints[0].y);
          ctx.lineTo(ctx.canvas.width, canvasPoints[0].y);
          ctx.stroke();
        }
        break;
        
      case 'rectangle':
        if (canvasPoints.length >= 2) {
          const width = canvasPoints[1].x - canvasPoints[0].x;
          const height = canvasPoints[1].y - canvasPoints[0].y;
          ctx.beginPath();
          ctx.rect(canvasPoints[0].x, canvasPoints[0].y, width, height);
          ctx.stroke();
        }
        break;
    }
  };

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === 'cursor' || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const point: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      chartX: (e.clientX - rect.left) / rect.width,
      chartY: (e.clientY - rect.top) / rect.height
    };
    
    setStartPoint(point);
    setIsDrawing(true);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPoint || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const endPoint: Point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      chartX: (e.clientX - rect.left) / rect.width,
      chartY: (e.clientY - rect.top) / rect.height
    };
    
    const newDrawing: DrawingObject = {
      id: `drawing-${Date.now()}`,
      type: selectedTool,
      points: [startPoint, endPoint],
      style: {
        color: '#2563eb',
        thickness: 2,
        lineStyle: 'solid'
      },
      completed: true
    };
    
    const updatedDrawings = [...drawings, newDrawing];
    onDrawingUpdate(updatedDrawings);
    onDrawingComplete(newDrawing);
    
    setIsDrawing(false);
    setStartPoint(null);
  };

  if (!isChartReady) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: selectedTool === 'cursor' ? -1 : 30 }}
    >
      {/* Drawing overlay */}
      {selectedTool !== 'cursor' && (
        <div 
          className="absolute inset-0 pointer-events-auto cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        />
      )}
      
      {/* Canvas for drawings */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundColor: 'transparent' }}
      />
    </div>
  );
}
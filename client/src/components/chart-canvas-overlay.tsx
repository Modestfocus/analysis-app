import { useEffect, useRef, useState } from "react";

interface Point {
  x: number;
  y: number;
}

interface DrawingObject {
  id: string;
  type: 'trend-line' | 'horizontal-line' | 'ray' | 'rectangle' | 'text-label';
  points: Point[];
  style: DrawingStyle;
  text?: string;
}

interface DrawingStyle {
  color: string;
  thickness: number;
  lineStyle: 'solid' | 'dashed';
}

interface ChartCanvasOverlayProps {
  selectedTool: string;
  drawingStyle: DrawingStyle;
  chartBounds: DOMRect | null;
  onDrawingComplete: (drawing: DrawingObject) => void;
  drawings: DrawingObject[];
  onDrawingDelete: (id: string) => void;
}

export default function ChartCanvasOverlay({
  selectedTool,
  drawingStyle,
  chartBounds,
  onDrawingComplete,
  drawings,
  onDrawingDelete
}: ChartCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<Partial<DrawingObject> | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);

  // Redraw all drawings when drawings array changes
  useEffect(() => {
    if (!canvasRef.current || !chartBounds) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all existing drawings
    drawings.forEach(drawing => {
      drawShape(ctx, drawing);
    });
  }, [drawings, chartBounds]);

  // Handle canvas resizing
  useEffect(() => {
    if (!canvasRef.current || !chartBounds) return;
    
    const canvas = canvasRef.current;
    canvas.width = chartBounds.width;
    canvas.height = chartBounds.height;
  }, [chartBounds]);

  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    if (!canvasRef.current || !chartBounds) return { x: 0, y: 0 };
    
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const drawShape = (ctx: CanvasRenderingContext2D, drawing: DrawingObject) => {
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.thickness;
    ctx.setLineDash(drawing.style.lineStyle === 'dashed' ? [5, 5] : []);

    switch (drawing.type) {
      case 'trend-line':
        if (drawing.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
          ctx.lineTo(drawing.points[1].x, drawing.points[1].y);
          ctx.stroke();
        }
        break;
        
      case 'horizontal-line':
        if (drawing.points.length >= 1 && canvasRef.current) {
          ctx.beginPath();
          ctx.moveTo(0, drawing.points[0].y);
          ctx.lineTo(canvasRef.current.width, drawing.points[0].y);
          ctx.stroke();
        }
        break;
        
      case 'ray':
        if (drawing.points.length >= 2 && canvasRef.current) {
          const start = drawing.points[0];
          const end = drawing.points[1];
          
          // Calculate direction and extend to canvas edge
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          
          if (length > 0) {
            const extendedX = start.x + (dx / length) * canvasRef.current.width;
            const extendedY = start.y + (dy / length) * canvasRef.current.width;
            
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(extendedX, extendedY);
            ctx.stroke();
          }
        }
        break;
        
      case 'rectangle':
        if (drawing.points.length >= 2) {
          const start = drawing.points[0];
          const end = drawing.points[1];
          const width = end.x - start.x;
          const height = end.y - start.y;
          
          ctx.beginPath();
          ctx.rect(start.x, start.y, width, height);
          ctx.stroke();
        }
        break;
        
      case 'text-label':
        if (drawing.points.length >= 1 && drawing.text) {
          ctx.fillStyle = drawing.style.color;
          ctx.font = '14px Arial';
          ctx.fillText(drawing.text, drawing.points[0].x, drawing.points[0].y);
        }
        break;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'cursor' || selectedTool === 'eraser') return;

    const point = getMousePosition(e);
    setStartPoint(point);
    setIsDrawing(true);

    if (selectedTool === 'text-label') {
      const text = prompt('Enter text:');
      if (text) {
        const newDrawing: DrawingObject = {
          id: `drawing-${Date.now()}`,
          type: 'text-label',
          points: [point],
          style: drawingStyle,
          text
        };
        onDrawingComplete(newDrawing);
      }
      setIsDrawing(false);
      return;
    }

    setCurrentDrawing({
      id: `drawing-${Date.now()}`,
      type: selectedTool as DrawingObject['type'],
      points: [point],
      style: drawingStyle
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !currentDrawing || !canvasRef.current) return;

    const currentPoint = getMousePosition(e);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas and redraw all existing drawings
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    drawings.forEach(drawing => drawShape(ctx, drawing));

    // Draw current drawing preview
    const previewDrawing: DrawingObject = {
      ...currentDrawing as DrawingObject,
      points: [startPoint, currentPoint]
    };
    drawShape(ctx, previewDrawing);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !currentDrawing) return;

    const endPoint = getMousePosition(e);
    
    // Only complete drawing if there's meaningful movement (except for horizontal lines)
    const minDistance = 5;
    const distance = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)
    );

    if (currentDrawing.type === 'horizontal-line' || distance >= minDistance) {
      const completedDrawing: DrawingObject = {
        ...currentDrawing as DrawingObject,
        points: currentDrawing.type === 'horizontal-line' ? [startPoint] : [startPoint, endPoint]
      };
      onDrawingComplete(completedDrawing);
    }

    setIsDrawing(false);
    setCurrentDrawing(null);
    setStartPoint(null);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool !== 'eraser') return;

    const clickPoint = getMousePosition(e);
    
    // Find drawing to delete (simple hit detection)
    const drawingToDelete = drawings.find(drawing => {
      return drawing.points.some(point => {
        const distance = Math.sqrt(
          Math.pow(clickPoint.x - point.x, 2) + Math.pow(clickPoint.y - point.y, 2)
        );
        return distance < 10; // 10px tolerance
      });
    });

    if (drawingToDelete) {
      onDrawingDelete(drawingToDelete.id);
    }
  };

  if (!chartBounds) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-auto"
      style={{
        width: chartBounds.width,
        height: chartBounds.height,
        cursor: selectedTool === 'cursor' ? 'default' : 'crosshair'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
}
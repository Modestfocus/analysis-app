import { useEffect, useRef, useState, useCallback } from "react";

interface Point {
  x: number;
  y: number;
}

interface DrawingObject {
  id: string;
  type: 'cursor' | 'trend-line' | 'horizontal-line' | 'vertical-line' | 'ray' | 'rectangle' | 'ellipse' | 'text' | 'note';
  points: Point[];
  style: DrawingStyle;
  text?: string;
  completed: boolean;
}

interface DrawingStyle {
  color: string;
  thickness: number;
  lineStyle: 'solid' | 'dashed';
}

interface WorkingChartCanvasProps {
  selectedTool: string;
  chartContainer: HTMLElement | null;
  onDrawingComplete?: (drawing: DrawingObject) => void;
  drawings?: DrawingObject[];
  onDrawingUpdate?: (drawings: DrawingObject[]) => void;
}

export default function WorkingChartCanvas({
  selectedTool,
  chartContainer,
  onDrawingComplete,
  drawings = [],
  onDrawingUpdate
}: WorkingChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<Partial<DrawingObject> | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [canvasBounds, setCanvasBounds] = useState<DOMRect | null>(null);

  const defaultStyle: DrawingStyle = {
    color: '#2563eb',
    thickness: 2,
    lineStyle: 'solid'
  };

  // Update canvas size when chart container changes
  useEffect(() => {
    if (!canvasRef.current || !chartContainer) return;
    
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = chartContainer;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      setCanvasBounds(rect);
      
      // Redraw all existing drawings
      redrawCanvas();
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [chartContainer]);

  // Redraw canvas when drawings change
  useEffect(() => {
    redrawCanvas();
  }, [drawings]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all existing drawings
    drawings.forEach(drawing => {
      if (drawing.completed) {
        drawShape(ctx, drawing);
      }
    });
  }, [drawings]);

  const getMousePosition = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    if (!canvasRef.current || !canvasBounds) return { x: 0, y: 0 };
    
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
        
      case 'vertical-line':
        if (drawing.points.length >= 1 && canvasRef.current) {
          ctx.beginPath();
          ctx.moveTo(drawing.points[0].x, 0);
          ctx.lineTo(drawing.points[0].x, canvasRef.current.height);
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
            const extendedX = start.x + (dx / length) * canvasRef.current.width * 2;
            const extendedY = start.y + (dy / length) * canvasRef.current.width * 2;
            
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
        
      case 'ellipse':
        if (drawing.points.length >= 2) {
          const start = drawing.points[0];
          const end = drawing.points[1];
          const centerX = (start.x + end.x) / 2;
          const centerY = (start.y + end.y) / 2;
          const radiusX = Math.abs(end.x - start.x) / 2;
          const radiusY = Math.abs(end.y - start.y) / 2;
          
          ctx.beginPath();
          ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          ctx.stroke();
        }
        break;
        
      case 'text':
      case 'note':
        if (drawing.points.length >= 1 && drawing.text) {
          ctx.fillStyle = drawing.style.color;
          ctx.font = '14px Arial';
          ctx.fillText(drawing.text, drawing.points[0].x, drawing.points[0].y);
        }
        break;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'cursor') return;

    const point = getMousePosition(e);
    setStartPoint(point);
    setIsDrawing(true);

    if (selectedTool === 'text' || selectedTool === 'note') {
      const text = prompt('Enter text:');
      if (text) {
        const newDrawing: DrawingObject = {
          id: `drawing-${Date.now()}`,
          type: selectedTool as DrawingObject['type'],
          points: [point],
          style: defaultStyle,
          text,
          completed: true
        };
        
        const updatedDrawings = [...drawings, newDrawing];
        onDrawingUpdate?.(updatedDrawings);
        onDrawingComplete?.(newDrawing);
      }
      setIsDrawing(false);
      return;
    }

    setCurrentDrawing({
      id: `drawing-${Date.now()}`,
      type: selectedTool as DrawingObject['type'],
      points: [point],
      style: defaultStyle,
      completed: false
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !currentDrawing || !canvasRef.current) return;

    const currentPoint = getMousePosition(e);
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Clear canvas and redraw all existing drawings
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    drawings.forEach(drawing => {
      if (drawing.completed) {
        drawShape(ctx, drawing);
      }
    });

    // Draw current drawing preview
    const previewDrawing: DrawingObject = {
      ...currentDrawing as DrawingObject,
      points: currentDrawing.type === 'horizontal-line' || currentDrawing.type === 'vertical-line' 
        ? [startPoint] 
        : [startPoint, currentPoint],
      completed: true
    };
    drawShape(ctx, previewDrawing);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !currentDrawing) return;

    const endPoint = getMousePosition(e);
    
    // Only complete drawing if there's meaningful movement (except for lines that only need one point)
    const minDistance = 5;
    const distance = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2)
    );

    const needsTwoPoints = !['horizontal-line', 'vertical-line'].includes(currentDrawing.type || '');
    
    if (!needsTwoPoints || distance >= minDistance) {
      const completedDrawing: DrawingObject = {
        ...currentDrawing as DrawingObject,
        points: needsTwoPoints ? [startPoint, endPoint] : [startPoint],
        completed: true
      };
      
      const updatedDrawings = [...drawings, completedDrawing];
      onDrawingUpdate?.(updatedDrawings);
      onDrawingComplete?.(completedDrawing);
    }

    setIsDrawing(false);
    setCurrentDrawing(null);
    setStartPoint(null);
  };

  if (!chartContainer) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-auto z-10"
      style={{
        cursor: selectedTool === 'cursor' ? 'default' : 'crosshair',
        width: '100%',
        height: '100%'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    />
  );
}
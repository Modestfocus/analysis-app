import { useEffect, useRef, useState, useCallback } from "react";

interface Point {
  x: number;
  y: number;
}

interface ChartPoint {
  x: number; // Canvas pixel coordinate
  y: number; // Canvas pixel coordinate
  chartX?: number; // Chart time coordinate (percentage 0-1)
  chartY?: number; // Chart price coordinate (percentage 0-1)
}

interface DrawingObject {
  id: string;
  type: 'cursor' | 'trend-line' | 'horizontal-line' | 'vertical-line' | 'ray' | 'rectangle' | 'ellipse' | 'text' | 'note';
  points: ChartPoint[];
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
      if (!canvas || !chartContainer) return;

      // Use the parent container size instead of chart element
      const parentRect = chartContainer.getBoundingClientRect();
      canvas.width = parentRect.width;
      canvas.height = parentRect.height;
      setCanvasBounds(parentRect);
      
      console.log('Canvas sized to:', { width: parentRect.width, height: parentRect.height });
      
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

  const getMousePosition = (e: React.MouseEvent<HTMLDivElement>): ChartPoint => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Convert to chart coordinates (0-1 range)
    const chartX = x / rect.width;
    const chartY = y / rect.height;
    
    const point = { x, y, chartX, chartY };
    console.log('Mouse position:', point, 'Canvas rect:', rect);
    return point;
  };

  // Convert chart coordinates back to canvas pixels
  const chartToCanvas = (chartPoint: ChartPoint): ChartPoint => {
    if (!canvasRef.current) return chartPoint;
    
    const canvas = canvasRef.current;
    return {
      ...chartPoint,
      x: (chartPoint.chartX || 0) * canvas.width,
      y: (chartPoint.chartY || 0) * canvas.height
    };
  };

  const drawShape = (ctx: CanvasRenderingContext2D, drawing: DrawingObject) => {
    ctx.strokeStyle = drawing.style.color;
    ctx.lineWidth = drawing.style.thickness;
    ctx.setLineDash(drawing.style.lineStyle === 'dashed' ? [5, 5] : []);

    // Convert chart coordinates to current canvas coordinates
    const canvasPoints = drawing.points.map(chartToCanvas);

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
        if (canvasPoints.length >= 1 && canvasRef.current) {
          ctx.beginPath();
          ctx.moveTo(0, canvasPoints[0].y);
          ctx.lineTo(canvasRef.current.width, canvasPoints[0].y);
          ctx.stroke();
        }
        break;
        
      case 'vertical-line':
        if (canvasPoints.length >= 1 && canvasRef.current) {
          ctx.beginPath();
          ctx.moveTo(canvasPoints[0].x, 0);
          ctx.lineTo(canvasPoints[0].x, canvasRef.current.height);
          ctx.stroke();
        }
        break;
        
      case 'ray':
        if (canvasPoints.length >= 2 && canvasRef.current) {
          const start = canvasPoints[0];
          const end = canvasPoints[1];
          
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
        if (canvasPoints.length >= 2) {
          const start = canvasPoints[0];
          const end = canvasPoints[1];
          const width = end.x - start.x;
          const height = end.y - start.y;
          
          ctx.beginPath();
          ctx.rect(start.x, start.y, width, height);
          ctx.stroke();
        }
        break;
        
      case 'ellipse':
        if (canvasPoints.length >= 2) {
          const start = canvasPoints[0];
          const end = canvasPoints[1];
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
        if (canvasPoints.length >= 1 && drawing.text) {
          ctx.fillStyle = drawing.style.color;
          ctx.font = '14px Arial';
          ctx.fillText(drawing.text, canvasPoints[0].x, canvasPoints[0].y);
        }
        break;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('Mouse down on canvas, selected tool:', selectedTool);
    if (selectedTool === 'cursor') return;

    // Only prevent default for actual drawing, not chart interaction
    e.preventDefault();
    e.stopPropagation();
    
    const point = getMousePosition(e);
    console.log('Drawing started at:', point);
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
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
      ...currentDrawing,
      points: currentDrawing.type === 'horizontal-line' || currentDrawing.type === 'vertical-line' 
        ? [startPoint] 
        : [startPoint, currentPoint],
      completed: true
    };
    drawShape(ctx, previewDrawing);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
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
    <div 
      className="absolute inset-0 z-30"
      style={{ 
        pointerEvents: selectedTool === 'cursor' ? 'none' : 'auto',
        cursor: selectedTool === 'cursor' ? 'default' : 'crosshair'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{
          backgroundColor: 'transparent',
          cursor: selectedTool === 'cursor' ? 'default' : 'crosshair'
        }}
      />
    </div>
  );
}
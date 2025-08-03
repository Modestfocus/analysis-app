import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, TrendingUp, Plus, Settings } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface SimpleChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  className?: string;
}

const timeframes = [
  { value: '5s', label: '5s' },
  { value: '30s', label: '30s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1H', label: '1H' },
  { value: '4H', label: '4H' },
  { value: '1D', label: '1D' },
];

const symbols = [
  { value: 'NAS100', label: 'NAS100', description: 'NASDAQ 100' },
  { value: 'SPX500', label: 'SPX500', description: 'S&P 500' },
  { value: 'US30', label: 'US30', description: 'Dow Jones' },
  { value: 'EURUSD', label: 'EURUSD', description: 'Euro / US Dollar' },
  { value: 'GBPUSD', label: 'GBPUSD', description: 'British Pound' },
  { value: 'USDJPY', label: 'USDJPY', description: 'US Dollar / Yen' },
  { value: 'XAUUSD', label: 'XAUUSD', description: 'Gold / USD' },
  { value: 'BTCUSD', label: 'BTCUSD', description: 'Bitcoin / USD' },
  { value: 'ETHUSD', label: 'ETHUSD', description: 'Ethereum / USD' },
];

const indicators = [
  { key: 'ema20', label: 'EMA 20', color: '#2196F3', enabled: true },
  { key: 'ema50', label: 'EMA 50', color: '#FF9800', enabled: true },
  { key: 'ema100', label: 'EMA 100', color: '#4CAF50', enabled: true },
  { key: 'ema200', label: 'EMA 200', color: '#F44336', enabled: true },
];

export default function SimpleChart({ symbol, onSymbolChange, className }: SimpleChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTimeframe, setCurrentTimeframe] = useState('1H');
  const [enabledIndicators, setEnabledIndicators] = useState(
    indicators.reduce((acc, ind) => ({ ...acc, [ind.key]: ind.enabled }), {} as Record<string, boolean>)
  );
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [priceChangePercent, setPriceChangePercent] = useState<number | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<any>(null);
  const [chartOffset, setChartOffset] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Generate sample candlestick data
  const generateSampleData = useCallback(() => {
    const basePrices: Record<string, number> = {
      'NAS100': 21000,
      'SPX500': 5800,
      'US30': 45000,
      'EURUSD': 1.0850,
      'GBPUSD': 1.2750,
      'USDJPY': 157.50,
      'XAUUSD': 2750,
      'BTCUSD': 95000,
      'ETHUSD': 3400,
    };

    const basePrice = basePrices[symbol] || 1000;
    const data = [];
    let currentPrice = basePrice;

    for (let i = 0; i < 50; i++) {
      const change = (Math.random() - 0.5) * 0.02 * basePrice;
      currentPrice += change;
      
      const open = currentPrice;
      const volatility = basePrice * 0.005;
      const high = open + Math.random() * volatility;
      const low = open - Math.random() * volatility;
      const close = low + Math.random() * (high - low);
      
      data.push({ open, high, low, close, volume: Math.random() * 1000000 });
      currentPrice = close;
    }

    // Set current price info
    if (data.length > 1) {
      const lastCandle = data[data.length - 1];
      const prevCandle = data[data.length - 2];
      setCurrentPrice(lastCandle.close);
      const change = lastCandle.close - prevCandle.close;
      const changePercent = (change / prevCandle.close) * 100;
      setPriceChange(change);
      setPriceChangePercent(changePercent);
    }

    return data;
  }, [symbol]);

  // Draw the chart with pan and zoom
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = generateSampleData();
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set up chart area with zoom and pan
    const padding = 40;
    const baseChartWidth = width - padding * 2;
    const chartWidth = baseChartWidth * zoomScale;
    const chartHeight = height - padding * 3; // Extra space for volume

    // Find price range
    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // Save context for transformations
    ctx.save();
    ctx.translate(chartOffset, 0);

    // Grid - TradingView style (more subtle)
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Vertical grid lines (fewer lines for cleaner look)
    for (let i = 0; i <= 8; i++) {
      const x = padding + (chartWidth * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    // Draw candlesticks - TradingView style (thinner) with zoom
    const candleWidth = Math.max(1, (chartWidth / data.length) * 0.6); // Adjust for zoom
    data.forEach((candle, index) => {
      const x = padding + (index * chartWidth) / data.length;
      const openY = padding + chartHeight - ((candle.open - minPrice) / priceRange) * chartHeight;
      const closeY = padding + chartHeight - ((candle.close - minPrice) / priceRange) * chartHeight;
      const highY = padding + chartHeight - ((candle.high - minPrice) / priceRange) * chartHeight;
      const lowY = padding + chartHeight - ((candle.low - minPrice) / priceRange) * chartHeight;

      const isGreen = candle.close > candle.open;
      const centerX = x + candleWidth / 2;
      
      // Thin wicks - TradingView style
      ctx.strokeStyle = isGreen ? '#26a69a' : '#ef5350';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();

      // Thinner body - TradingView style
      ctx.fillStyle = isGreen ? '#26a69a' : '#ef5350';
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const bodyY = Math.min(openY, closeY);
      ctx.fillRect(x, bodyY, candleWidth, bodyHeight);
      
      // Outline for hollow candles when needed
      if (bodyHeight > 2) {
        ctx.strokeStyle = isGreen ? '#26a69a' : '#ef5350';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, bodyY, candleWidth, bodyHeight);
      }
    });

    // Draw crosshair if mouse is hovering
    if (mousePosition) {
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePosition.x, padding);
      ctx.lineTo(mousePosition.x, padding + chartHeight);
      ctx.stroke();
      
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(padding, mousePosition.y);
      ctx.lineTo(width - padding, mousePosition.y);
      ctx.stroke();
      
      ctx.setLineDash([]); // Reset line dash
    }

    // Draw EMA lines with zoom
    indicators.forEach((indicator) => {
      if (!enabledIndicators[indicator.key]) return;
      
      const period = parseInt(indicator.key.replace('ema', ''));
      ctx.strokeStyle = indicator.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let ema = data[0].close;
      const multiplier = 2 / (period + 1);
      
      data.forEach((candle, index) => {
        if (index === 0) {
          ema = candle.close;
        } else {
          ema = (candle.close - ema) * multiplier + ema;
        }
        
        const x = padding + (index * chartWidth) / data.length + candleWidth / 2;
        const y = padding + chartHeight - ((ema - minPrice) / priceRange) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    });

    // Restore context
    ctx.restore();

    // Draw volume bars at bottom
    const volumeHeight = 60;
    const volumeArea = height - padding - volumeHeight;
    const maxVolume = Math.max(...data.map(d => d.volume));
    
    data.forEach((candle, index) => {
      const x = padding + (index * chartWidth) / data.length;
      const barHeight = (candle.volume / maxVolume) * volumeHeight;
      const isGreen = candle.close > candle.open;
      
      ctx.fillStyle = isGreen ? '#4CAF5080' : '#F4433680';
      ctx.fillRect(x, volumeArea + volumeHeight - barHeight, candleWidth, barHeight);
    });

    // Price labels - TradingView style
    ctx.fillStyle = '#666';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceRange * (5 - i)) / 5;
      const y = padding + (chartHeight * i) / 5;
      ctx.fillText(price.toFixed(2), width - padding + 8, y + 4);
    }

    // Time labels at bottom
    ctx.fillStyle = '#888';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 8; i++) {
      const x = padding + (chartWidth * i) / 8;
      const timeLabel = `${9 + i}:00`;
      ctx.fillText(timeLabel, x, height - 15);
    }

  }, [symbol, currentTimeframe, enabledIndicators, generateSampleData, chartOffset, zoomScale]);

  // Initialize canvas and draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    drawChart();
  }, [drawChart]);

  // Toggle indicator visibility
  const toggleIndicator = useCallback((indicatorKey: string) => {
    setEnabledIndicators(prev => ({
      ...prev,
      [indicatorKey]: !prev[indicatorKey]
    }));
  }, []);

  // Handle mouse events for crosshair, tooltips, and pan/zoom
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle dragging for pan
    if (isDragging && dragStart) {
      const deltaX = x - dragStart.x;
      setChartOffset(prev => prev + deltaX);
      setDragStart({ x, y });
      return;
    }
    
    setMousePosition({ x, y });
    
    // Find hovered candle (adjusted for offset and zoom)
    const data = generateSampleData();
    const padding = 40;
    const chartWidth = (canvas.width / window.devicePixelRatio - padding * 2) * zoomScale;
    const adjustedX = (x - padding - chartOffset) / zoomScale;
    const candleIndex = Math.floor(adjustedX / (chartWidth / data.length / zoomScale));
    
    if (candleIndex >= 0 && candleIndex < data.length) {
      setHoveredCandle({ ...data[candleIndex], index: candleIndex });
    } else {
      setHoveredCandle(null);
    }
  }, [generateSampleData, isDragging, dragStart, chartOffset, zoomScale]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDragging(true);
    setDragStart({ x, y });
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoomScale(prev => Math.max(0.5, Math.min(3, prev * zoomFactor)));
  }, []);

  return (
    <div className={`flex h-full ${className}`}>
      {/* Main Chart Area - Full Width */}
      <div className="flex-1 flex flex-col">
        {/* TradingView-style Compact Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {/* Symbol Selector - TradingView style */}
            <Select value={symbol} onValueChange={onSymbolChange}>
              <SelectTrigger className="w-20 h-7 bg-white border border-gray-300 rounded text-sm font-medium hover:bg-gray-50">
                <SelectValue />
                <ChevronDown className="h-3 w-3" />
              </SelectTrigger>
              <SelectContent>
                {symbols.map((sym) => (
                  <SelectItem key={sym.value} value={sym.value}>
                    {sym.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Current Price Display - TradingView style */}
            {currentPrice && (
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold text-gray-900">
                  {currentPrice.toFixed(symbol.includes('USD') && !symbol.includes('JPY') ? 2 : 2)}
                </span>
                {priceChange !== null && priceChangePercent !== null && (
                  <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    priceChange >= 0 
                      ? 'bg-green-500 text-white' 
                      : 'bg-red-500 text-white'
                  }`}>
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Timeframe Buttons - Center aligned TradingView style */}
          <div className="flex items-center space-x-0.5">
            {timeframes.map((tf) => (
              <Button
                key={tf.value}
                variant="ghost"
                size="sm"
                onClick={() => setCurrentTimeframe(tf.value)}
                className={`px-2 py-1 h-7 text-xs font-medium rounded ${
                  currentTimeframe === tf.value 
                    ? 'bg-blue-600 text-white hover:bg-blue-700' 
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tf.label}
              </Button>
            ))}
          </div>

          {/* Settings and Indicators */}
          <div className="flex items-center space-x-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Indicators
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Indicators:</h4>
                  {indicators.map((indicator) => (
                    <Button
                      key={indicator.key}
                      variant={enabledIndicators[indicator.key] ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleIndicator(indicator.key)}
                      className="w-full justify-start text-xs h-6"
                      style={{
                        backgroundColor: enabledIndicators[indicator.key] ? indicator.color : undefined,
                        borderColor: indicator.color,
                      }}
                    >
                      {indicator.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Settings className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Chart Canvas with Pan/Zoom - Full Width */}
        <div className="flex-1 relative bg-white">
          <canvas 
            ref={canvasRef} 
            className={`absolute inset-0 w-full h-full ${isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}`}
            style={{ width: '100%', height: '100%' }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onMouseLeave={() => {
              setMousePosition(null);
              setHoveredCandle(null);
              setIsDragging(false);
              setDragStart(null);
            }}
          />
          
          {/* Crosshair Tooltip - TradingView style */}
          {hoveredCandle && mousePosition && (
            <div 
              className="absolute bg-gray-800 text-white text-xs rounded px-2 py-1.5 pointer-events-none z-20 shadow-lg border border-gray-600"
              style={{ 
                left: mousePosition.x + 10, 
                top: mousePosition.y - 40,
                transform: mousePosition.x > 200 ? 'translateX(-100%)' : 'none'
              }}
            >
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <div>O: <span className="font-medium">{hoveredCandle.open.toFixed(2)}</span></div>
                <div>H: <span className="font-medium">{hoveredCandle.high.toFixed(2)}</span></div>
                <div>L: <span className="font-medium">{hoveredCandle.low.toFixed(2)}</span></div>
                <div>C: <span className="font-medium">{hoveredCandle.close.toFixed(2)}</span></div>
              </div>
            </div>
          )}
          
          {/* Zoom/Pan Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
              onClick={() => setZoomScale(prev => Math.min(3, prev * 1.2))}
            >
              +
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
              onClick={() => setZoomScale(prev => Math.max(0.5, prev * 0.8))}
            >
              −
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
              onClick={() => {
                setZoomScale(1);
                setChartOffset(0);
              }}
            >
              ⌂
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
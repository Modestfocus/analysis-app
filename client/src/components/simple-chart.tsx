import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

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
  { value: 'NAS100', label: 'NAS100' },
  { value: 'SPX500', label: 'SPX500' },
  { value: 'US30', label: 'US30' },
  { value: 'EURUSD', label: 'EURUSD' },
  { value: 'GBPUSD', label: 'GBPUSD' },
  { value: 'USDJPY', label: 'USDJPY' },
  { value: 'XAUUSD', label: 'XAUUSD' },
  { value: 'BTCUSD', label: 'BTCUSD' },
  { value: 'ETHUSD', label: 'ETHUSD' },
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

  // Draw the chart
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

    // Set up chart area
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 3; // Extra space for volume

    // Find price range
    const prices = data.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // Grid
    ctx.strokeStyle = '#e1e1e1';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (chartWidth * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    // Draw candlesticks
    const candleWidth = chartWidth / data.length * 0.8;
    data.forEach((candle, index) => {
      const x = padding + (index * chartWidth) / data.length;
      const openY = padding + chartHeight - ((candle.open - minPrice) / priceRange) * chartHeight;
      const closeY = padding + chartHeight - ((candle.close - minPrice) / priceRange) * chartHeight;
      const highY = padding + chartHeight - ((candle.high - minPrice) / priceRange) * chartHeight;
      const lowY = padding + chartHeight - ((candle.low - minPrice) / priceRange) * chartHeight;

      const isGreen = candle.close > candle.open;
      
      // Wick
      ctx.strokeStyle = isGreen ? '#4CAF50' : '#F44336';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + candleWidth / 2, highY);
      ctx.lineTo(x + candleWidth / 2, lowY);
      ctx.stroke();

      // Body
      ctx.fillStyle = isGreen ? '#4CAF50' : '#F44336';
      const bodyHeight = Math.abs(closeY - openY);
      const bodyY = Math.min(openY, closeY);
      ctx.fillRect(x, bodyY, candleWidth, bodyHeight || 1);
    });

    // Draw EMA lines
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

    // Price labels
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + (priceRange * (5 - i)) / 5;
      const y = padding + (chartHeight * i) / 5;
      ctx.fillText(price.toFixed(2), width - padding + 5, y + 4);
    }

  }, [symbol, currentTimeframe, enabledIndicators, generateSampleData]);

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

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          {/* Symbol Selector */}
          <Select value={symbol} onValueChange={onSymbolChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {symbols.map((sym) => (
                <SelectItem key={sym.value} value={sym.value}>
                  {sym.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Current Price Info */}
          {currentPrice && (
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-lg">
                {currentPrice.toFixed(symbol.includes('USD') && !symbol.includes('JPY') ? 4 : 2)}
              </span>
              {priceChange !== null && priceChangePercent !== null && (
                <Badge 
                  variant={priceChange >= 0 ? "default" : "destructive"}
                  className={priceChange >= 0 ? "bg-green-500" : "bg-red-500"}
                >
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Timeframe Buttons */}
          <div className="flex items-center space-x-1">
            {timeframes.map((tf) => (
              <Button
                key={tf.value}
                variant={currentTimeframe === tf.value ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentTimeframe(tf.value)}
                className="px-3 py-1 h-8"
              >
                {tf.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators Bar */}
      <div className="flex items-center space-x-2 p-2 bg-gray-50 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-600">Indicators:</span>
        {indicators.map((indicator) => (
          <Button
            key={indicator.key}
            variant={enabledIndicators[indicator.key] ? "default" : "outline"}
            size="sm"
            onClick={() => toggleIndicator(indicator.key)}
            className="px-2 py-1 h-7 text-xs"
            style={{
              backgroundColor: enabledIndicators[indicator.key] ? indicator.color : undefined,
              borderColor: indicator.color,
            }}
          >
            {indicator.label}
          </Button>
        ))}
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 relative">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full bg-white"
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
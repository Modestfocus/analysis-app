import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface ChartData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface LightweightChartProps {
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

export default function LightweightChart({ symbol, onSymbolChange, className }: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const emaSeriesRef = useRef<Map<string, any>>(new Map());
  
  const [currentTimeframe, setCurrentTimeframe] = useState('1H');
  const [enabledIndicators, setEnabledIndicators] = useState(
    indicators.reduce((acc, ind) => ({ ...acc, [ind.key]: ind.enabled }), {} as Record<string, boolean>)
  );
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [priceChangePercent, setPriceChangePercent] = useState<number | null>(null);

  // Generate sample data for demonstration
  const generateSampleData = useCallback((symbol: string, timeframe: string): ChartData[] => {
    const now = new Date();
    const data: ChartData[] = [];
    const intervals = 100;
    
    // Base price for different symbols
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
    
    let basePrice = basePrices[symbol] || 1000;
    let currentPrice = basePrice;
    
    for (let i = intervals; i >= 0; i--) {
      const timeMs = now.getTime() - (i * 60000); // 1 minute intervals
      const time = new Date(timeMs).toISOString().split('T')[0];
      
      // Random price movement
      const change = (Math.random() - 0.5) * 0.02 * basePrice;
      currentPrice += change;
      
      const open = currentPrice;
      const volatility = basePrice * 0.005;
      const high = open + Math.random() * volatility;
      const low = open - Math.random() * volatility;
      const close = low + Math.random() * (high - low);
      const volume = Math.random() * 1000000;
      
      data.push({
        time,
        open,
        high,
        low,
        close,
        volume,
      });
      
      currentPrice = close;
    }
    
    return data.sort((a, b) => a.time.localeCompare(b.time));
  }, []);

  // Calculate EMA
  const calculateEMA = useCallback((data: ChartData[], period: number) => {
    if (data.length === 0) return [];
    
    const multiplier = 2 / (period + 1);
    const emaData = [];
    let ema = data[0].close;
    
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        ema = data[i].close;
      } else {
        ema = (data[i].close - ema) * multiplier + ema;
      }
      
      emaData.push({
        time: data[i].time,
        value: ema,
      });
    }
    
    return emaData;
  }, []);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#333',
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      grid: {
        vertLines: { color: '#e1e1e1' },
        horzLines: { color: '#e1e1e1' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
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

    // Add candlestick series
    const candlestickSeries = (chart as any).addCandlestickSeries({
      upColor: '#4CAF50',
      downColor: '#F44336',
      borderDownColor: '#F44336',
      borderUpColor: '#4CAF50',
      wickDownColor: '#F44336',
      wickUpColor: '#4CAF50',
    });

    candlestickSeriesRef.current = candlestickSeries;

    // Add volume series
    const volumeSeries = (chart as any).addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    volumeSeriesRef.current = volumeSeries;

    // Add EMA series
    indicators.forEach((indicator) => {
      const emaSeries = (chart as any).addLineSeries({
        color: indicator.color,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      emaSeriesRef.current.set(indicator.key, emaSeries);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update chart data when symbol or timeframe changes
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    const data = generateSampleData(symbol, currentTimeframe);
    
    // Update candlestick data
    candlestickSeriesRef.current.setData(data.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })));

    // Update volume data
    volumeSeriesRef.current.setData(data.map(d => ({
      time: d.time,
      value: d.volume || 0,
      color: d.close >= d.open ? '#4CAF5080' : '#F4433680',
    })));

    // Update EMA data
    indicators.forEach((indicator) => {
      const emaSeries = emaSeriesRef.current.get(indicator.key);
      if (emaSeries && enabledIndicators[indicator.key]) {
        const period = parseInt(indicator.key.replace('ema', ''));
        const emaData = calculateEMA(data, period);
        emaSeries.setData(emaData);
      }
    });

    // Update current price info
    if (data.length > 0) {
      const lastCandle = data[data.length - 1];
      const prevCandle = data[data.length - 2];
      
      setCurrentPrice(lastCandle.close);
      if (prevCandle) {
        const change = lastCandle.close - prevCandle.close;
        const changePercent = (change / prevCandle.close) * 100;
        setPriceChange(change);
        setPriceChangePercent(changePercent);
      }
    }
  }, [symbol, currentTimeframe, enabledIndicators, generateSampleData, calculateEMA]);

  // Toggle indicator visibility
  const toggleIndicator = useCallback((indicatorKey: string) => {
    setEnabledIndicators(prev => {
      const newState = { ...prev, [indicatorKey]: !prev[indicatorKey] };
      
      const emaSeries = emaSeriesRef.current.get(indicatorKey);
      if (emaSeries) {
        emaSeries.applyOptions({
          visible: newState[indicatorKey],
        });
      }
      
      return newState;
    });
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

      {/* Chart Container */}
      <div className="flex-1 relative">
        <div 
          ref={chartContainerRef} 
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}
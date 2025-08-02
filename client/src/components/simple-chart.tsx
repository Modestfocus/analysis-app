import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface SimpleChartProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
}

export default function SimpleChart({ symbol, onSymbolChange }: SimpleChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create a simple canvas-based chart
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = chartContainerRef.current;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Clear container and add canvas
    container.innerHTML = '';
    container.appendChild(canvas);

    // Generate sample price data
    const generateData = () => {
      const data = [];
      const basePrice = 1.2000; // EUR/USD example
      let currentPrice = basePrice;
      
      for (let i = 0; i < 100; i++) {
        const change = (Math.random() - 0.5) * 0.0020; // ±0.2% change
        currentPrice += change;
        data.push(currentPrice);
      }
      return data;
    };

    const data = generateData();
    const padding = 40;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    const minPrice = Math.min(...data);
    const maxPrice = Math.max(...data);
    const priceRange = maxPrice - minPrice;

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = padding + (chartHeight * i) / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (chartWidth * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, canvas.height - padding);
      ctx.stroke();
    }

    // Draw price line
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((price, index) => {
      const x = padding + (chartWidth * index) / (data.length - 1);
      const y = padding + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw price labels
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 5; i++) {
      const price = maxPrice - (priceRange * i) / 5;
      const y = padding + (chartHeight * i) / 5 + 4;
      ctx.fillText(price.toFixed(4), padding - 5, y);
    }

    // Draw symbol and current price
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(symbol, padding, 25);
    
    ctx.fillStyle = '#2196F3';
    ctx.fillText(data[data.length - 1].toFixed(4), padding + 100, 25);

    // Handle resize
    const handleResize = () => {
      if (!chartContainerRef.current) return;
      canvas.width = chartContainerRef.current.clientWidth;
      canvas.height = chartContainerRef.current.clientHeight;
      // Redraw chart with new dimensions
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [symbol]);

  return (
    <div className="h-full flex flex-col">
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span>Simple Chart - {symbol}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSymbolChange('EURUSD')}
                className={symbol === 'EURUSD' ? 'bg-blue-100' : ''}
              >
                EUR/USD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSymbolChange('GBPUSD')}
                className={symbol === 'GBPUSD' ? 'bg-blue-100' : ''}
              >
                GBP/USD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSymbolChange('USDJPY')}
                className={symbol === 'USDJPY' ? 'bg-blue-100' : ''}
              >
                USD/JPY
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-[calc(100%-80px)]">
          <div
            ref={chartContainerRef}
            className="w-full h-full bg-white"
            style={{ minHeight: '400px' }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
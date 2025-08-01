import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useRef } from "react";

export default function ChartsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Create TradingView widget script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": "NASDAQ:US100",
      "interval": "60",
      "timezone": "Etc/UTC",
      "theme": "light",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    // Cleanup function
    return () => {
      if (containerRef.current && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation Header */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Live Charts - NASDAQ US100
              </h1>
            </div>
          </div>
        </div>
      </nav>

      {/* TradingView Chart Container */}
      <div className="p-6">
        <Card className="h-[calc(100vh-140px)]">
          <CardContent className="p-0 h-full">
            <div 
              ref={containerRef}
              className="tradingview-widget-container h-full w-full"
              style={{ height: "100%", width: "100%" }}
            >
              <div className="tradingview-widget-container__widget h-full"></div>
              <div className="tradingview-widget-copyright">
                <a 
                  href="https://www.tradingview.com/" 
                  rel="noopener nofollow" 
                  target="_blank"
                  className="text-xs text-gray-500"
                >
                  Track all markets on TradingView
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, ExternalLink } from "lucide-react";
import { toAbsoluteUrl } from "@/lib/utils";

interface SimilarChart {
  chartId: number;
  filename: string;
  instrument: string;
  session: string;
  similarity: number;
  filePath: string;
  depthMapPath?: string;
  edgeMapPath?: string;
  gradientMapPath?: string;
  comment?: string;
}

interface ChartComparisonProps {
  mainChartId: number;
  mainChartPath?: string;
  similarCharts: SimilarChart[];
}

export default function ChartComparison({ mainChartId, mainChartPath, similarCharts }: ChartComparisonProps) {
  if (!similarCharts || similarCharts.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-sm flex items-center">
          <ImageIcon className="text-purple-600 mr-2 h-4 w-4" />
          Visual Chart Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Main Chart */}
          {mainChartPath && (
            <div className="border-2 border-blue-200 rounded-lg p-3 bg-blue-50">
              <h4 className="text-sm font-medium text-blue-800 mb-2">
                📊 New Chart (Being Analyzed)
              </h4>
              <img 
                src={mainChartPath} 
                alt="Main chart"
                className="w-full h-40 object-cover rounded border"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Similar Charts Grid */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Historical Matches Used for Context:</h4>
            {similarCharts.map((chart, index) => (
              <div key={`similar-chart-${chart.chartId}-${index}`} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-medium text-gray-800">
                    Matched Chart #{index + 1}: {chart.comment ? getOutcomeDescription(chart.comment) : 'Historical Pattern'}
                  </h5>
                  <Badge className="text-xs bg-purple-100 text-purple-800">
                    {Math.round(chart.similarity * 100)}% similar
                  </Badge>
                </div>
                
                {/* Chart Image */}
                {chart.filePath && (
                  <div className="mb-3">
                    <img 
                      src={chart.filePath} 
                      alt={`Chart ${chart.filename}`}
                      className="w-full h-32 object-cover rounded border"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{chart.instrument}</span>
                    <span className="text-gray-600">{chart.session || 'Unknown'} Session</span>
                  </div>
                  
                  {chart.comment && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                      <p className="text-xs text-yellow-800 font-medium">
                        📈 Historical Outcome: {chart.comment}
                      </p>
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500">{chart.filename}</p>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs h-6 px-2 flex-1"
                    onClick={() => window.open(`/debug/chart/${chart.chartId}/preview`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Full View
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs h-6 px-2 flex-1"
                    disabled={!chart.depthMapPath}
                    onClick={() => chart.depthMapPath && window.open(toAbsoluteUrl(chart.depthMapPath), '_blank')}
                  >
                    Depth
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs h-6 px-2 flex-1"
                    disabled={!chart.edgeMapPath}
                    onClick={() => chart.edgeMapPath && window.open(toAbsoluteUrl(chart.edgeMapPath), '_blank')}
                  >
                    Edge
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="text-xs h-6 px-2 flex-1"
                    disabled={!chart.gradientMapPath}
                    onClick={() => chart.gradientMapPath && window.open(toAbsoluteUrl(chart.gradientMapPath), '_blank')}
                  >
                    Gradient
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getOutcomeDescription(comment: string): string {
  const lowerComment = comment.toLowerCase();
  
  if (lowerComment.includes('bullish') || lowerComment.includes('breakout')) {
    return 'Bullish Breakout';
  } else if (lowerComment.includes('bearish') || lowerComment.includes('breakdown')) {
    return 'Bearish Breakdown';
  } else if (lowerComment.includes('range') || lowerComment.includes('sideways')) {
    return 'Rangebound Movement';
  } else if (lowerComment.includes('reversal')) {
    return 'Trend Reversal';
  }
  
  return comment.slice(0, 30) + (comment.length > 30 ? '...' : '');
}
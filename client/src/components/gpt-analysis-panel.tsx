import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, Search, TrendingUp, Layers, Lightbulb, Shield } from "lucide-react";

interface AnalysisResults {
  analysis: {
    technical: {
      trend: string;
      supportResistance: string;
      volume: string;
      patterns: string[];
    };
    depth: {
      patternDepth: string;
      signalStrength: string;
    };
    insights: {
      setup: string;
      entry: string;
      riskManagement: string;
    };
    confidence: number;
  };
  similarCharts: Array<{
    id: number;
    name: string;
    timeframe: string;
    similarity: number;
  }>;
}

interface GPTAnalysisPanelProps {
  analysisResults: AnalysisResults | null;
}

export default function GPTAnalysisPanel({ analysisResults }: GPTAnalysisPanelProps) {
  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Bot className="text-primary-500 mr-2 h-5 w-5" />
          GPT-4o Chart Analysis
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!analysisResults ? (
          <div className="text-center py-12">
            <Bot className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No chart uploaded yet.</p>
            <p className="text-sm text-gray-400">Your analysis will appear here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Similar Charts */}
            {analysisResults.similarCharts && analysisResults.similarCharts.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-blue-900 flex items-center">
                    <Search className="mr-2 h-4 w-4" />
                    Similar Charts Found
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {analysisResults.similarCharts.map((chart, index) => (
                      <div key={index} className="flex items-center justify-between bg-white rounded p-2 text-sm">
                        <span className="text-gray-700">
                          {chart.name} - {chart.timeframe}
                        </span>
                        <Badge variant="secondary" className="text-blue-600 bg-blue-100">
                          {chart.similarity}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Technical Analysis */}
            {analysisResults.analysis?.technical && (
              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-green-900 flex items-center">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Technical Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm text-green-800 space-y-2">
                    <div>
                      <strong>Trend:</strong> {analysisResults.analysis.technical.trend}
                    </div>
                    <div>
                      <strong>Support/Resistance:</strong> {analysisResults.analysis.technical.supportResistance}
                    </div>
                    <div>
                      <strong>Volume:</strong> {analysisResults.analysis.technical.volume}
                    </div>
                    {analysisResults.analysis.technical.patterns && analysisResults.analysis.technical.patterns.length > 0 && (
                      <div>
                        <strong>Patterns:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analysisResults.analysis.technical.patterns.map((pattern, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {pattern}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Depth Analysis */}
            {analysisResults.analysis?.depth && (
              <Card className="bg-purple-50 border-purple-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-purple-900 flex items-center">
                    <Layers className="mr-2 h-4 w-4" />
                    Depth Map Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm text-purple-800 space-y-2">
                    <div>
                      <strong>Pattern Depth:</strong> {analysisResults.analysis.depth.patternDepth}
                    </div>
                    <div>
                      <strong>Signal Strength:</strong> {analysisResults.analysis.depth.signalStrength}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trading Insights */}
            {analysisResults.analysis?.insights && (
              <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-amber-900 flex items-center">
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Trading Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm text-amber-800 space-y-2">
                    <div>
                      <strong>Setup:</strong> {analysisResults.analysis.insights.setup}
                    </div>
                    <div>
                      <strong>Entry:</strong> {analysisResults.analysis.insights.entry}
                    </div>
                    <div>
                      <strong>Risk Management:</strong> {analysisResults.analysis.insights.riskManagement}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Confidence Score */}
            {analysisResults.analysis?.confidence !== undefined && (
              <Card className="bg-gray-50 border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-gray-900 flex items-center">
                    <Shield className="mr-2 h-4 w-4" />
                    Analysis Confidence
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Progress 
                        value={analysisResults.analysis.confidence * 100} 
                        className="flex-1 h-2"
                      />
                      <span className="text-sm font-semibold text-gray-700">
                        {Math.round(analysisResults.analysis.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Based on pattern recognition, historical similarity, and technical indicators.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

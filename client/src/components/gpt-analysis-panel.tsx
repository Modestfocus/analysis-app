import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Bot, Search, TrendingUp, Layers, Lightbulb, Shield, RotateCcw, FileText, Clock, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

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

interface AnalysisSession {
  id: string;
  timestamp: Date;
  instrument: string;
  summary: string;
  chartImageUrl: string;
  depthMapUrl?: string;
  edgeMapUrl?: string;
  gradientMapUrl?: string;
  vectorMatches?: any;
  gptResponse: string;
  systemPrompt: string;
}

interface PromptHistoryItem {
  id: string;
  timestamp: Date;
  promptType: 'default' | 'custom' | 'injected';
  promptContent: string;
  previewText: string;
}

// Three-state toggle system
type PanelMode = 'analysis' | 'history' | 'prompts';

interface GPTAnalysisPanelProps {
  analysisResults: AnalysisResults | null;
}

export default function GPTAnalysisPanel({ analysisResults }: GPTAnalysisPanelProps) {
  const [panelMode, setPanelMode] = useState<PanelMode>('analysis');

  // Fetch analysis history
  const { data: analysisHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/analysis-history'],
    enabled: panelMode === 'history',
  });

  // Fetch prompt history
  const { data: promptHistory, isLoading: promptsLoading } = useQuery({
    queryKey: ['/api/prompt-history'],
    enabled: panelMode === 'prompts',
  });

  // Toggle to next panel mode (analysis → history → prompts → analysis)
  const togglePanelMode = () => {
    if (panelMode === 'analysis') {
      setPanelMode('history');
    } else if (panelMode === 'history') {
      setPanelMode('prompts');
    } else {
      setPanelMode('analysis');
    }
  };

  // Render header with toggle controls
  const renderHeader = () => {
    const getHeaderTitle = () => {
      switch (panelMode) {
        case 'history': return 'Chart Analysis History';
        case 'prompts': return 'Prompt History';
        default: return 'GPT-4o Chart Analysis';
      }
    };

    const getHeaderIcon = () => {
      switch (panelMode) {
        case 'history': return <Clock className="text-blue-500 mr-2 h-5 w-5" />;
        case 'prompts': return <FileText className="text-green-500 mr-2 h-5 w-5" />;
        default: return <Bot className="text-primary-500 mr-2 h-5 w-5" />;
      }
    };

    return (
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            {getHeaderIcon()}
            {getHeaderTitle()}
          </h3>
          
          {/* Toggle Controls */}
          <div className="flex items-center space-x-2">
            {panelMode !== 'analysis' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPanelMode('analysis')}
                className="p-1 h-8 w-8"
                title="Back to Analysis"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePanelMode}
              className="p-1 h-8 w-8"
              title="Toggle View"
            >
              {panelMode === 'analysis' ? (
                <RotateCcw className="h-4 w-4 text-blue-500" />
              ) : panelMode === 'history' ? (
                <FileText className="h-4 w-4 text-green-500" />
              ) : (
                <Bot className="h-4 w-4 text-primary-500" />
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {renderHeader()}

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {panelMode === 'analysis' && renderAnalysisContent()}
        {panelMode === 'history' && renderHistoryContent()}
        {panelMode === 'prompts' && renderPromptsContent()}
      </div>
    </div>
  );

  // Render analysis content (original functionality)  
  function renderAnalysisContent() {
    if (!analysisResults) {
      return (
        <div className="text-center py-12">
          <Bot className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No chart uploaded yet.</p>
          <p className="text-sm text-gray-400">Your analysis will appear here.</p>
        </div>
      );
    }

    return (
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
    );
  }

  // Render history content (past analysis sessions)
  function renderHistoryContent() {
    if (historyLoading) {
      return (
        <div className="text-center py-12">
          <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-spin" />
          <p className="text-gray-500 mb-2">Loading analysis history...</p>
        </div>
      );
    }

    const sessions = (analysisHistory as any)?.sessions || [];

    if (sessions.length === 0) {
      return (
        <div className="text-center py-12">
          <Clock className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No analysis history yet.</p>
          <p className="text-sm text-gray-400">Your past sessions will appear here.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sessions.map((session: AnalysisSession) => (
          <Card key={session.id} className="bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-blue-900 flex items-center justify-between">
                <div className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  {session.instrument}
                </div>
                <Badge variant="secondary" className="text-xs">
                  {new Date(session.timestamp).toLocaleDateString()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <p className="text-sm text-blue-800">{session.summary}</p>
                {session.chartImageUrl && (
                  <div className="mt-2">
                    <img 
                      src={session.chartImageUrl} 
                      alt="Chart analysis" 
                      className="w-full h-20 object-cover rounded border"
                    />
                  </div>
                )}
                <div className="flex justify-between items-center text-xs text-blue-600 mt-2">
                  <span>{new Date(session.timestamp).toLocaleTimeString()}</span>
                  <Button variant="ghost" size="sm" className="text-xs p-1 h-6">
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Render prompts content (historical prompts)
  function renderPromptsContent() {
    if (promptsLoading) {
      return (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4 animate-spin" />
          <p className="text-gray-500 mb-2">Loading prompt history...</p>
        </div>
      );
    }

    const prompts = (promptHistory as any)?.prompts || [];

    if (prompts.length === 0) {
      return (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No prompt history yet.</p>
          <p className="text-sm text-gray-400">Your custom prompts will appear here.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {prompts.map((prompt: PromptHistoryItem) => (
          <Card key={prompt.id} className="bg-green-50 border-green-200 hover:bg-green-100 transition-colors cursor-pointer">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-green-900 flex items-center justify-between">
                <div className="flex items-center">
                  <FileText className="mr-2 h-4 w-4" />
                  {prompt.promptType.charAt(0).toUpperCase() + prompt.promptType.slice(1)} Prompt
                </div>
                <Badge variant="secondary" className="text-xs">
                  {new Date(prompt.timestamp).toLocaleDateString()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                <p className="text-sm text-green-800">{prompt.previewText}</p>
                <div className="flex justify-between items-center text-xs text-green-600 mt-2">
                  <span>{new Date(prompt.timestamp).toLocaleTimeString()}</span>
                  <Button variant="ghost" size="sm" className="text-xs p-1 h-6">
                    View Full Prompt
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
}

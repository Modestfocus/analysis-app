import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { TrendingUp, Clock, Target, BarChart3, AlertCircle, CheckCircle2, Link as LinkIcon } from "lucide-react";

interface ChartPrediction {
  prediction: string;
  session: string;
  confidence: "Low" | "Medium" | "High";
  reasoning: string;
}

interface SimilarChart {
  chartId: number;
  filename: string;
  instrument: string;
  session: string;
  similarity: number;
  filePath: string;
  depthMapUrl?: string;
  comment?: string;
}

interface AnalysisData {
  success: boolean;
  chartId: number;
  prediction: ChartPrediction;
  similarCharts: SimilarChart[];
  analysisId: number;
}

interface AnalysisPanelProps {
  analysisData: AnalysisData | null;
  isLoading: boolean;
}

export default function AnalysisPanel({ analysisData, isLoading }: AnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              Analyzing Chart...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Running RAG analysis with GPT-4o...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="text-blue-600 mr-2 h-5 w-5" />
              Analysis Panel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Upload a chart to see GPT-4o analysis with RAG similarity matching.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { prediction, similarCharts } = analysisData;

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'High': return 'bg-green-100 text-green-800 border-green-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    switch (confidence) {
      case 'High': return <CheckCircle2 className="h-4 w-4" />;
      case 'Medium': return <AlertCircle className="h-4 w-4" />;
      case 'Low': return <AlertCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="text-blue-600 mr-2 h-5 w-5" />
            GPT-4o Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Prediction */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <TrendingUp className="h-4 w-4 mr-1" />
              Market Prediction
            </h4>
            <p className="text-sm font-semibold text-gray-900">{prediction.prediction}</p>
          </div>

          {/* Session */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              Expected Session
            </h4>
            <Badge variant="outline" className="text-sm">
              {prediction.session}
            </Badge>
          </div>

          {/* Confidence */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <Target className="h-4 w-4 mr-1" />
              Confidence Level
            </h4>
            <Badge className={`text-sm flex items-center gap-1 ${getConfidenceColor(prediction.confidence)}`}>
              {getConfidenceIcon(prediction.confidence)}
              {prediction.confidence}
            </Badge>
          </div>

          <Separator />

          {/* Reasoning */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Analysis Reasoning</h4>
            <p className="text-xs text-gray-600 leading-relaxed">{prediction.reasoning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Similar Charts */}
      {similarCharts && similarCharts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center">
              <LinkIcon className="text-purple-600 mr-2 h-4 w-4" />
              Similar Historical Charts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {similarCharts.map((chart, index) => (
              <div key={chart.chartId} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">
                    {chart.instrument} | {chart.session || 'Unknown'}
                  </Badge>
                  <Badge className="text-xs bg-purple-100 text-purple-800">
                    {Math.round(chart.similarity * 100)}% match
                  </Badge>
                </div>
                
                <p className="text-xs text-gray-600 mb-2">{chart.filename}</p>
                
                {chart.comment && (
                  <p className="text-xs text-gray-700 italic">
                    Previous outcome: {chart.comment}
                  </p>
                )}

                <div className="flex gap-2 mt-2">
                  {chart.filePath && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2"
                      onClick={() => window.open(chart.filePath, '_blank')}
                    >
                      View Chart
                    </Button>
                  )}
                  {chart.depthMapUrl && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2"
                      onClick={() => window.open(chart.depthMapUrl, '_blank')}
                    >
                      Depth Map
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
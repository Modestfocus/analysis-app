import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Target, 
  BarChart3, 
  Copy, 
  CheckCircle,
  AlertCircle,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BundleAnalysisData {
  instrument: string;
  prediction: string;
  session: string;
  confidence: string;
  rationale: string;
  charts: Array<{
    id: number;
    timeframe: string;
    originalName: string;
    instrument: string;
  }>;
  chartCount: number;
}

interface BundleAnalysisPanelProps {
  analysisData: BundleAnalysisData;
  onClose?: () => void;
}

export default function BundleAnalysisPanel({ analysisData, onClose }: BundleAnalysisPanelProps) {
  const { toast } = useToast();

  const handleCopyAnalysis = () => {
    const fullAnalysis = `
${analysisData.instrument} Multi-Timeframe Analysis

Prediction: ${analysisData.prediction}
Session: ${analysisData.session}
Confidence: ${analysisData.confidence}

Charts Analyzed:
${analysisData.charts.map(chart => `- ${chart.timeframe}: ${chart.originalName}`).join('\n')}

Analysis:
${analysisData.rationale}
    `.trim();

    navigator.clipboard.writeText(fullAnalysis).then(() => {
      toast({
        title: "Analysis Copied",
        description: "Bundle analysis has been copied to clipboard.",
      });
    });
  };

  const getPredictionIcon = (prediction: string) => {
    const predictionLower = prediction.toLowerCase();
    if (predictionLower.includes('bullish') || predictionLower.includes('buy')) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (predictionLower.includes('bearish') || predictionLower.includes('sell')) {
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    }
    return <Activity className="h-4 w-4 text-blue-500" />;
  };

  const getConfidenceBadge = (confidence: string) => {
    const confidenceLower = confidence?.toLowerCase?.() || '';
    const variant = confidenceLower === 'high' ? 'default' : 
                   confidenceLower === 'medium' ? 'secondary' : 'outline';
    const icon = confidenceLower === 'high' ? CheckCircle : 
                 confidenceLower === 'medium' ? AlertCircle : AlertCircle;
    const IconComponent = icon;
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <IconComponent className="h-3 w-3" />
        {confidence} Confidence
      </Badge>
    );
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Multi-Timeframe Bundle Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyAnalysis}>
              <Copy className="h-3 w-3 mr-2" />
              Copy Analysis
            </Button>
            {onClose && (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Prediction Summary */}
        <div className="rounded-lg border p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
              {analysisData.instrument} Analysis Summary
            </h3>
            {getConfidenceBadge(analysisData.confidence)}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              {getPredictionIcon(analysisData.prediction)}
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Prediction</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {analysisData.prediction}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Target Session</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {analysisData.session}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Charts Analyzed</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {analysisData.chartCount} Timeframes
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Overview */}
        <div>
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analyzed Timeframes
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysisData.charts
              .sort((a, b) => {
                const order = { '5M': 1, '15M': 2, '1H': 3, '4H': 4, 'Daily': 5 };
                return (order[a.timeframe as keyof typeof order] || 99) - 
                       (order[b.timeframe as keyof typeof order] || 99);
              })
              .map((chart, index) => (
                <Badge key={chart.id} variant="outline" className="text-xs">
                  {chart.timeframe}
                </Badge>
              ))}
          </div>
        </div>

        <Separator />

        {/* Detailed Analysis */}
        <div>
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
            Detailed Multi-Timeframe Analysis
          </h4>
          <div className="prose prose-sm max-w-none">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <pre className="whitespace-pre-wrap text-sm dark:text-gray-300 font-mono leading-relaxed text-[#ffffff]">
                {analysisData.rationale}
              </pre>
            </div>
          </div>
        </div>

        {/* Analysis Metadata */}
        <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t">
          <p>
            Analysis generated for {analysisData.instrument} using {analysisData.chartCount} timeframe charts
            • Powered by GPT-4o with multi-timeframe context
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { TrendingUp, Clock, Target, BarChart3, AlertCircle, CheckCircle2, RefreshCw, Info, MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface AnalysisResult {
  prediction: string;
  session: string;
  confidence: "Low" | "Medium" | "High";
  reasoning: string;
  // Legacy support
  direction?: string;
  rationale?: string;
  // Optional fields
  similarCharts?: Array<{
    chartId?: number;
    filename?: string;
    instrument?: string;
    timeframe?: string;
    similarity?: number;
    id?: number;
    name?: string;
  }>;
  diagnostics?: {
    mapsSkipped?: string[];
    ragUnavailable?: boolean;
    resourceLimitations?: string;
  };
}

interface AnalysisResultRendererProps {
  result: AnalysisResult;
  isLoading?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  title?: string;
  compact?: boolean;
  showSimilarCharts?: boolean;
  className?: string;
}

export default function AnalysisResultRenderer({ 
  result, 
  isLoading = false,
  onRegenerate,
  isRegenerating = false,
  title = "Analysis Result",
  compact = false,
  showSimilarCharts = true,
  className = ""
}: AnalysisResultRendererProps) {
  
  // Normalize the result to handle both old and new formats
  const normalizedResult = {
    prediction: result.prediction || result.direction || "Unknown",
    session: result.session || "Unknown",
    confidence: (result.confidence || "Medium").toString(),
    reasoning: result.reasoning || result.rationale || "No reasoning provided",
    similarCharts: result.similarCharts || [],
    diagnostics: result.diagnostics
  };

  const getConfidenceColor = (confidence: string | number) => {
    const confidenceStr = typeof confidence === 'string' ? confidence.toLowerCase() : confidence.toString().toLowerCase();
    switch (confidenceStr) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
      case 'low': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
      default: return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600';
    }
  };

  const getConfidenceIcon = (confidence: string | number) => {
    const confidenceStr = typeof confidence === 'string' ? confidence.toLowerCase() : confidence.toString().toLowerCase();
    switch (confidenceStr) {
      case 'high': return <CheckCircle2 className="h-4 w-4" />;
      case 'medium': return <AlertCircle className="h-4 w-4" />;
      case 'low': return <AlertCircle className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getPredictionColor = (prediction: string) => {
    const pred = prediction.toLowerCase();
    if (pred.includes('up') || pred.includes('bull')) return 'text-green-600 dark:text-green-400';
    if (pred.includes('down') || pred.includes('bear')) return 'text-red-600 dark:text-red-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  const getSessionIcon = (session: string) => {
    switch (session.toLowerCase()) {
      case 'asia': return '🌅';
      case 'london': return '🏛️';
      case 'new york': case 'ny': return '🗽';
      case 'sydney': return '🏖️';
      default: return '🌐';
    }
  };

  if (isLoading) {
    return (
      <Card className={`${className}`}>
        <CardHeader>
          <CardTitle className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Analyzing...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Running analysis with visual processing maps...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <BarChart3 className="text-blue-600 mr-2 h-5 w-5" />
            {title}
          </div>
          <div className="flex items-center gap-2">
            {/* Diagnostics indicator */}
            {normalizedResult.diagnostics && (
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-orange-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">
                    {normalizedResult.diagnostics.mapsSkipped && (
                      <p>Maps skipped: {normalizedResult.diagnostics.mapsSkipped.join(', ')}</p>
                    )}
                    {normalizedResult.diagnostics.ragUnavailable && (
                      <p>RAG context unavailable</p>
                    )}
                    {normalizedResult.diagnostics.resourceLimitations && (
                      <p>{normalizedResult.diagnostics.resourceLimitations}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            
            {onRegenerate && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="gap-1"
              >
                {isRegenerating ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-current" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {isRegenerating ? 'Analyzing...' : 'Regenerate'}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Prediction</div>
            <div className={`font-semibold ${getPredictionColor(normalizedResult.prediction)}`}>
              {normalizedResult.prediction}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Session</div>
            <div className="font-medium flex items-center justify-center gap-1">
              <span>{getSessionIcon(normalizedResult.session)}</span>
              <span>{normalizedResult.session}</span>
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Confidence</div>
            <Badge className={`${getConfidenceColor(normalizedResult.confidence)} gap-1`}>
              {getConfidenceIcon(normalizedResult.confidence)}
              {normalizedResult.confidence}
            </Badge>
          </div>
        </div>

        {!compact && (
          <>
            <Separator />
            
            {/* Analysis Reasoning */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Technical Analysis</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{normalizedResult.reasoning}</p>
            </div>

            {/* Similar Charts */}
            {showSimilarCharts && normalizedResult.similarCharts && normalizedResult.similarCharts.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Historical Context ({normalizedResult.similarCharts.length})
                  </h4>
                  <div className="space-y-2">
                    {normalizedResult.similarCharts.slice(0, 3).map((chart, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {chart.filename || chart.name || `Chart #${chart.chartId || chart.id || index + 1}`}
                          </div>
                          {chart.instrument && chart.timeframe && (
                            <div className="text-xs text-muted-foreground">
                              {chart.instrument} • {chart.timeframe}
                            </div>
                          )}
                        </div>
                        {chart.similarity && (
                          <Badge variant="outline" className="text-xs">
                            {Math.round(chart.similarity * 100)}% match
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
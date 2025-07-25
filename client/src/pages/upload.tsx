import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChartLine, Upload, Eye, Bolt, CloudUpload, ChartBar } from "lucide-react";
import TimeframeSelector from "@/components/timeframe-selector";
import DragDropZone from "@/components/drag-drop-zone";
import InstrumentSelector from "@/components/instrument-selector";
import AnalysisPanel from "@/components/analysis-panel";
import type { Timeframe, Session } from "@shared/schema";

export default function UploadPage() {
  const [location, setLocation] = useLocation();
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("5M");
  const [selectedInstrument, setSelectedInstrument] = useState<string>("auto");
  const [selectedSession, setSelectedSession] = useState<Session | undefined>(undefined);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [currentChartId, setCurrentChartId] = useState<number | null>(null);
  const { toast } = useToast();

  const analyzeChartsMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      
      // Add all files to FormData with correct field name
      Array.from(files).forEach((file) => {
        formData.append('charts', file);
      });
      
      formData.append('timeframe', selectedTimeframe);
      if (selectedInstrument && selectedInstrument !== "auto") {
        formData.append('instrument', selectedInstrument);
      }
      if (selectedSession) {
        formData.append('session', selectedSession);
      }

      // Upload charts with automatic CLIP embedding
      const uploadResponse = await apiRequest('POST', '/api/upload', formData);
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error('Upload failed');
      }

      // For analysis, use the first uploaded chart
      const firstChart = uploadData.charts[0];
      
      // Generate depth map for first chart
      await apiRequest('POST', '/api/depth', { chartId: firstChart.id });

      // Analyze first chart using new RAG endpoint
      const analysisResponse = await apiRequest('POST', `/api/analyze/${firstChart.id}`);
      const analysisData = await analysisResponse.json();
      
      return {
        ...analysisData,
        uploadedCount: uploadData.charts.length,
        uploadMessage: uploadData.message,
        mainChartPath: `/uploads/${firstChart.filename}`
      };
    },
    onSuccess: (data) => {
      setAnalysisResults(data);
      setCurrentChartId(data.chartId);
      toast({
        title: "Analysis Complete", 
        description: data.uploadMessage || `${data.uploadedCount || 1} chart(s) uploaded and analyzed successfully.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const quickAnalysisMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      formData.append('chart', files[0]);
      formData.append('quickAnalysis', 'true');

      const response = await apiRequest('POST', '/api/analyze', formData);
      return response.json();
    },
    onSuccess: (data) => {
      setAnalysisResults(data);
      toast({
        title: "Quick Analysis Complete",
        description: "Chart analysis completed (not saved).",
      });
    },
    onError: (error) => {
      toast({
        title: "Quick Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Regenerate analysis mutation
  const regenerateAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (!currentChartId) throw new Error('No chart selected for regeneration');
      
      const response = await apiRequest('POST', `/api/analyze/${currentChartId}`);
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResults(data);
      toast({
        title: "Analysis Regenerated", 
        description: "New analysis completed with updated insights.",
      });
    },
    onError: (error) => {
      toast({
        title: "Regeneration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRegenerateAnalysis = () => {
    regenerateAnalysisMutation.mutate();
  };

  const handleAnalyzeCharts = (files: FileList) => {
    if (files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one chart image to analyze.",
        variant: "destructive",
      });
      return;
    }
    analyzeChartsMutation.mutate(files);
  };

  const handleQuickAnalysis = (files: FileList) => {
    if (files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one chart image for quick analysis.",
        variant: "destructive",
      });
      return;
    }
    quickAnalysisMutation.mutate(files);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left Panel */}
      <div className="flex-1 flex flex-col">
        {/* Navigation */}
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <ChartLine className="text-primary-500 mr-2 h-6 w-6" />
                Chart Analysis Pro
              </h1>
              <div className="flex space-x-1">
                <Button 
                  variant={location === "/" || location === "/upload" ? "default" : "secondary"}
                  size="sm"
                  asChild
                >
                  <Link href="/upload">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Link>
                </Button>
                <Button 
                  variant={location === "/dashboard" ? "default" : "secondary"}
                  size="sm"
                  asChild
                >
                  <Link href="/dashboard">
                    <ChartBar className="mr-2 h-4 w-4" />
                    Dashboard
                  </Link>
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <Eye className="mr-2 h-4 w-4" />
                View Dashboard
              </Link>
            </Button>
          </div>
        </nav>

        {/* Upload Content */}
        <div className="flex-1 p-6">
          {/* Upload Chart Set */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CloudUpload className="text-primary-500 mr-2 h-5 w-5" />
                Upload Chart Set
              </h2>
              
              <TimeframeSelector
                selectedTimeframe={selectedTimeframe}
                onTimeframeSelect={setSelectedTimeframe}
              />

              <InstrumentSelector
                selectedInstrument={selectedInstrument}
                selectedSession={selectedSession}
                onInstrumentChange={setSelectedInstrument}
                onSessionChange={setSelectedSession}
              />

              <DragDropZone
                onFilesSelected={handleAnalyzeCharts}
                className="mb-6"
                isLoading={analyzeChartsMutation.isPending}
                multiple={true}
                placeholder="Drop multiple chart images here for the same instrument"
              />

              <Button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) handleAnalyzeCharts(files);
                  };
                  input.click();
                }}
                className="w-full bg-primary-500 hover:bg-primary-600"
                disabled={analyzeChartsMutation.isPending}
              >
                {analyzeChartsMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <ChartLine className="mr-2 h-4 w-4" />
                    Analyze Charts
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick Analysis */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Bolt className="text-amber-500 mr-2 h-5 w-5" />
                Quick Chart Analysis (Not Saved)
              </h2>
              
              <DragDropZone
                onFilesSelected={handleQuickAnalysis}
                className="mb-6 hover:border-amber-400"
                isLoading={quickAnalysisMutation.isPending}
                placeholder="Paste or Drag & Drop chart image(s) here"
                multiple={false}
              />

              <Button 
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.multiple = true;
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) handleQuickAnalysis(files);
                  };
                  input.click();
                }}
                className="w-full bg-amber-500 hover:bg-amber-600"
                disabled={quickAnalysisMutation.isPending}
              >
                {quickAnalysisMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Bolt className="mr-2 h-4 w-4" />
                    Run Quick Analysis
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Panel - RAG Analysis */}
      <AnalysisPanel 
        analysisData={analysisResults} 
        isLoading={analyzeChartsMutation.isPending}
        onRegenerateAnalysis={handleRegenerateAnalysis}
        isRegenerating={regenerateAnalysisMutation.isPending}
      />
    </div>
  );
}

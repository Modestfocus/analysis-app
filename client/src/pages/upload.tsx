import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChartLine, Upload, Eye, Bolt, CloudUpload, ChartBar, Save } from "lucide-react";
import TimeframeSelector from "@/components/timeframe-selector";
import DragDropZone from "@/components/drag-drop-zone";
import InstrumentSelector from "@/components/instrument-selector";
import AnalysisPanel from "@/components/analysis-panel";
import type { Timeframe, Session } from "@shared/schema";

export default function UploadPage() {
  const [location, setLocation] = useLocation();
  const [selectedInstrument, setSelectedInstrument] = useState<string>("auto");
  const [selectedSession, setSelectedSession] = useState<Session | undefined>(undefined);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [currentChartId, setCurrentChartId] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileTimeframes, setFileTimeframes] = useState<Record<string, Timeframe>>({});
  const [quickAnalysisFiles, setQuickAnalysisFiles] = useState<File[]>([]);
  const [quickAnalysisTimeframes, setQuickAnalysisTimeframes] = useState<Record<string, Timeframe>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper functions for file timeframe management
  const updateFileTimeframe = (fileName: string, timeframe: Timeframe) => {
    setFileTimeframes(prev => ({
      ...prev,
      [fileName]: timeframe
    }));
  };

  const handleFilesSelected = (files: File[]) => {
    // Add new files to existing files instead of replacing
    setSelectedFiles(prev => {
      const existingNames = prev.map(f => f.name);
      const newFiles = files.filter(file => !existingNames.includes(file.name));
      return [...prev, ...newFiles];
    });
    
    // Initialize timeframes for new files with default value
    const newTimeframes = { ...fileTimeframes };
    files.forEach(file => {
      if (!newTimeframes[file.name]) {
        newTimeframes[file.name] = "5M";
      }
    });
    setFileTimeframes(newTimeframes);
  };

  const handleRemoveFile = (index: number) => {
    const fileToRemove = selectedFiles[index];
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    
    // Remove timeframe for the removed file
    const newTimeframes = { ...fileTimeframes };
    delete newTimeframes[fileToRemove.name];
    setFileTimeframes(newTimeframes);
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
    setFileTimeframes({});
  };

  const handleSaveChartsOnly = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one chart image to save.",
        variant: "destructive",
      });
      return;
    }
    saveChartsOnlyMutation.mutate(selectedFiles);
  };

  const handleSubmitBatch = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one chart image to analyze.",
        variant: "destructive",
      });
      return;
    }
    analyzeUploadedChartsMutation.mutate(selectedFiles);
  };

  const handleQuickAnalysisFiles = (files: FileList) => {
    // Add new files to quick analysis instead of replacing
    setQuickAnalysisFiles(prev => {
      const existingNames = prev.map(f => f.name);
      const newFiles = Array.from(files).filter(file => !existingNames.includes(file.name));
      return [...prev, ...newFiles];
    });
    
    // Initialize timeframes for new files
    const newTimeframes = { ...quickAnalysisTimeframes };
    Array.from(files).forEach(file => {
      if (!newTimeframes[file.name]) {
        newTimeframes[file.name] = "5M";
      }
    });
    setQuickAnalysisTimeframes(newTimeframes);
  };

  const updateQuickAnalysisTimeframe = (fileName: string, timeframe: Timeframe) => {
    setQuickAnalysisTimeframes(prev => ({
      ...prev,
      [fileName]: timeframe
    }));
  };

  const removeQuickAnalysisFile = (index: number) => {
    const fileToRemove = quickAnalysisFiles[index];
    setQuickAnalysisFiles(prev => prev.filter((_, i) => i !== index));
    
    const newTimeframes = { ...quickAnalysisTimeframes };
    delete newTimeframes[fileToRemove.name];
    setQuickAnalysisTimeframes(newTimeframes);
  };

  const clearQuickAnalysisFiles = () => {
    setQuickAnalysisFiles([]);
    setQuickAnalysisTimeframes({});
  };

  const runQuickAnalysis = () => {
    if (quickAnalysisFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please add at least one chart image for quick analysis.",
        variant: "destructive",
      });
      return;
    }
    quickAnalysisMutation.mutate(quickAnalysisFiles);
  };

  const analyzeChartsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Create batch upload with individual timeframe metadata
      const formData = new FormData();
      
      // Add all files to FormData
      files.forEach((file) => {
        formData.append('charts', file);
      });
      
      // Add timeframe mapping as JSON string
      const timeframeMapping: Record<string, string> = {};
      files.forEach((file) => {
        timeframeMapping[file.name] = fileTimeframes[file.name] || "5M";
      });
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));
      
      if (selectedInstrument && selectedInstrument !== "auto") {
        formData.append('instrument', selectedInstrument);
      }
      if (selectedSession) {
        formData.append('session', selectedSession);
      }

      // Upload all charts in batch with individual timeframes
      const uploadResponse = await apiRequest('POST', '/api/upload', formData);
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error('Batch upload failed');
      }

      return {
        uploadedCount: uploadData.charts.length,
        charts: uploadData.charts,
        uploadMessage: `Successfully uploaded ${uploadData.charts.length} chart(s) with individual timeframes`
      };
    },
    onSuccess: (data) => {
      setSelectedFiles([]);
      setFileTimeframes({});
      toast({
        title: "Charts Saved Successfully", 
        description: `${data.uploadedCount} chart(s) uploaded with individual timeframes and saved to dashboard.`,
      });
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "An error occurred during upload.",
        variant: "destructive",
      });
    },
  });

  // Separate mutation for analyzing uploaded charts
  const analyzeUploadedChartsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Create batch upload with individual timeframe metadata
      const formData = new FormData();
      
      // Add all files to FormData
      files.forEach((file) => {
        formData.append('charts', file);
      });
      
      // Add timeframe mapping as JSON string
      const timeframeMapping: Record<string, string> = {};
      files.forEach((file) => {
        timeframeMapping[file.name] = fileTimeframes[file.name] || "5M";
      });
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));
      
      if (selectedInstrument && selectedInstrument !== "auto") {
        formData.append('instrument', selectedInstrument);
      }
      if (selectedSession) {
        formData.append('session', selectedSession);
      }

      // Upload all charts in batch with individual timeframes
      const uploadResponse = await apiRequest('POST', '/api/upload', formData);
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error('Batch upload failed');
      }

      // Analyze the first uploaded chart
      if (uploadData.charts.length > 0) {
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
      }

      return {
        uploadedCount: uploadData.charts.length,
        uploadMessage: uploadData.message
      };
    },
    onSuccess: (data) => {
      setSelectedFiles([]);
      setFileTimeframes({});
      setAnalysisResults(data);
      if (data.chartId) {
        setCurrentChartId(data.chartId);
      }
      toast({
        title: "Analysis Complete", 
        description: data.uploadMessage || `${data.uploadedCount || 1} chart(s) uploaded and analyzed successfully.`,
      });
    },
    onError: (error) => {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "An error occurred during analysis.",
        variant: "destructive",
      });
    },
  });

  const quickAnalysisMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      
      // Add all files to FormData
      files.forEach((file) => {
        formData.append('charts', file);
      });
      
      // Add timeframe mapping as JSON string for quick analysis
      const timeframeMapping: Record<string, string> = {};
      files.forEach((file) => {
        timeframeMapping[file.name] = quickAnalysisTimeframes[file.name] || "5M";
      });
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));
      
      if (selectedInstrument && selectedInstrument !== "auto") {
        formData.append('instrument', selectedInstrument);
      }
      if (selectedSession) {
        formData.append('session', selectedSession);
      }

      // Upload all charts with individual timeframes
      const uploadResponse = await apiRequest('POST', '/api/upload', formData);
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error('Upload failed for quick analysis');
      }

      const chartIds = uploadData.charts.map((chart: any) => chart.id);
      const analysisResults = [];
      
      // Process all charts: generate depth maps and analyze each one
      for (const chart of uploadData.charts) {
        // Generate depth map for each chart
        await apiRequest('POST', '/api/depth', { chartId: chart.id });

        // Analyze each chart using new RAG endpoint
        const analysisResponse = await apiRequest('POST', `/api/analyze/${chart.id}`);
        const analysisData = await analysisResponse.json();
        
        analysisResults.push({
          ...analysisData,
          chartPath: `/uploads/${chart.filename}`,
          chartName: chart.originalName,
          timeframe: chart.timeframe
        });
      }
      
      // Return combined results for all charts
      return {
        isQuickAnalysis: true,
        chartCount: uploadData.charts.length,
        timeframes: Object.values(timeframeMapping),
        savedToDatabase: true,
        analysisResults: analysisResults,
        mainChartPath: `/uploads/${uploadData.charts[0].filename}`,
        // Include first chart's analysis for backward compatibility
        ...analysisResults[0]
      };
    },
    onSuccess: (data) => {
      setAnalysisResults(data);
      setQuickAnalysisFiles([]);
      setQuickAnalysisTimeframes({});
      
      // Invalidate queries to refresh dashboard
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['charts'] });
      
      const timeframesList = data.analysisResults ? 
        data.analysisResults.map((r: any) => `${r.chartName} (${r.timeframe})`).join(', ') :
        `${data.chartCount} file(s)`;
      
      toast({
        title: "Quick Analysis Complete",
        description: `Charts analyzed and saved: ${timeframesList}`,
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

  // Save charts only mutation (no analysis)
  const saveChartsOnlyMutation = useMutation({
    mutationFn: async (files: File[]) => {
      // Create batch upload with individual timeframe metadata
      const formData = new FormData();
      
      // Add all files to FormData
      files.forEach((file) => {
        formData.append('charts', file);
      });
      
      // Add timeframe mapping as JSON string
      const timeframeMapping: Record<string, string> = {};
      files.forEach((file) => {
        timeframeMapping[file.name] = fileTimeframes[file.name] || "5M";
      });
      formData.append('timeframeMapping', JSON.stringify(timeframeMapping));
      
      if (selectedInstrument && selectedInstrument !== "auto") {
        formData.append('instrument', selectedInstrument);
      }
      if (selectedSession) {
        formData.append('session', selectedSession);
      }

      // Upload all charts in batch with individual timeframes
      const uploadResponse = await apiRequest('POST', '/api/upload', formData);
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error('Batch upload failed');
      }

      // Generate depth maps for uploaded charts but don't trigger analysis
      for (const chart of uploadData.charts) {
        await apiRequest('POST', '/api/depth', { chartId: chart.id });
      }
      
      return {
        uploadedCount: uploadData.charts.length,
        uploadMessage: `Successfully uploaded ${uploadData.charts.length} chart(s) with individual timeframes`,
        charts: uploadData.charts
      };
    },
    onSuccess: (data) => {
      setSelectedFiles([]);
      setFileTimeframes({});
      toast({
        title: "Charts Saved Successfully", 
        description: `${data.uploadedCount} chart(s) uploaded with individual timeframes and saved to dashboard. Ready for analysis when needed.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
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
              
              {/* Individual Chart Timeframe Message */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Individual Timeframes:</strong> Each uploaded chart can have its own timeframe selected below
                </p>
              </div>

              <InstrumentSelector
                selectedInstrument={selectedInstrument}
                selectedSession={selectedSession}
                onInstrumentChange={setSelectedInstrument}
                onSessionChange={setSelectedSession}
              />

              <div className="mb-6">
                <DragDropZone
                  onFilesSelected={(files: FileList) => handleFilesSelected(Array.from(files))}
                  className="mb-4"
                  isLoading={analyzeUploadedChartsMutation.isPending}
                  multiple={true}
                  placeholder="Drop chart images here or click 'Add Charts' button"
                />
                
                <div className="flex space-x-3">
                  <Button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) handleFilesSelected(Array.from(files));
                      };
                      input.click();
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Add Charts
                  </Button>
                  
                  <Button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.multiple = false;
                      input.onchange = (e) => {
                        const files = (e.target as HTMLInputElement).files;
                        if (files) handleFilesSelected(Array.from(files));
                      };
                      input.click();
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Add Single Chart
                  </Button>
                </div>
              </div>

              {/* Selected Files Preview */}
              {selectedFiles.length > 0 && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-700">
                      Selected Files ({selectedFiles.length})
                    </h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleClearAll}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {selectedFiles.map((file, index) => {
                      const imageUrl = URL.createObjectURL(file);
                      return (
                        <div key={index} className="bg-white dark:bg-gray-700 p-3 rounded border">
                          <div className="flex items-center space-x-3 mb-3">
                            {/* Chart Preview Thumbnail */}
                            <div className="flex-shrink-0">
                              <img 
                                src={imageUrl} 
                                alt={file.name}
                                className="w-12 h-12 object-cover rounded border"
                                onLoad={() => URL.revokeObjectURL(imageUrl)}
                              />
                            </div>
                            
                            {/* File Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {file.name}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({(file.size / 1024).toFixed(1)} KB)
                                </span>
                              </div>
                            </div>
                            
                            {/* Remove Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveFile(index)}
                              className="text-gray-400 hover:text-red-500 h-6 w-6 p-0 flex-shrink-0"
                            >
                              ×
                            </Button>
                          </div>
                          
                          {/* Individual Timeframe Selector */}
                          <div className="flex items-center space-x-2 ml-15">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Timeframe:</span>
                            <div className="flex space-x-1">
                              {["5M", "15M", "1H", "4H", "Daily"].map((timeframe) => (
                                <Button
                                  key={timeframe}
                                  size="sm"
                                  variant={fileTimeframes[file.name] === timeframe ? "default" : "outline"}
                                  onClick={() => updateFileTimeframe(file.name, timeframe as Timeframe)}
                                  className="h-6 text-xs px-2"
                                >
                                  {timeframe}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <Button 
                  onClick={handleSaveChartsOnly}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
                  disabled={saveChartsOnlyMutation.isPending || selectedFiles.length === 0}
                >
                  {saveChartsOnlyMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Charts Only
                    </>
                  )}
                </Button>

                <Button 
                  onClick={handleSubmitBatch}
                  className="flex-1 bg-primary-500 hover:bg-primary-600"
                  disabled={analyzeUploadedChartsMutation.isPending || selectedFiles.length === 0}
                >
                  {analyzeUploadedChartsMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <ChartLine className="mr-2 h-4 w-4" />
                      Analyze Charts ({selectedFiles.length})
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Analysis */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Bolt className="text-amber-500 mr-2 h-5 w-5" />
                Quick Chart Analysis
              </h2>
              
              <DragDropZone
                onFilesSelected={handleQuickAnalysisFiles}
                className="mb-6 hover:border-amber-400"
                isLoading={quickAnalysisMutation.isPending}
                placeholder="Paste (Ctrl/Cmd+V) or Drag & Drop chart image(s) here"
                multiple={true}
              />

              {/* Quick Analysis Files Preview */}
              {quickAnalysisFiles.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Quick Analysis Files ({quickAnalysisFiles.length})
                    </h3>
                    <Button 
                      onClick={clearQuickAnalysisFiles}
                      variant="outline" 
                      size="sm" 
                      className="text-amber-600 hover:text-amber-700 border-amber-300"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {quickAnalysisFiles.map((file, index) => {
                      const imageUrl = URL.createObjectURL(file);
                      return (
                        <div key={index} className="bg-white dark:bg-gray-700 p-2 rounded border">
                          <div className="flex items-center space-x-3 mb-2">
                            <div className="flex-shrink-0">
                              <img 
                                src={imageUrl} 
                                alt={file.name}
                                className="w-10 h-10 object-cover rounded border"
                                onLoad={() => URL.revokeObjectURL(imageUrl)}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                                {file.name}
                              </span>
                            </div>
                            <Button
                              onClick={() => removeQuickAnalysisFile(index)}
                              variant="ghost"
                              size="sm"
                              className="text-gray-400 hover:text-red-500 h-6 w-6 p-0 flex-shrink-0"
                            >
                              ×
                            </Button>
                          </div>
                          
                          {/* Individual Timeframe Selector */}
                          <div className="flex items-center space-x-1 ml-13">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Timeframe:</span>
                            <div className="flex space-x-1">
                              {["5M", "15M", "1H", "4H", "Daily"].map((timeframe) => (
                                <Button
                                  key={timeframe}
                                  size="sm"
                                  variant={quickAnalysisTimeframes[file.name] === timeframe ? "default" : "outline"}
                                  onClick={() => updateQuickAnalysisTimeframe(file.name, timeframe as Timeframe)}
                                  className="h-5 text-xs px-1"
                                >
                                  {timeframe}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button 
                onClick={runQuickAnalysis}
                className="w-full bg-amber-500 hover:bg-amber-600"
                disabled={quickAnalysisMutation.isPending || quickAnalysisFiles.length === 0}
              >
                {quickAnalysisMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Bolt className="mr-2 h-4 w-4" />
                    Run Quick Analysis {quickAnalysisFiles.length > 0 && `(${quickAnalysisFiles.length} files)`}
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

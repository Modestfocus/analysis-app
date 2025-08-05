import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import DragDropZone from "@/components/drag-drop-zone";
import { Bolt, Camera, X, Zap, RefreshCw } from "lucide-react";

interface QuickChartAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: File[];
  className?: string;
  currentPrompt?: string;
}

export function QuickChartAnalysis({ 
  isOpen, 
  onClose, 
  initialFiles = [], 
  className = "",
  currentPrompt
}: QuickChartAnalysisProps) {
  const [quickAnalysisFiles, setQuickAnalysisFiles] = useState<File[]>(initialFiles);
  const [selectedTimeframes, setSelectedTimeframes] = useState<{ [key: number]: string }>({});
  const [analysisResults, setAnalysisResults] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from drag & drop or file input
  const handleQuickAnalysisFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.isArray(files) ? files : Array.from(files);
    setQuickAnalysisFiles(prev => [...prev, ...fileArray]);
    
    // Initialize timeframes for new files
    const newTimeframes: { [key: number]: string } = {};
    fileArray.forEach((_, index) => {
      const fileIndex = quickAnalysisFiles.length + index;
      newTimeframes[fileIndex] = "1H"; // Default timeframe
    });
    setSelectedTimeframes(prev => ({ ...prev, ...newTimeframes }));
  }, [quickAnalysisFiles.length]);

  // Remove a file from quick analysis
  const removeQuickAnalysisFile = useCallback((index: number) => {
    setQuickAnalysisFiles(prev => prev.filter((_, i) => i !== index));
    setSelectedTimeframes(prev => {
      const updated = { ...prev };
      delete updated[index];
      // Reindex remaining timeframes
      const reindexed: { [key: number]: string } = {};
      Object.entries(updated).forEach(([oldIndex, timeframe]) => {
        const oldIdx = parseInt(oldIndex);
        if (oldIdx > index) {
          reindexed[oldIdx - 1] = timeframe;
        } else if (oldIdx < index) {
          reindexed[oldIdx] = timeframe;
        }
      });
      return reindexed;
    });
  }, []);

  // Clear all files
  const clearQuickAnalysisFiles = useCallback(() => {
    setQuickAnalysisFiles([]);
    setSelectedTimeframes({});
    setAnalysisResults([]);
  }, []);

  // Quick analysis mutation
  const quickAnalysisMutation = useMutation({
    mutationFn: async () => {
      if (quickAnalysisFiles.length === 0) {
        throw new Error("No files selected for analysis");
      }

      const formData = new FormData();
      quickAnalysisFiles.forEach((file, index) => {
        formData.append('charts', file);
        formData.append(`timeframe_${index}`, selectedTimeframes[index] || "1H");
      });

      // Add current prompt to the request
      if (currentPrompt) {
        formData.append('system_prompt', currentPrompt);
      }

      return apiRequest('POST', '/api/analyze/quick', formData);
    },
    onSuccess: (data: any) => {
      setAnalysisResults(data.analyses || []);
      queryClient.invalidateQueries({ queryKey: ["/api/charts"] });
      
      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed ${quickAnalysisFiles.length} chart${quickAnalysisFiles.length !== 1 ? 's' : ''}`,
      });
    },
    onError: (error) => {
      console.error("Quick analysis failed:", error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze charts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle paste events
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!isOpen) return;
    
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    
    if (imageItems.length > 0) {
      e.preventDefault();
      const files: File[] = [];
      
      imageItems.forEach((item, index) => {
        const file = item.getAsFile();
        if (file) {
          const newFile = new File([file], `pasted-chart-${Date.now()}-${index}.png`, {
            type: file.type,
            lastModified: Date.now(),
          });
          files.push(newFile);
        }
      });
      
      if (files.length > 0) {
        handleQuickAnalysisFiles(files);
      }
    }
  }, [isOpen, handleQuickAnalysisFiles]);

  // Set up paste event listener
  useState(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  });

  if (!isOpen) return null;

  return (
    <div className={`bg-white dark:bg-gray-800 border-t shadow-lg ${className}`}>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
              <Bolt className="text-amber-500 mr-2 h-5 w-5" />
              Quick Chart Analysis
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
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
                      
                      {/* Timeframe Selection */}
                      <div className="mt-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">Timeframe:</span>
                          <Select
                            value={selectedTimeframes[index] || "1H"}
                            onValueChange={(value) => setSelectedTimeframes(prev => ({ ...prev, [index]: value }))}
                          >
                            <SelectTrigger className="w-20 h-6 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1M">1M</SelectItem>
                              <SelectItem value="5M">5M</SelectItem>
                              <SelectItem value="15M">15M</SelectItem>
                              <SelectItem value="30M">30M</SelectItem>
                              <SelectItem value="1H">1H</SelectItem>
                              <SelectItem value="4H">4H</SelectItem>
                              <SelectItem value="1D">1D</SelectItem>
                              <SelectItem value="1W">1W</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Analysis Button */}
              <div className="mt-4 flex justify-center">
                <Button
                  onClick={() => quickAnalysisMutation.mutate()}
                  disabled={quickAnalysisFiles.length === 0 || quickAnalysisMutation.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6"
                >
                  {quickAnalysisMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Run Quick Analysis
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {analysisResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Analysis Results</h3>
              {analysisResults.map((result, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs">
                      Chart {index + 1}
                    </Badge>
                    {result.timeframe && (
                      <Badge variant="secondary" className="text-xs">
                        {result.timeframe}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {result.analysis || "Analysis completed"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hidden file input for manual file selection */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                handleQuickAnalysisFiles(files);
              }
            }}
            className="hidden"
          />
        </CardContent>
      </Card>
    </div>
  );
}
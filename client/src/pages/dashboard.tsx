import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChartLine, Upload, ChartBar, Filter, Trash2 } from "lucide-react";
import ChartCard from "@/components/chart-card";
import BundleCard from "@/components/bundle-card";
import GPTAnalysisPanel from "@/components/gpt-analysis-panel";
import type { Chart, Timeframe, ChartBundle, BundleMetadata } from "@shared/schema";

export default function DashboardPage() {
  const [location] = useLocation();
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("All");
  const [selectedCharts, setSelectedCharts] = useState<Set<number>>(new Set());
  const [analysisResults, setAnalysisResults] = useState(null);
  const [showView, setShowView] = useState<"charts" | "bundles" | "analyses">("charts");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chartsData, isLoading: isLoadingCharts, refetch } = useQuery({
    queryKey: ['charts', selectedTimeframe],
    queryFn: async () => {
      const url = selectedTimeframe === "All" 
        ? '/api/charts'
        : `/api/charts?timeframe=${encodeURIComponent(selectedTimeframe)}`;
      const response = await apiRequest('GET', url);
      const data = await response.json();
      return data;
    },
    staleTime: 0,
    gcTime: 0, // Don't cache at all
  });

  // Force refetch when timeframe changes
  useEffect(() => {
    refetch();
  }, [selectedTimeframe, refetch]);

  const { data: bundlesData, isLoading: isLoadingBundles } = useQuery({
    queryKey: ['bundles'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/bundles');
      const data = await response.json();
      return data;
    },
    select: (data: any) => data.bundles as (ChartBundle & { parsedMetadata: BundleMetadata })[],
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  const { data: analysesData, isLoading: isLoadingAnalyses } = useQuery({
    queryKey: ['analyses'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/analyses');
      const data = await response.json();
      return data.analyses || [];
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: async (chartIds: number[]) => {
      const response = await apiRequest('DELETE', '/api/charts', { ids: chartIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charts'] });
      setSelectedCharts(new Set());
      toast({
        title: "Charts Deleted",
        description: `${selectedCharts.size} chart(s) successfully deleted.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleChartSelect = (chartId: number, selected: boolean) => {
    const newSelected = new Set(selectedCharts);
    if (selected) {
      newSelected.add(chartId);
    } else {
      newSelected.delete(chartId);
    }
    setSelectedCharts(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedCharts.size === 0) {
      toast({
        title: "No Charts Selected",
        description: "Please select charts to delete.",
        variant: "destructive",
      });
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedCharts.size} chart(s)?`)) {
      deleteSelectedMutation.mutate(Array.from(selectedCharts));
    }
  };

  const createBundleMutation = useMutation({
    mutationFn: async ({ chartIds, instrument, session }: { chartIds: number[], instrument: string, session?: string }) => {
      const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const response = await apiRequest('POST', '/api/bundles', { 
        id: bundleId, 
        instrument, 
        session,
        chartIds 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charts'] });
      queryClient.invalidateQueries({ queryKey: ['bundles'] });
      setSelectedCharts(new Set());
      toast({
        title: "Bundle Created",
        description: `Chart bundle created successfully with ${selectedCharts.size} charts.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Bundle Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateBundle = () => {
    if (selectedCharts.size < 2) {
      toast({
        title: "Not Enough Charts",
        description: "Please select at least 2 charts to create a bundle.",
        variant: "destructive",
      });
      return;
    }

    const selectedChartData = charts.filter((chart: Chart) => selectedCharts.has(chart.id));
    const instruments = Array.from(new Set(selectedChartData.map((chart: Chart) => chart.instrument)));
    
    if (instruments.length > 1) {
      toast({
        title: "Mixed Instruments",
        description: "All charts in a bundle must be for the same instrument.",
        variant: "destructive",
      });
      return;
    }

    const instrument = instruments[0] as string;
    const sessions = Array.from(new Set(selectedChartData.map((chart: Chart) => chart.session).filter(Boolean)));
    const session = sessions.length === 1 ? (sessions[0] as string) || undefined : undefined;

    if (confirm(`Create a chart bundle for ${instrument} with ${selectedCharts.size} charts?`)) {
      createBundleMutation.mutate({ 
        chartIds: Array.from(selectedCharts), 
        instrument,
        session 
      });
    }
  };

  const charts = Array.isArray(chartsData?.charts) ? chartsData.charts : [];
  const bundles = bundlesData || [];
  const analyses = analysesData || [];
  const isLoading = showView === "charts" ? isLoadingCharts : showView === "bundles" ? isLoadingBundles : isLoadingAnalyses;
  
  console.log('Dashboard render - selectedTimeframe:', selectedTimeframe, 'charts.length:', charts.length, 'charts:', charts);

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
          </div>
        </nav>

        {/* Dashboard Content */}
        <div className="flex-1 p-6">
          {/* Dashboard Header */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <ChartBar className="text-primary-500 mr-2 h-5 w-5" />
                    {showView === "charts" ? "Charts Dashboard" : showView === "bundles" ? "Chart Bundles Dashboard" : "Quick Analysis Results"}
                  </h2>
                  {showView === "charts" && (
                    <p className="text-sm text-gray-600 mt-1">
                      {isLoadingCharts ? (
                        "Loading charts..."
                      ) : (
                        selectedTimeframe === "All" 
                          ? `Showing all ${charts.length} charts`
                          : charts.length === 0
                          ? `No charts found for ${selectedTimeframe} timeframe`
                          : `Showing ${charts.length} charts filtered by ${selectedTimeframe} timeframe`
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant={showView === "charts" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowView("charts")}
                  >
                    Individual Charts
                  </Button>
                  <Button
                    variant={showView === "bundles" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowView("bundles")}
                  >
                    Chart Bundles
                  </Button>
                  <Button
                    variant={showView === "analyses" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowView("analyses")}
                  >
                    Quick Analysis
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {showView === "charts" && (
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      <Filter className={`mr-2 h-4 w-4 ${selectedTimeframe !== "All" ? "text-primary-500" : ""}`} />
                      Filter by timeframe:
                      <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                        <SelectTrigger className={`ml-2 w-32 ${selectedTimeframe !== "All" ? "border-primary-500 bg-primary-50" : ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All</SelectItem>
                          <SelectItem value="5M">5M</SelectItem>
                          <SelectItem value="15M">15M</SelectItem>
                          <SelectItem value="1H">1H</SelectItem>
                          <SelectItem value="4H">4H</SelectItem>
                          <SelectItem value="Daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                      {selectedTimeframe !== "All" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTimeframe("All")}
                          className="ml-2 text-xs"
                        >
                          Clear Filter
                        </Button>
                      )}
                    </label>
                  )}
                </div>
                {showView === "charts" && (
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleCreateBundle}
                      disabled={selectedCharts.size < 2 || createBundleMutation.isPending}
                    >
                      {createBundleMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                          Creating Bundle...
                        </>
                      ) : (
                        <>
                          <ChartLine className="mr-2 h-4 w-4" />
                          Create Bundle ({selectedCharts.size})
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleDeleteSelected}
                      disabled={selectedCharts.size === 0 || deleteSelectedMutation.isPending}
                    >
                      {deleteSelectedMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Selected ({selectedCharts.size})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Content Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="w-full h-48 bg-gray-200 rounded-lg mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : showView === "charts" ? (
            charts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ChartBar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Charts Found</h3>
                  <p className="text-gray-500 mb-4">
                    {selectedTimeframe === "All" 
                      ? "You haven't uploaded any charts yet."
                      : `No charts found for ${selectedTimeframe} timeframe. Try selecting "All" to see your charts or upload charts for this timeframe.`
                    }
                  </p>
                  <Button asChild>
                    <Link href="/upload">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Your First Chart
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {charts.map((chart: Chart) => (
                  <ChartCard
                    key={chart.id}
                    chart={chart}
                    selected={selectedCharts.has(chart.id)}
                    onSelect={(selected) => handleChartSelect(chart.id, selected)}
                    onAnalyze={(results) => setAnalysisResults(results)}
                  />
                ))}
              </div>
            )
          ) : showView === "bundles" ? (
            bundles.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ChartLine className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Chart Bundles Found</h3>
                  <p className="text-gray-500 mb-4">
                    You haven't created any chart bundles yet. Bundle multiple charts of the same instrument for comprehensive multi-timeframe analysis.
                  </p>
                  <Button asChild>
                    <Link href="/dashboard">
                      <ChartBar className="mr-2 h-4 w-4" />
                      View Individual Charts
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {bundles.map((bundle) => (
                  <BundleCard
                    key={bundle.id}
                    bundle={bundle}
                    onAnalyze={(results) => setAnalysisResults(results)}
                  />
                ))}
              </div>
            )
          ) : (
            analyses.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ChartBar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Quick Analysis Results</h3>
                  <p className="text-gray-500 mb-4">
                    You haven't run any Quick Analysis yet. Upload a chart and run analysis to see results here.
                  </p>
                  <Button asChild>
                    <Link href="/upload">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload & Analyze Charts
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {analyses.map((analysis: any) => (
                  <Card key={analysis.id} className="p-6">
                    <div className="flex items-start space-x-4">
                      {analysis.chart && (
                        <div className="flex-shrink-0">
                          <img 
                            src={analysis.chart.filePath} 
                            alt={analysis.chart.originalName}
                            className="w-32 h-24 object-cover rounded-lg border"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {analysis.chart?.originalName || `Analysis #${analysis.id}`}
                          </h3>
                          <div className="flex items-center space-x-2">
                            {analysis.chart && (
                              <>
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                  {analysis.chart.timeframe}
                                </span>
                                <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
                                  {analysis.chart.instrument}
                                </span>
                                {analysis.chart.session && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                                    {analysis.chart.session}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        
                        {analysis.prediction && (
                          <div className="mb-4">
                            <div className="grid grid-cols-3 gap-4 mb-3">
                              <div>
                                <span className="text-sm font-medium text-gray-600">Prediction:</span>
                                <p className={`text-lg font-bold ${analysis.prediction.prediction?.toLowerCase() === 'up' ? 'text-green-600' : analysis.prediction.prediction?.toLowerCase() === 'down' ? 'text-red-600' : 'text-gray-600'}`}>
                                  {analysis.prediction.prediction}
                                </p>
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-600">Session:</span>
                                <p className="text-lg font-semibold text-gray-900">{analysis.prediction.session}</p>
                              </div>
                              <div>
                                <span className="text-sm font-medium text-gray-600">Confidence:</span>
                                <p className={`text-lg font-semibold ${analysis.prediction.confidence === 'High' ? 'text-green-600' : analysis.prediction.confidence === 'Medium' ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {analysis.prediction.confidence}
                                </p>
                              </div>
                            </div>
                            
                            <div className="mb-3">
                              <span className="text-sm font-medium text-gray-600">Analysis:</span>
                              <p className="text-sm text-gray-700 leading-relaxed mt-1">
                                {analysis.prediction.reasoning}
                              </p>
                            </div>
                            
                            {analysis.similarCharts && analysis.similarCharts.length > 0 && (
                              <div>
                                <span className="text-sm font-medium text-gray-600">
                                  Similar Charts ({analysis.similarCharts.length}):
                                </span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {analysis.similarCharts.map((similar: any, idx: number) => (
                                    <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                                      {similar.filename} ({(similar.similarity * 100).toFixed(1)}%)
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500">
                          Created: {new Date(analysis.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Right Panel - GPT Analysis */}
      <GPTAnalysisPanel analysisResults={analysisResults} />
    </div>
  );
}

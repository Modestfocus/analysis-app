import { useState } from "react";
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
  const [showView, setShowView] = useState<"charts" | "bundles">("charts");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: chartsData, isLoading: isLoadingCharts } = useQuery({
    queryKey: ['/api/charts', selectedTimeframe],
    queryFn: async () => {
      const url = selectedTimeframe === "All" 
        ? '/api/charts'
        : `/api/charts?timeframe=${encodeURIComponent(selectedTimeframe)}`;
      console.log('Fetching charts from URL:', url);
      const response = await apiRequest('GET', url);
      const data = await response.json();
      console.log('Charts API response:', data);
      return data;
    },
    select: (data: any) => {
      const charts = data.charts as Chart[];
      console.log('Selected charts:', charts);
      return charts;
    },
  });

  const { data: bundlesData, isLoading: isLoadingBundles } = useQuery({
    queryKey: ['/api/bundles'],
    select: (data: any) => data.bundles as (ChartBundle & { parsedMetadata: BundleMetadata })[],
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: async (chartIds: number[]) => {
      const response = await apiRequest('DELETE', '/api/charts', { ids: chartIds });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charts'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/charts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bundles'] });
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

    const selectedChartData = charts.filter(chart => selectedCharts.has(chart.id));
    const instruments = Array.from(new Set(selectedChartData.map(chart => chart.instrument)));
    
    if (instruments.length > 1) {
      toast({
        title: "Mixed Instruments",
        description: "All charts in a bundle must be for the same instrument.",
        variant: "destructive",
      });
      return;
    }

    const instrument = instruments[0];
    const sessions = Array.from(new Set(selectedChartData.map(chart => chart.session).filter(Boolean)));
    const session = sessions.length === 1 ? sessions[0] || undefined : undefined;

    if (confirm(`Create a chart bundle for ${instrument} with ${selectedCharts.size} charts?`)) {
      createBundleMutation.mutate({ 
        chartIds: Array.from(selectedCharts), 
        instrument,
        session 
      });
    }
  };

  const charts = chartsData || [];
  const bundles = bundlesData || [];
  const isLoading = showView === "charts" ? isLoadingCharts : isLoadingBundles;

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
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <ChartBar className="text-primary-500 mr-2 h-5 w-5" />
                  {showView === "charts" ? "Charts Dashboard" : "Chart Bundles Dashboard"}
                </h2>
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
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {showView === "charts" && (
                    <label className="flex items-center text-sm font-medium text-gray-700">
                      <Filter className="mr-2 h-4 w-4" />
                      Filter by timeframe:
                      <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                        <SelectTrigger className="ml-2 w-32">
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
                      : `No charts found for ${selectedTimeframe} timeframe.`
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
                {charts.map((chart) => (
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
          ) : (
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
          )}
        </div>
      </div>

      {/* Right Panel - GPT Analysis */}
      <GPTAnalysisPanel analysisResults={analysisResults} />
    </div>
  );
}

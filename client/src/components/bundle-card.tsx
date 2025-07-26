import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChartLine, Play, Trash2, Clock } from "lucide-react";
import type { ChartBundle, BundleMetadata } from "@shared/schema";

interface BundleCardProps {
  bundle: ChartBundle & { parsedMetadata: BundleMetadata };
  onAnalyze?: (results: any) => void;
}

export default function BundleCard({ bundle, onAnalyze }: BundleCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const analyzeBundleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/analyze/bundle/${bundle.id}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (onAnalyze) {
        onAnalyze(data);
      }
      toast({
        title: "Bundle Analysis Complete",
        description: "Multi-timeframe analysis completed successfully.",
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

  const deleteBundleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/bundles/${bundle.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bundles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/charts'] });
      toast({
        title: "Bundle Deleted",
        description: "Chart bundle has been successfully deleted.",
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

  const handleAnalyzeBundle = () => {
    analyzeBundleMutation.mutate();
  };

  const handleDeleteBundle = () => {
    if (confirm('Are you sure you want to delete this bundle? This will not delete the individual charts.')) {
      deleteBundleMutation.mutate();
    }
  };

  const metadata = bundle.parsedMetadata;
  const timeframes = metadata.timeframes;
  const chartCount = metadata.chart_ids.length;

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <ChartLine className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-gray-900">
                {metadata.instrument} Bundle
              </h3>
              <Badge variant="outline" className="ml-2">
                {chartCount} Charts
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
              <Clock className="h-4 w-4" />
              <span>Created {new Date(bundle.createdAt).toLocaleDateString()}</span>
              {metadata.session && (
                <Badge variant="secondary" className="ml-2">
                  {metadata.session}
                </Badge>
              )}
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Timeframes:</p>
              <div className="flex flex-wrap gap-1">
                {timeframes.map((timeframe, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {timeframe}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-500">
            Bundle ID: {bundle.id.slice(-8)}...
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyzeBundle}
              disabled={analyzeBundleMutation.isPending}
            >
              {analyzeBundleMutation.isPending ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
              ) : (
                <Play className="h-3 w-3" />
              )}
              <span className="ml-2">
                {analyzeBundleMutation.isPending ? "Analyzing..." : "Run Bundle Analysis"}
              </span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteBundle}
              disabled={deleteBundleMutation.isPending}
            >
              {deleteBundleMutation.isPending ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-destructive"></div>
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
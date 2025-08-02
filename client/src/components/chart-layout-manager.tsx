import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Upload, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ChartLayout {
  id: string;
  userId: string;
  layoutConfig: any;
  updatedAt: string;
}

interface ChartLayoutManagerProps {
  onLayoutLoad: (layoutConfig: any) => void;
  onSaveLayout: (name?: string) => Promise<any>; // Function to get current layout from TradingView
  onDeleteLayout?: (layoutId: string) => Promise<void>;
}

export default function ChartLayoutManager({ onLayoutLoad, onSaveLayout, onDeleteLayout }: ChartLayoutManagerProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Fetch user's saved layout
  const { data: layout, isLoading } = useQuery({
    queryKey: ["/api/chart-layout"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/chart-layout");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.layout || null;
      } catch (error) {
        console.error("Error fetching chart layout:", error);
        return null;
      }
    },
  });

  // Save current chart layout
  const saveLayoutMutation = useMutation({
    mutationFn: async (layoutConfig: any) => {
      const response = await apiRequest("POST", "/api/chart-layout", { layoutConfig });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chart-layout"] });
      toast({
        title: "Layout saved",
        description: "Your chart layout has been saved successfully",
      });
      setIsSaving(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save layout",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      setIsSaving(false);
    },
  });

  const handleSaveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      // Get current layout configuration from TradingView
      const currentLayout = await onSaveLayout();
      
      if (currentLayout) {
        // Add metadata to the layout
        const layoutWithMetadata = {
          ...currentLayout,
          savedAt: new Date().toISOString(),
          version: "1.0"
        };
        
        saveLayoutMutation.mutate(layoutWithMetadata);
      } else {
        throw new Error("Could not retrieve current chart layout");
      }
    } catch (error: any) {
      toast({
        title: "Failed to save layout",
        description: error.message || "Could not access chart configuration",
        variant: "destructive",
      });
      setIsSaving(false);
    }
  }, [onSaveLayout, saveLayoutMutation, toast]);

  const handleLoadLayout = useCallback(() => {
    if (layout?.layoutConfig) {
      onLayoutLoad(layout.layoutConfig);
      toast({
        title: "Layout loaded",
        description: "Your saved chart layout has been restored",
      });
    }
  }, [layout, onLayoutLoad, toast]);

  const getLayoutSummary = (layoutConfig: any) => {
    if (!layoutConfig) return "No layout data";
    
    const indicators = layoutConfig.indicators?.length || 0;
    const drawings = layoutConfig.drawings?.length || 0;
    const symbol = layoutConfig.symbol || "Unknown";
    const timeframe = layoutConfig.timeframe || "Unknown";
    
    return `${symbol} - ${timeframe} | ${indicators} indicators, ${drawings} drawings`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Chart Layout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Save current layout */}
        <Button 
          onClick={handleSaveLayout}
          disabled={isSaving || saveLayoutMutation.isPending}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Current Layout"}
        </Button>

        {/* Load saved layout */}
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            Loading saved layout...
          </div>
        ) : layout ? (
          <div className="space-y-3">
            <div className="p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Saved Layout</h4>
                <Badge variant="secondary">
                  {new Date(layout.updatedAt).toLocaleDateString()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {getLayoutSummary(layout.layoutConfig)}
              </p>
              <Button 
                onClick={handleLoadLayout}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Load This Layout
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p>No saved layout found</p>
            <p className="text-xs mt-1">Configure your chart and save it to get started</p>
          </div>
        )}

        {/* Layout tips */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>What gets saved:</strong></p>
          <ul className="ml-4 space-y-1">
            <li>• Selected indicators and their settings</li>
            <li>• Chart drawings and annotations</li>
            <li>• Timeframe and chart type</li>
            <li>• Visual preferences and themes</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
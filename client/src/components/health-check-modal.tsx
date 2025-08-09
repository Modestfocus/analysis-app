import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, CheckCircle, XCircle, AlertCircle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface HealthStatus {
  model: string;
  mapsReady: {
    depth: boolean;
    edge: boolean;
    gradient: boolean;
  };
  rag: {
    k: number;
    found: number;
    sample: number[];
  };
  mergedPromptPreview: string;
  mergedPromptLength: number;
}

export default function HealthCheckModal() {
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: healthData, isLoading, error, refetch } = useQuery<HealthStatus>({
    queryKey: ['analysis-health'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/analysis/health?k=3');
      return response.json();
    },
    enabled: isOpen,
    refetchOnWindowFocus: false,
  });

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-red-500" />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
          onClick={() => setIsOpen(true)}
        >
          <Activity className="h-4 w-4" />
          Health
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Analysis System Health Check
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-950/20 p-4 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span>Failed to fetch health status</span>
            </div>
          )}
          
          {healthData && (
            <>
              {/* Model Information */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">AI Model</h3>
                <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                  <Badge variant="secondary" className="text-sm">
                    {healthData.model}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Visual Maps Status */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Visual Processing Maps</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(healthData.mapsReady.depth)}
                    <span className="text-sm">Depth Maps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(healthData.mapsReady.edge)}
                    <span className="text-sm">Edge Maps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(healthData.mapsReady.gradient)}
                    <span className="text-sm">Gradient Maps</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* RAG System Status */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">RAG Context System</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Similar Charts Found</div>
                    <div className="text-lg font-semibold text-green-600">
                      {healthData.rag.found}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Search Limit (k)</div>
                    <div className="text-lg font-semibold">
                      {healthData.rag.k}
                    </div>
                  </div>
                </div>
                {healthData.rag.sample && healthData.rag.sample.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm text-muted-foreground mb-1">Sample Chart IDs:</div>
                    <div className="flex gap-1">
                      {healthData.rag.sample.slice(0, 3).map((id, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          #{id}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* System Prompt Status */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">System Prompt</h3>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Total Length: {healthData.mergedPromptLength} characters
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                    <div className="text-sm font-mono text-muted-foreground break-words">
                      {healthData.mergedPromptPreview}...
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => refetch()}>
                  Refresh
                </Button>
                <Button onClick={() => setIsOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Trash2, Zap } from "lucide-react";
import type { Chart } from "@shared/schema";

interface ChartCardProps {
  chart: Chart;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onAnalyze: (results: any) => void;
  systemPrompt?: string;
}

export default function ChartCard({ chart, selected, onSelect, onAnalyze, systemPrompt }: ChartCardProps) {
  const [comment, setComment] = useState(chart.comment || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateCommentMutation = useMutation({
    mutationFn: async (newComment: string) => {
      const response = await apiRequest('PATCH', `/api/charts/${chart.id}`, { comment: newComment });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charts'] });
      toast({
        title: "Comment Saved",
        description: "Chart comment has been updated.",
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

  const deleteChartMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/charts/${chart.id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charts'] });
      toast({
        title: "Chart Deleted",
        description: "Chart has been successfully deleted.",
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

  const reanalyzeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('chartId', chart.id.toString());
      formData.append('quickAnalysis', 'false');
      if (systemPrompt) {
        formData.append('system_prompt', systemPrompt);
      }
      const response = await apiRequest('POST', '/api/analyze', formData);
      return response.json();
    },
    onSuccess: (data) => {
      onAnalyze(data);
      toast({
        title: "Re-analysis Complete",
        description: "Chart has been re-analyzed with latest data.",
      });
    },
    onError: (error) => {
      toast({
        title: "Re-analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveComment = () => {
    updateCommentMutation.mutate(comment);
  };

  const handleDeleteChart = () => {
    if (confirm('Are you sure you want to delete this chart?')) {
      deleteChartMutation.mutate();
    }
  };

  const handleReanalyze = () => {
    reanalyzeMutation.mutate();
  };

  const getTimeframeBadgeColor = (timeframe: string) => {
    switch (timeframe) {
      case '5M': return 'bg-blue-50 text-blue-600';
      case '15M': return 'bg-green-50 text-green-600';
      case '1H': return 'bg-yellow-50 text-yellow-600';
      case '4H': return 'bg-purple-50 text-purple-600';
      case 'Daily': return 'bg-red-50 text-red-600';
      default: return 'bg-gray-50 text-gray-600';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <Checkbox
            checked={selected}
            onCheckedChange={onSelect}
          />
          <Badge className={`text-xs font-medium px-2 py-1 rounded-full ${getTimeframeBadgeColor(chart.timeframe)}`}>
            {chart.originalName.split('.')[0]} {chart.timeframe}
          </Badge>
        </div>
        
        {/* Chart Image */}
        <div className="relative mb-4 bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <img
            src={`/uploads/${chart.filename}`}
            alt={chart.originalName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2Y5ZmFmYiIvPjx0ZXh0IHg9IjEwMCIgeT0iNzUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NzI4NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkNoYXJ0IEltYWdlPC90ZXh0Pjwvc3ZnPg==';
            }}
          />
          {chart.depthMapPath && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="text-xs">
                Depth Map
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Textarea
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="resize-none"
          />
          <div className="flex space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveComment}
              disabled={updateCommentMutation.isPending}
              className="flex-1"
            >
              {updateCommentMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                  Saving...
                </>
              ) : (
                <>
                  <MessageSquare className="mr-1 h-3 w-3" />
                  Comment
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={reanalyzeMutation.isPending}
            >
              {reanalyzeMutation.isPending ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-500"></div>
              ) : (
                <Zap className="h-3 w-3" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteChart}
              disabled={deleteChartMutation.isPending}
            >
              {deleteChartMutation.isPending ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
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

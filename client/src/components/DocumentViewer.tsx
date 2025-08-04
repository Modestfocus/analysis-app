import { useState } from "react";
import { Document } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Eye, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DocumentViewerProps {
  document: Document;
  onView?: (document: Document) => void;
  onDelete?: (documentId: number) => void;
  isSelected?: boolean;
}

export function DocumentViewer({ document, onView, onDelete, isSelected }: DocumentViewerProps) {
  const [isHovered, setIsHovered] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'txt':
        return '📃';
      default:
        return '📄';
    }
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'doc':
      case 'docx':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'txt':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    }
  };

  return (
    <Card 
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : ''
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onView?.(document)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{getFileTypeIcon(document.fileType)}</span>
            <span className="truncate" title={document.originalName}>
              {document.originalName}
            </span>
          </div>
          {isHovered && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onView?.(document);
                }}
                className="h-6 w-6 p-0"
              >
                <Eye className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  // Download functionality
                  window.open(`/documents/${document.filePath}`, '_blank');
                }}
                className="h-6 w-6 p-0"
              >
                <Download className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(document.id);
                }}
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Badge variant="secondary" className={getFileTypeColor(document.fileType)}>
              {document.fileType.toUpperCase()}
            </Badge>
            <span>{formatFileSize(document.fileSize)}</span>
          </div>
          
          {document.description && (
            <p className="text-xs text-muted-foreground line-clamp-2" title={document.description}>
              {document.description}
            </p>
          )}
          
          {document.tags && document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {document.tags.slice(0, 3).map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs px-1 py-0">
                  {tag}
                </Badge>
              ))}
              {document.tags.length > 3 && (
                <Badge variant="outline" className="text-xs px-1 py-0">
                  +{document.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
          
          <div className="text-xs text-muted-foreground">
            Uploaded {formatDistanceToNow(document.uploadedAt ? new Date(document.uploadedAt) : new Date(), { addSuffix: true })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
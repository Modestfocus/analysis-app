import { useState } from "react";
import { Document } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, ExternalLink, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DocumentReaderProps {
  document: Document | null;
  onClose?: () => void;
}

export function DocumentReader({ document, onClose }: DocumentReaderProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!document) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full text-center">
          <div className="space-y-4">
            <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium mb-2">No document selected</h3>
              <p className="text-muted-foreground">
                Select a document from the list to view it here
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  const isPdfFile = document.fileType.toLowerCase() === 'pdf';
  const documentUrl = `/documents/${document.filePath.replace('/documents/', '')}`;

  return (
    <Card className={`h-full ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 min-w-0 flex-1">
            <CardTitle className="text-lg truncate" title={document.originalName}>
              {document.originalName}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className={getFileTypeColor(document.fileType)}>
                {document.fileType.toUpperCase()}
              </Badge>
              <span>{formatFileSize(document.fileSize)}</span>
              <span>•</span>
              <span>
                {formatDistanceToNow(document.uploadedAt ? new Date(document.uploadedAt) : new Date(), { addSuffix: true })}
              </span>
            </div>
          </div>
          
          <div className="flex gap-1 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(documentUrl, '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const link = window.document.createElement('a');
                link.href = documentUrl;
                link.download = document.originalName;
                link.click();
              }}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                title="Close"
              >
                ×
              </Button>
            )}
          </div>
        </div>
        
        {document.description && (
          <p className="text-sm text-muted-foreground mt-2">
            {document.description}
          </p>
        )}
        
        {document.tags && document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {document.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-0 flex-1">
        <div className="h-full w-full">
          {isPdfFile ? (
            <iframe
              src={documentUrl}
              className="w-full h-full border-none"
              title={document.originalName}
              style={{ minHeight: '500px' }}
            />
          ) : (
            <div className="p-6 h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-medium mb-2">Preview not available</h3>
                  <p className="text-muted-foreground mb-4">
                    This file type doesn't support inline preview
                  </p>
                  <div className="space-x-2">
                    <Button
                      onClick={() => window.open(documentUrl, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in new tab
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = window.document.createElement('a');
                        link.href = documentUrl;
                        link.download = document.originalName;
                        link.click();
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
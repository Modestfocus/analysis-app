import { useState } from "react";
import { Document as DocumentType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  X, 
  Download, 
  FileText
} from "lucide-react";
import DocumentViewer from "./DocumentViewer";

interface PDFModalViewerProps {
  document: DocumentType;
  onClose: () => void;
  onTextInject?: (text: string) => void;
}

export function PDFModalViewer({ document, onClose, onTextInject }: PDFModalViewerProps) {
  const documentUrl = `/documents/${document.filename}`;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDownload = () => {
    const link = window.document.createElement("a");
    link.href = documentUrl;
    link.download = document.originalName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#161b22] rounded-lg w-full h-full max-w-7xl max-h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-[#3a3a3a] p-4 flex items-center justify-between bg-gray-50 dark:bg-[#0d1117] rounded-t-lg">
          <div className="flex items-center gap-4">
            <FileText className="h-6 w-6 text-primary-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e6e6e6] truncate max-w-md" title={document.originalName}>
                {document.originalName}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{document.fileType.toUpperCase()}</Badge>
                <Badge variant="outline">{formatFileSize(document.fileSize)}</Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 overflow-auto">
          {document.fileType.toLowerCase() === 'pdf' ? (
            <DocumentViewer fileUrl={documentUrl} onTextInject={onTextInject} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Card className="max-w-2xl">
                <CardContent className="p-8 text-center">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Document Preview Not Available</h3>
                  <p className="text-muted-foreground mb-4">
                    This file type cannot be previewed directly. You can download it to view the content.
                  </p>
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download File
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
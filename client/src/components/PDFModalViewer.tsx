import { useState } from "react";
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { thumbnailPlugin } from '@react-pdf-viewer/thumbnail';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/thumbnail/lib/styles/index.css';
import { Document as DocumentType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Download, 
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from "lucide-react";

interface PDFModalViewerProps {
  document: DocumentType;
  onClose: () => void;
}

export function PDFModalViewer({ document, onClose }: PDFModalViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.0);

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

  // Create thumbnail plugin instance
  const thumbnailPluginInstance = thumbnailPlugin();
  const { Thumbnails } = thumbnailPluginInstance;

  const handlePageChange = (e: any) => {
    setCurrentPage(e.currentPage);
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

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
                {numPages > 0 && (
                  <Badge variant="outline">{numPages} pages</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <Button variant="outline" size="sm" onClick={zoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>

            {/* Page Navigation */}
            {numPages > 0 && (
              <>
                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2"></div>
                <Button variant="outline" size="sm" disabled={currentPage === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[4rem] text-center">
                  {currentPage + 1} / {numPages}
                </span>
                <Button variant="outline" size="sm" disabled={currentPage === numPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2"></div>

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
        <div className="flex-1 flex overflow-hidden">
          {/* Thumbnail Sidebar */}
          <div className="w-64 bg-gray-50 dark:bg-[#0d1117] border-r border-gray-200 dark:border-[#3a3a3a] overflow-auto">
            <div className="p-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Page Thumbnails
              </h3>
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                <div className="space-y-2">
                  <Thumbnails />
                </div>
              </Worker>
            </div>
          </div>

          {/* Main PDF Viewer */}
          <div className="flex-1 bg-gray-100 dark:bg-gray-900 overflow-auto">
            {document.fileType.toLowerCase() === 'pdf' ? (
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                <div style={{ height: '100%', width: '100%' }}>
                  <Viewer 
                    fileUrl={documentUrl}
                    plugins={[thumbnailPluginInstance]}
                    onDocumentLoad={(e) => setNumPages(e.doc.numPages)}
                    onPageChange={handlePageChange}
                  />
                </div>
              </Worker>
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
    </div>
  );
}
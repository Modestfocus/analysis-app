import { useState, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Document as DocumentType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Download, 
  FileText, 
  ChevronLeft, 
  ChevronRight,
  Highlighter,
  Edit3,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Configure PDF.js worker - disable worker for compatibility
// This approach works better in some environments where worker loading fails
pdfjs.GlobalWorkerOptions.workerSrc = "";

interface DocumentReaderProps {
  document: DocumentType;
  onClose: () => void;
}

interface Highlight {
  id: string;
  pageNumber: number;
  text: string;
  color: string;
  position: { x: number; y: number; width: number; height: number };
}

export function DocumentReader({ document, onClose }: DocumentReaderProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState("");
  const [documentTitle, setDocumentTitle] = useState(document.originalName);
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const { toast } = useToast();

  const documentUrl = `/documents/${document.filename}`;

  // Memoize options to prevent unnecessary reloads
  const pdfOptions = useMemo(() => ({
    disableWorker: true,
    isEvalSupported: false,
  }), []);

  useEffect(() => {
    // Load any existing notes or highlights for this document
    const savedNotes = localStorage.getItem(`document_notes_${document.id}`);
    const savedHighlights = localStorage.getItem(`document_highlights_${document.id}`);
    
    if (savedNotes) setNotes(savedNotes);
    if (savedHighlights) setHighlights(JSON.parse(savedHighlights));
  }, [document.id]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully, pages:', numPages);
    setNumPages(numPages);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    console.error('PDF URL:', documentUrl);
    console.error('Document object:', document);
    toast({
      title: "Error Loading Document", 
      description: `Failed to load the PDF document. Please check if the file exists and try again.`,
      variant: "destructive",
    });
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handlePageChange = (direction: 'next' | 'prev') => {
    if (direction === 'next' && currentPage < (numPages || 1)) {
      setCurrentPage(prev => prev + 1);
    } else if (direction === 'prev' && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleSave = () => {
    // Save notes and highlights to localStorage
    localStorage.setItem(`document_notes_${document.id}`, notes);
    localStorage.setItem(`document_highlights_${document.id}`, JSON.stringify(highlights));
    
    toast({
      title: "Changes Saved",
      description: "Your notes and highlights have been saved.",
    });
    setIsEditing(false);
  };

  const handleDownload = () => {
    const link = window.document.createElement('a');
    link.href = documentUrl;
    link.download = document.originalName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {isEditing ? (
                <Input
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  className="max-w-md"
                />
              ) : (
                <h1 className="text-lg font-semibold">{documentTitle}</h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{document.fileType.toUpperCase()}</Badge>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(document.fileSize)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <Button variant="ghost" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm min-w-[4rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="ghost" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>

            {/* Page Navigation */}
            {numPages && (
              <>
                <div className="h-4 w-px bg-border mx-2" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange('prev')}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[4rem] text-center">
                  {currentPage} / {numPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePageChange('next')}
                  disabled={currentPage >= numPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            <div className="h-4 w-px bg-border mx-2" />

            {/* Tools */}
            <Button
              variant={isHighlightMode ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsHighlightMode(!isHighlightMode)}
            >
              <Highlighter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRotate}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant={isEditing ? "default" : "ghost"}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              <Edit3 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>

            {isEditing && (
              <Button variant="default" size="sm" onClick={handleSave}>
                <Save className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4">
          <div className="flex justify-center">
            {document.fileType.toLowerCase() === 'pdf' ? (
              <div className="bg-white shadow-lg">
                <Document
                  file={documentUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  options={pdfOptions}
                  loading={
                    <div className="flex items-center justify-center p-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <span className="ml-2 text-sm">Loading PDF...</span>
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center p-8 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300">
                      <FileText className="h-12 w-12 mb-2" />
                      <p className="text-lg font-semibold">Failed to load PDF</p>
                      <p className="text-sm">Please check if the file is valid and try again.</p>
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    rotate={rotation}
                    loading={
                      <div className="flex items-center justify-center p-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    }
                  />
                </Document>
              </div>
            ) : (
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
            )}
          </div>
        </div>

        {/* Side Panel for Notes */}
        {isEditing && (
          <div className="w-80 border-l bg-background p-4 overflow-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notes & Annotations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Document Notes
                  </label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add your notes about this document..."
                    className="mt-1 min-h-[200px]"
                  />
                </div>

                {highlights.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Highlights ({highlights.length})
                    </label>
                    <div className="mt-2 space-y-2">
                      {highlights.map((highlight) => (
                        <div
                          key={highlight.id}
                          className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-xs"
                        >
                          <div className="font-medium">Page {highlight.pageNumber}</div>
                          <div className="text-muted-foreground truncate">
                            {highlight.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  {isHighlightMode ? (
                    <p>📝 Highlight mode is ON. Select text in the PDF to highlight it.</p>
                  ) : (
                    <p>💡 Turn on highlight mode to select and highlight text.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
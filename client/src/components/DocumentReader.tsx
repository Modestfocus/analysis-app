import { useState, useEffect } from "react";
import { Document as DocumentType } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  FileText, 
  Edit3,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DocumentViewer from "./DocumentViewer";

interface DocumentReaderProps {
  document: DocumentType;
  onClose: () => void;
  onTextInject?: (text: string) => void;
}

export function DocumentReader({ document, onClose, onTextInject }: DocumentReaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [notes, setNotes] = useState("");
  const [documentTitle, setDocumentTitle] = useState(document.originalName);
  const { toast } = useToast();

  const documentUrl = `/documents/${document.filename}`;

  useEffect(() => {
    // Load any existing notes for this document
    const savedNotes = localStorage.getItem(`document_notes_${document.id}`);
    if (savedNotes) setNotes(savedNotes);
  }, [document.id]);

  const handleSave = () => {
    localStorage.setItem(`document_notes_${document.id}`, notes);
    setIsEditing(false);
    toast({
      title: "Document Updated",
      description: "Your notes and title have been saved.",
    });
  };

  const handleDownload = () => {
    const link = window.document.createElement("a");
    link.href = documentUrl;
    link.download = document.originalName;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  console.log('DocumentReader rendering - Document:', document);
  console.log('DocumentReader - fileType:', document.fileType);
  console.log('DocumentReader - isPDF check:', document.fileType?.toLowerCase() === 'pdf');

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="border-b bg-background p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEditing ? (
              <Input
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                className="text-lg font-semibold"
              />
            ) : (
              <h1 className="text-lg font-semibold truncate max-w-md" title={documentTitle}>
                {documentTitle}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{document.fileType.toUpperCase()}</Badge>
            <Badge variant="outline">{formatFileSize(document.fileSize)}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            <Edit3 className="h-4 w-4 mr-2" />
            {isEditing ? "Cancel" : "Edit"}
          </Button>
          
          {isEditing && (
            <Button size="sm" onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          )}
          
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
        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
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
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
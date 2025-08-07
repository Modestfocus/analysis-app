import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Document } from "@shared/schema";
import DocumentViewer from "./DocumentViewer";
import { PDFModalViewer } from "./PDFModalViewer";
import { ObjectUploader } from "./ObjectUploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DocumentGridProps {
  userId: string;
  onDocumentSelect?: (document: Document) => void;
  selectedDocument?: Document;
}

export function DocumentGrid({ userId, onDocumentSelect, selectedDocument }: DocumentGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [selectedDocumentForViewing, setSelectedDocumentForViewing] = useState<Document | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const { data: documentsResponse, isLoading } = useQuery({
    queryKey: ['/api/documents/user', userId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/documents/user/${userId}`);
      return await response.json();
    },
    enabled: !!userId,
  });

  const documents = (documentsResponse as any)?.documents || [];

  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await apiRequest('DELETE', `/api/documents/${documentId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents/user', userId] });
      toast({
        title: "Document deleted",
        description: "The document has been successfully removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGetUploadParameters = async () => {
    const response = await apiRequest('POST', '/api/documents/upload', { filename: 'document' });
    const data = await response.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
    };
  };

  const handleUploadComplete = async (result: any) => {
    if (result.successful && result.successful.length > 0) {
      for (const file of result.successful) {
        const uploadURL = file.uploadURL;
        const fileName = file.name;
        const fileSize = file.size;
        const fileType = file.type?.split('/')[1] || 'unknown';
        
        // Get meta fields from Uppy
        const description = file.meta?.description || '';
        const tags = file.meta?.tags ? file.meta.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];

        try {
          // Normalize the path from the upload URL
          const normalizedPath = uploadURL.split('?')[0].split('/').pop();
          
          await apiRequest('POST', '/api/documents', {
            userId,
            filename: normalizedPath,
            originalName: fileName,
            fileType,
            fileSize,
            filePath: `/documents/${normalizedPath}`,
            description: description || null,
            tags: tags.length > 0 ? tags : null,
          });
        } catch (error) {
          console.error('Error creating document record:', error);
          toast({
            title: "Upload Error",
            description: "File uploaded but failed to save record. Please try again.",
            variant: "destructive",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/documents/user', userId] });
      toast({
        title: "Upload successful",
        description: `${result.successful.length} document(s) uploaded successfully.`,
      });
    }
  };

  const filteredDocuments = documents.filter((doc: Document) =>
    doc.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with search and upload */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Documents</h3>
          <Badge variant="secondary">{documents.length}</Badge>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <ObjectUploader
            maxNumberOfFiles={5}
            maxFileSize={52428800} // 50MB
            allowedFileTypes={[
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'text/plain',
              'application/rtf'
            ]}
            onGetUploadParameters={handleGetUploadParameters}
            onComplete={handleUploadComplete}
            buttonClassName="shrink-0"
          >
            <Plus className="h-4 w-4 mr-2" />
            Upload
          </ObjectUploader>
        </div>
      </div>

      {/* Documents grid */}
      {filteredDocuments.length === 0 ? (
        <Card className="p-8 text-center">
          <CardContent className="space-y-4">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium mb-2">
                {searchTerm ? 'No documents found' : 'No documents uploaded'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Upload your first document to get started'}
              </p>
              {!searchTerm && (
                <ObjectUploader
                  maxNumberOfFiles={5}
                  maxFileSize={52428800}
                  allowedFileTypes={[
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'text/plain',
                    'application/rtf'
                  ]}
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Documents
                </ObjectUploader>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocuments.map((document: Document) => (
            <Card key={document.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer h-fit overflow-hidden border-border/50 hover:border-border bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 min-w-0" title={document.originalName}>
                  <FileText className="h-5 w-5 text-purple-600 shrink-0" />
                  <span className="truncate text-foreground font-semibold">{document.originalName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 overflow-hidden min-h-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground min-w-0">
                  <Badge variant="secondary" className="shrink-0">{document.fileType.toUpperCase()}</Badge>
                  <span className="truncate ml-2">{formatFileSize(document.fileSize)}</span>
                </div>
                
                {document.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {document.description}
                  </p>
                )}
                
                {document.tags && document.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {document.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {document.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{document.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                
                <div className="flex gap-2 pt-2 w-full mt-auto">
                  <Button 
                    size="sm" 
                    variant="default"
                    className="flex-1 text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white font-medium"
                    onClick={() => setSelectedDocumentForViewing(document)}
                  >
                    View Document
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="shrink-0 w-8 h-8 p-0 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                    onClick={() => deleteDocumentMutation.mutate(document.id)}
                    disabled={deleteDocumentMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* PDF Modal Viewer */}
      {selectedDocumentForViewing && (
        <PDFModalViewer
          document={selectedDocumentForViewing}
          onClose={() => setSelectedDocumentForViewing(null)}
        />
      )}
    </div>
  );
}
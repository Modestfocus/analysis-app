import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Document } from "@shared/schema";
import DocumentViewer from "./DocumentViewer";
import { DocumentReader } from "./DocumentReader";
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
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Left Panel - Document List */}
      <div className="w-80 flex flex-col border-r pr-4">
        {/* Header with search and upload */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Documents</h3>
            <Badge variant="secondary">{documents.length}</Badge>
          </div>
          
          <div className="relative">
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
            buttonClassName="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Upload
          </ObjectUploader>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-3">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </CardContent>
              </Card>
            ))
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-sm font-medium mb-2">
                {searchTerm ? 'No documents found' : 'No documents uploaded'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {searchTerm 
                  ? 'Try adjusting your search terms' 
                  : 'Upload your first document to get started'}
              </p>
            </div>
          ) : (
            filteredDocuments.map((document: Document) => (
              <Card 
                key={document.id} 
                className={`cursor-pointer transition-all hover:shadow-sm ${
                  selectedDocument?.id === document.id ? 'ring-2 ring-primary bg-primary/5' : ''
                }`}
                onClick={() => onDocumentSelect?.(document)}
              >
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium truncate flex-1 mr-2" title={document.originalName}>
                        {document.originalName}
                      </h4>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDocumentMutation.mutate(document.id);
                        }}
                        disabled={deleteDocumentMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {document.fileType.toUpperCase()}
                      </Badge>
                      <span>{formatFileSize(document.fileSize)}</span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      Uploaded {document.uploadedAt ? 
                        new Date(document.uploadedAt).toLocaleDateString() : 
                        'Unknown date'
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Document Preview */}
      <div className="flex-1 overflow-hidden">
        {selectedDocument ? (
          selectedDocument.fileType.toLowerCase() === 'pdf' ? (
            <div className="h-full border rounded-lg bg-gray-50 dark:bg-gray-900">
              <DocumentViewer fileUrl={`/documents/${selectedDocument.filename}`} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center border rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="text-center">
                <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Preview Not Available</h3>
                <p className="text-muted-foreground mb-4">
                  This file type cannot be previewed directly.
                </p>
                <Button variant="outline">
                  <a 
                    href={`/documents/${selectedDocument.filename}`} 
                    download={selectedDocument.originalName}
                    className="flex items-center"
                  >
                    Download to View
                  </a>
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center border rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Document Selected</h3>
              <p className="text-muted-foreground">
                Select a document from the list to preview it here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Document Reader Modal */}
      {selectedDocumentForViewing && (
        <DocumentReader
          document={selectedDocumentForViewing}
          onClose={() => setSelectedDocumentForViewing(null)}
        />
      )}
    </div>
  );
}
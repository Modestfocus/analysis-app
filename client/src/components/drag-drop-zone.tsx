import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CloudUpload, ChartBar } from "lucide-react";

interface DragDropZoneProps {
  onFilesSelected: (files: FileList) => void;
  className?: string;
  isLoading?: boolean;
  placeholder?: string;
}

export default function DragDropZone({ 
  onFilesSelected, 
  className, 
  isLoading = false,
  placeholder = "Click a timeframe above, then paste / drag-and-drop chart here"
}: DragDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const handleClick = useCallback(() => {
    if (isLoading) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) onFilesSelected(files);
    };
    input.click();
  }, [isLoading, onFilesSelected]);

  return (
    <div
      className={cn(
        "border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors cursor-pointer",
        isDragOver && "border-primary-400 bg-primary-50",
        isLoading && "opacity-50 cursor-not-allowed",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      {isLoading ? (
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-4"></div>
          <p className="text-lg font-medium text-gray-700 mb-2">Processing...</p>
          <p className="text-sm text-gray-500">Please wait while we analyze your chart</p>
        </div>
      ) : (
        <>
          <CloudUpload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            <ChartBar className="inline mr-2 h-5 w-5" />
            {placeholder}
          </p>
          <p className="text-sm text-gray-500">Supports PNG, JPG, GIF up to 10MB</p>
        </>
      )}
    </div>
  );
}

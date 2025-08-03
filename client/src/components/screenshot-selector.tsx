import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Camera } from 'lucide-react';
import html2canvas from 'html2canvas';

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ScreenshotSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onScreenshotCapture: (file: File) => void;
}

export default function ScreenshotSelector({ isOpen, onClose, onScreenshotCapture }: ScreenshotSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionArea | null>(null);
  const [previewSelection, setPreviewSelection] = useState<SelectionArea | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setIsSelecting(false);
      setSelection(null);
      setPreviewSelection(null);
    }
  }, [isOpen]);

  // Handle mouse events for area selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== overlayRef.current) return;
    
    const rect = overlayRef.current!.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    
    setIsSelecting(true);
    setSelection({
      startX,
      startY,
      endX: startX,
      endY: startY,
    });
    setPreviewSelection({
      startX,
      startY,
      endX: startX,
      endY: startY,
    });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selection) return;

    const rect = overlayRef.current!.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    setPreviewSelection({
      ...selection,
      endX,
      endY,
    });
  }, [isSelecting, selection]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !previewSelection) return;
    
    setIsSelecting(false);
    setSelection(previewSelection);
  }, [isSelecting, previewSelection]);

  // Calculate selection rectangle properties
  const getSelectionStyle = (sel: SelectionArea | null) => {
    if (!sel) return {};
    
    const left = Math.min(sel.startX, sel.endX);
    const top = Math.min(sel.startY, sel.endY);
    const width = Math.abs(sel.endX - sel.startX);
    const height = Math.abs(sel.endY - sel.startY);
    
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  // Capture the selected area
  const captureSelection = useCallback(async () => {
    if (!selection) return;

    try {
      // Hide the overlay temporarily
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.display = 'none';
      }

      // Wait a brief moment for the overlay to hide
      await new Promise(resolve => setTimeout(resolve, 100));

      // Calculate the actual screen coordinates
      const left = Math.min(selection.startX, selection.endX);
      const top = Math.min(selection.startY, selection.endY);
      const width = Math.abs(selection.endX - selection.startX);
      const height = Math.abs(selection.endY - selection.startY);

      // Capture the entire page
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: false,
        scale: 1,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
      });

      // Create a new canvas for the selected area
      const selectedCanvas = document.createElement('canvas');
      selectedCanvas.width = width;
      selectedCanvas.height = height;
      const ctx = selectedCanvas.getContext('2d');
      
      if (ctx) {
        // Draw the selected portion
        ctx.drawImage(
          canvas,
          left, top, width, height, // source rectangle
          0, 0, width, height       // destination rectangle
        );

        // Convert to blob and create file
        selectedCanvas.toBlob((blob) => {
          if (blob) {
            const timestamp = Date.now();
            const file = new File([blob], `screenshot-selection-${timestamp}.png`, {
              type: 'image/png',
              lastModified: timestamp,
            });
            
            onScreenshotCapture(file);
            onClose();
          }
        }, 'image/png', 0.9);
      }

    } catch (error) {
      console.error('Screenshot capture failed:', error);
      // Restore overlay if capture failed
      if (overlayRef.current) {
        overlayRef.current.style.display = 'block';
      }
    }
  }, [selection, onScreenshotCapture, onClose]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && selection) {
        captureSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selection, captureSelection, onClose]);

  if (!isOpen) return null;

  const displaySelection = previewSelection || selection;

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-[9999] bg-black bg-opacity-50 cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ userSelect: 'none' }}
    >
      {/* Instructions */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
            {!selection ? 'Click and drag to select an area' : 'Press Enter to capture or click Cancel'}
          </p>
        </div>
      </div>

      {/* Close button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800"
      >
        <X className="h-4 w-4 mr-1" />
        Cancel
      </Button>

      {/* Selection rectangle */}
      {displaySelection && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20 pointer-events-none"
          style={getSelectionStyle(displaySelection)}
        >
          {/* Selection info */}
          <div className="absolute -top-8 left-0 bg-blue-500 text-white px-2 py-1 rounded text-xs">
            {Math.abs(displaySelection.endX - displaySelection.startX)} × {Math.abs(displaySelection.endY - displaySelection.startY)}
          </div>
        </div>
      )}

      {/* Capture button */}
      {selection && !isSelecting && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <Button
            onClick={captureSelection}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Camera className="h-4 w-4 mr-2" />
            Capture Selection
          </Button>
        </div>
      )}
    </div>
  );
}
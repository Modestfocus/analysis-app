import { useEffect, useRef, useState } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import { Button } from "@/components/ui/button";
import { Syringe } from "lucide-react";

interface DocumentViewerProps {
    fileUrl: string;
    onTextInject?: (text: string) => void;
}

const DocumentViewer = ({ fileUrl, onTextInject }: DocumentViewerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [injectButton, setInjectButton] = useState<{
        show: boolean;
        text: string;
        x: number;
        y: number;
    }>({
        show: false,
        text: '',
        x: 0,
        y: 0
    });

    useEffect(() => {
        let selectionTimeout: NodeJS.Timeout;

        const handleSelectionChange = () => {
            // Clear any existing timeout
            if (selectionTimeout) {
                clearTimeout(selectionTimeout);
            }

            // Add a small delay to ensure selection is fully processed
            selectionTimeout = setTimeout(() => {
                console.log('Selection change detected');
                const selection = window.getSelection();
                
                if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                    console.log('No valid selection found');
                    setInjectButton(prev => ({ ...prev, show: false }));
                    return;
                }

                const selectedText = selection.toString().trim();
                console.log('Selected text:', selectedText);
                
                if (!selectedText || selectedText.length < 3) {
                    console.log('Selected text too short or empty');
                    setInjectButton(prev => ({ ...prev, show: false }));
                    return;
                }

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const containerRect = containerRef.current?.getBoundingClientRect();

                console.log('Selection rect:', rect);
                console.log('Container rect:', containerRect);

                if (!containerRect) {
                    console.log('No container rect found');
                    return;
                }

                // Position the button above the selection
                const x = rect.left + (rect.width / 2) - containerRect.left;
                const y = rect.top - containerRect.top - 45; // 45px above selection

                console.log('Button position:', { x, y });

                setInjectButton({
                    show: true,
                    text: selectedText,
                    x: Math.max(10, Math.min(x, containerRect.width - 100)), // Keep within bounds
                    y: Math.max(10, y) // Don't go above container
                });
            }, 200); // Increased delay for PDF rendering
        };

        const handleMouseUp = (event: MouseEvent) => {
            console.log('Mouse up event detected');
            // Use a longer delay for mouse up to ensure PDF text selection is complete
            setTimeout(handleSelectionChange, 300);
        };

        const handleDocumentClick = (event: MouseEvent) => {
            // If clicking outside the inject button, hide it
            const target = event.target as HTMLElement;
            if (!target.closest('[data-inject-button]')) {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed) {
                    setInjectButton(prev => ({ ...prev, show: false }));
                }
            }
        };

        // Listen for multiple events to catch PDF text selection
        document.addEventListener('selectionchange', handleSelectionChange);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('click', handleDocumentClick);

        // Also listen on the container specifically
        const container = containerRef.current;
        if (container) {
            container.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            if (selectionTimeout) {
                clearTimeout(selectionTimeout);
            }
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('click', handleDocumentClick);
            
            if (container) {
                container.removeEventListener('mouseup', handleMouseUp);
            }
        };
    }, []);

    const handleInjectText = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (injectButton.text && onTextInject) {
            onTextInject(injectButton.text);
        }
        
        // Clear the selection and hide the button
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
        }
        setInjectButton(prev => ({ ...prev, show: false }));
    };

    if (!fileUrl) {
        return <div>No file selected</div>;
    }

    return (
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <div ref={containerRef} style={{ height: '100vh', width: '100%', position: 'relative' }}>
                <Viewer fileUrl={fileUrl} />
                
                {/* Floating Inject Button */}
                {injectButton.show && (
                    <div
                        data-inject-button
                        style={{
                            position: 'fixed', // Changed to fixed for better positioning
                            left: `${injectButton.x + (containerRef.current?.getBoundingClientRect()?.left || 0)}px`,
                            top: `${injectButton.y + (containerRef.current?.getBoundingClientRect()?.top || 0)}px`,
                            zIndex: 99999, // Higher z-index
                            transform: 'translateX(-50%)',
                            pointerEvents: 'auto'
                        }}
                        className="animate-in fade-in-0 zoom-in-95 duration-200"
                    >
                        <Button
                            size="sm"
                            onClick={handleInjectText}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-2 shadow-xl border-2 border-blue-500 flex items-center gap-2 whitespace-nowrap font-medium"
                        >
                            <Syringe className="h-4 w-4" />
                            Inject Text
                        </Button>
                    </div>
                )}
                
                {/* Debug indicator - remove after testing */}
                {injectButton.show && (
                    <div 
                        style={{ 
                            position: 'fixed', 
                            top: '10px', 
                            right: '10px', 
                            background: 'red', 
                            color: 'white', 
                            padding: '4px 8px',
                            fontSize: '12px',
                            zIndex: 100000
                        }}
                    >
                        Button Active: {injectButton.text.substring(0, 20)}...
                    </div>
                )}
            </div>
        </Worker>
    );
};

export default DocumentViewer;
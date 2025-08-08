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
                const selection = window.getSelection();
                
                if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                    setInjectButton(prev => ({ ...prev, show: false }));
                    return;
                }

                const selectedText = selection.toString().trim();
                if (!selectedText || selectedText.length < 3) {
                    setInjectButton(prev => ({ ...prev, show: false }));
                    return;
                }

                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const containerRect = containerRef.current?.getBoundingClientRect();

                if (!containerRect) return;

                // Position the button above the selection
                const x = rect.left + (rect.width / 2) - containerRect.left;
                const y = rect.top - containerRect.top - 45; // 45px above selection

                setInjectButton({
                    show: true,
                    text: selectedText,
                    x: Math.max(10, Math.min(x, containerRect.width - 100)), // Keep within bounds
                    y: Math.max(10, y) // Don't go above container
                });
            }, 100);
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

        // Listen for selection changes
        document.addEventListener('selectionchange', handleSelectionChange);
        document.addEventListener('click', handleDocumentClick);

        return () => {
            if (selectionTimeout) {
                clearTimeout(selectionTimeout);
            }
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('click', handleDocumentClick);
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
                            position: 'absolute',
                            left: `${injectButton.x}px`,
                            top: `${injectButton.y}px`,
                            zIndex: 9999,
                            transform: 'translateX(-50%)'
                        }}
                        className="animate-in fade-in-0 zoom-in-95 duration-200"
                    >
                        <Button
                            size="sm"
                            onClick={handleInjectText}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs rounded-md px-3 py-1 shadow-lg border border-zinc-700 flex items-center gap-1.5 whitespace-nowrap"
                        >
                            <Syringe className="h-3 w-3" />
                            Inject
                        </Button>
                    </div>
                )}
            </div>
        </Worker>
    );
};

export default DocumentViewer;
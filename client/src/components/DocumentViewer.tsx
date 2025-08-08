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
        let checkInterval: NodeJS.Timeout;
        
        // Check for text selection periodically when viewer is loaded
        const startSelectionChecker = () => {
            checkInterval = setInterval(() => {
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

                // Check if the selection is within our PDF container
                const range = selection.getRangeAt(0);
                const containerElement = containerRef.current;
                
                if (!containerElement || !containerElement.contains(range.commonAncestorContainer)) {
                    setInjectButton(prev => ({ ...prev, show: false }));
                    return;
                }

                const rect = range.getBoundingClientRect();
                const containerRect = containerElement.getBoundingClientRect();

                console.log('Text selected:', selectedText);
                console.log('Selection rect:', rect);

                if (rect.width === 0 || rect.height === 0) {
                    return; // Invalid selection bounds
                }

                // Position the button above the selection (using page coordinates)
                const x = rect.left + (rect.width / 2);
                const y = rect.top - 50; // 50px above selection

                setInjectButton({
                    show: true,
                    text: selectedText,
                    x: Math.max(50, Math.min(x, window.innerWidth - 150)), // Keep within screen bounds
                    y: Math.max(10, y) // Don't go above viewport
                });
            }, 500); // Check every 500ms
        };

        // Start checking after a delay to let PDF load
        const initTimeout = setTimeout(startSelectionChecker, 2000);

        // Also listen for mouseup events as backup
        const handleMouseUp = () => {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) {
                    console.log('Mouse up with selection:', selection.toString());
                }
            }, 100);
        };

        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            if (initTimeout) {
                clearTimeout(initTimeout);
            }
            document.removeEventListener('mouseup', handleMouseUp);
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
                {/* Manual Test Button - for debugging */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1000 }}>
                    <Button
                        size="sm"
                        onClick={() => {
                            const testText = "Test text injection from PDF";
                            setInjectButton({ show: true, text: testText, x: 200, y: 100 });
                            console.log('Manual test triggered');
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs"
                    >
                        Test Inject
                    </Button>
                </div>
                
                <div
                    onMouseUp={() => {
                        console.log('Container mouseup detected');
                        setTimeout(() => {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                const text = selection.toString().trim();
                                if (text.length > 0) {
                                    console.log('Selection found:', text);
                                    setInjectButton({
                                        show: true,
                                        text: text,
                                        x: 300,
                                        y: 200
                                    });
                                }
                            } else {
                                console.log('No selection or selection collapsed');
                            }
                        }, 200);
                    }}
                    onContextMenu={(e) => {
                        // Right-click context menu - check for selection
                        setTimeout(() => {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                const text = selection.toString().trim();
                                console.log('Context menu with selection:', text);
                            }
                        }, 100);
                    }}
                >
                    <Viewer fileUrl={fileUrl} />
                </div>
                
                {/* Floating Inject Button */}
                {injectButton.show && (
                    <div
                        data-inject-button
                        style={{
                            position: 'fixed',
                            left: `${injectButton.x}px`,
                            top: `${injectButton.y}px`,
                            zIndex: 99999,
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
                
                {/* Debug indicator */}
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
                        Active: {injectButton.text.substring(0, 20)}...
                    </div>
                )}
            </div>
        </Worker>
    );
};

export default DocumentViewer;
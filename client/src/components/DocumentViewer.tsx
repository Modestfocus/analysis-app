import { useEffect, useRef, useState } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
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
    const defaultLayoutPluginInstance = defaultLayoutPlugin();
    
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
        
        // Disable periodic checking - rely only on mouseup events
        // The periodic checker was causing text truncation issues

        // Also listen for mouseup events as backup
        const handleMouseUp = () => {
            setTimeout(() => {
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed) {
                    const text = selection.toString();
                    if (text && text.trim().length > 2) {
                        const range = selection.getRangeAt(0);
                        const rect = range.getBoundingClientRect();
                        
                        setInjectButton({
                            show: true,
                            text: text,
                            x: rect.left + (rect.width / 2),
                            y: rect.top - 50
                        });
                    }
                }
            }, 100);
        };

        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleInjectText = (event: React.MouseEvent) => {
        event.stopPropagation();
        
        // Get fresh selection to ensure we have the complete text
        const selection = window.getSelection();
        let textToInject = injectButton.text;
        
        // If there's still an active selection, use that text directly
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const freshText = selection.toString();
            if (freshText && freshText.length > textToInject.length) {
                textToInject = freshText;
            }
        }
        
        if (textToInject && onTextInject) {
            onTextInject(textToInject);
        }
        
        // Clear the selection and hide the button
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
            <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative', overflow: 'auto' }}>
                <div
                    style={{ height: '100%', width: '100%' }}
                    onMouseUp={() => {
                        setTimeout(() => {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                const text = selection.toString();
                                if (text && text.trim().length > 0) {
                                    const range = selection.getRangeAt(0);
                                    const rect = range.getBoundingClientRect();
                                    
                                    setInjectButton({
                                        show: true,
                                        text: text,
                                        x: rect.left + (rect.width / 2),
                                        y: rect.top - 50
                                    });
                                }
                            }
                        }, 200);
                    }}
                    onContextMenu={(e) => {
                        // Right-click context menu - check for selection
                        setTimeout(() => {
                            const selection = window.getSelection();
                            if (selection && !selection.isCollapsed) {
                                const text = selection.toString().trim();
                            }
                        }, 100);
                    }}
                >
                    <Viewer 
                        fileUrl={fileUrl} 
                        plugins={[defaultLayoutPluginInstance]}
                    />
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
                

            </div>
        </Worker>
    );
};

export default DocumentViewer;
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

interface DocumentViewerProps {
    fileUrl: string;
}

const DocumentViewer = ({ fileUrl }: DocumentViewerProps) => {
    if (!fileUrl) {
        return <div>No file selected</div>;
    }

    return (
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
            <div style={{ height: '100vh', width: '100%' }}>
                <Viewer fileUrl={fileUrl} />
            </div>
        </Worker>
    );
};

export default DocumentViewer;
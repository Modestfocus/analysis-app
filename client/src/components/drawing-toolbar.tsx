import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import CustomDrawingPanel from './custom-drawing-panel';

interface DrawingTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: 'lines' | 'shapes' | 'annotations' | 'cursor';
}

interface DrawingToolbarProps {
  onToolSelect: (toolId: string) => void;
  selectedTool: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClearAll?: () => void;
  chartContainer?: HTMLElement | null;
}

export default function DrawingToolbar({ 
  onToolSelect, 
  selectedTool, 
  isCollapsed, 
  onToggleCollapse,
  onClearAll,
  chartContainer
}: DrawingToolbarProps) {
  const [isCustomPanelOpen, setIsCustomPanelOpen] = useState(false);

  return (
    <div className="fixed left-4 top-20 z-50">
      {/* Only the menu button to open drawing tools panel */}
      <Button
        variant="default"
        size="sm"
        onClick={() => setIsCustomPanelOpen(true)}
        className="h-10 w-10 p-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-800"
        title="Open Drawing Tools Panel"
      >
        <Menu className="h-4 w-4" />
      </Button>
      
      {/* Custom Drawing Panel */}
      <CustomDrawingPanel
        isOpen={isCustomPanelOpen}
        onClose={() => setIsCustomPanelOpen(false)}
        chartContainer={chartContainer || null}
        activeTool={selectedTool}
        onToolSelect={onToolSelect}
      />
    </div>
  );
}
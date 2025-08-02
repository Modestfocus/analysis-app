import { useState, useCallback } from 'react';

export interface ChartLayout {
  id: string;
  name: string;
  symbol: string;
  interval: string;
  timezone: string;
  theme: string;
  style: string;
  indicators: any[];
  drawings: any[];
  customDrawings: any[];
  savedAt: string;
}

export function useChartLayout() {
  const [layouts, setLayouts] = useState<ChartLayout[]>([]);

  const saveLayout = useCallback(async (
    name: string,
    symbol: string,
    customDrawings: any[] = []
  ): Promise<ChartLayout> => {
    const newLayout: ChartLayout = {
      id: `layout-${Date.now()}`,
      name,
      symbol,
      interval: "60",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      indicators: [], // Would be populated from TradingView widget
      drawings: [], // Would be populated from TradingView widget
      customDrawings, // Our custom canvas drawings
      savedAt: new Date().toISOString()
    };

    setLayouts(prev => [...prev, newLayout]);
    
    // In a real implementation, this would save to backend
    try {
      const response = await fetch('/api/chart-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLayout),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save layout');
      }
      
      return newLayout;
    } catch (error) {
      console.error('Error saving layout:', error);
      throw error;
    }
  }, []);

  const loadLayout = useCallback((layout: ChartLayout) => {
    console.log('Loading layout:', layout);
    
    // Return the custom drawings to be loaded
    return {
      symbol: layout.symbol,
      customDrawings: layout.customDrawings || [],
      settings: {
        interval: layout.interval,
        timezone: layout.timezone,
        theme: layout.theme,
        style: layout.style
      }
    };
  }, []);

  const deleteLayout = useCallback(async (layoutId: string) => {
    setLayouts(prev => prev.filter(layout => layout.id !== layoutId));
    
    // Delete from backend
    try {
      const response = await fetch(`/api/chart-layout/${layoutId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete layout');
      }
    } catch (error) {
      console.error('Error deleting layout:', error);
      throw error;
    }
  }, []);

  return {
    layouts,
    saveLayout,
    loadLayout,
    deleteLayout,
    setLayouts
  };
}
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { X, Lock, Eye, EyeOff, Trash2, Copy } from 'lucide-react';

interface DrawingSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDrawing: any; // In a real app, this would be a proper type
  onUpdateDrawing: (settings: any) => void;
  onDeleteDrawing: () => void;
  onDuplicateDrawing: () => void;
  onLockDrawing: (locked: boolean) => void;
  onToggleVisibility: (visible: boolean) => void;
}

const colorPresets = [
  '#000000', '#FF0000', '#00FF00', '#0000FF', 
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
  '#800080', '#008000', '#FFC0CB', '#A52A2A'
];

const lineStyles = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dash-dot', label: 'Dash-Dot' }
];

export default function DrawingSettingsPanel({
  isOpen,
  onClose,
  selectedDrawing,
  onUpdateDrawing,
  onDeleteDrawing,
  onDuplicateDrawing,
  onLockDrawing,
  onToggleVisibility
}: DrawingSettingsPanelProps) {
  const [color, setColor] = useState(selectedDrawing?.color || '#000000');
  const [thickness, setThickness] = useState(selectedDrawing?.thickness || [2]);
  const [lineStyle, setLineStyle] = useState(selectedDrawing?.lineStyle || 'solid');
  const [opacity, setOpacity] = useState(selectedDrawing?.opacity || [100]);
  const [isLocked, setIsLocked] = useState(selectedDrawing?.locked || false);
  const [isVisible, setIsVisible] = useState(selectedDrawing?.visible !== false);

  if (!isOpen) return null;

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    onUpdateDrawing({ ...selectedDrawing, color: newColor });
  };

  const handleThicknessChange = (newThickness: number[]) => {
    setThickness(newThickness);
    onUpdateDrawing({ ...selectedDrawing, thickness: newThickness[0] });
  };

  const handleLineStyleChange = (newStyle: string) => {
    setLineStyle(newStyle);
    onUpdateDrawing({ ...selectedDrawing, lineStyle: newStyle });
  };

  const handleOpacityChange = (newOpacity: number[]) => {
    setOpacity(newOpacity);
    onUpdateDrawing({ ...selectedDrawing, opacity: newOpacity[0] });
  };

  const handleLockToggle = () => {
    const newLocked = !isLocked;
    setIsLocked(newLocked);
    onLockDrawing(newLocked);
  };

  const handleVisibilityToggle = () => {
    const newVisible = !isVisible;
    setIsVisible(newVisible);
    onToggleVisibility(newVisible);
  };

  return (
    <div className="fixed right-4 top-20 z-50 w-80">
      <Card className="shadow-lg border-gray-200 dark:border-gray-700">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Drawing Settings
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedDrawing && (
            <Badge variant="outline" className="w-fit">
              {selectedDrawing.type || 'Drawing'}
            </Badge>
          )}
        </CardHeader>
        
        <CardContent className="p-4 space-y-4">
          {/* Color Settings */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-12 h-8 p-1 border rounded"
              />
              <Input
                type="text"
                value={color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="flex-1 text-sm"
                placeholder="#000000"
              />
            </div>
            
            {/* Color Presets */}
            <div className="grid grid-cols-6 gap-1">
              {colorPresets.map((preset) => (
                <button
                  key={preset}
                  className="w-8 h-8 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: preset }}
                  onClick={() => handleColorChange(preset)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* Line Thickness */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Thickness: {thickness[0]}px</Label>
            <Slider
              value={thickness}
              onValueChange={handleThicknessChange}
              max={10}
              min={1}
              step={1}
              className="w-full"
            />
          </div>

          {/* Line Style */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Line Style</Label>
            <Select value={lineStyle} onValueChange={handleLineStyleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lineStyles.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opacity */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Opacity: {opacity[0]}%</Label>
            <Slider
              value={opacity}
              onValueChange={handleOpacityChange}
              max={100}
              min={10}
              step={5}
              className="w-full"
            />
          </div>

          <Separator />

          {/* Drawing Actions */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Actions</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLockToggle}
                className="flex items-center gap-2"
              >
                <Lock className={`h-3 w-3 ${isLocked ? 'text-red-600' : ''}`} />
                {isLocked ? 'Unlock' : 'Lock'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleVisibilityToggle}
                className="flex items-center gap-2"
              >
                {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {isVisible ? 'Hide' : 'Show'}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={onDuplicateDrawing}
                className="flex items-center gap-2"
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
              
              <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteDrawing}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
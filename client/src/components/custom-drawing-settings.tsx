import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Palette } from "lucide-react";

interface DrawingStyle {
  color: string;
  thickness: number;
  lineStyle: 'solid' | 'dashed';
}

interface CustomDrawingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  drawingStyle: DrawingStyle;
  onStyleChange: (style: DrawingStyle) => void;
}

const colorOptions = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Black', value: '#000000' },
  { name: 'White', value: '#ffffff' }
];

export default function CustomDrawingSettings({
  isOpen,
  onClose,
  drawingStyle,
  onStyleChange
}: CustomDrawingSettingsProps) {
  const [localStyle, setLocalStyle] = useState<DrawingStyle>(drawingStyle);

  const handleColorChange = (color: string) => {
    const newStyle = { ...localStyle, color };
    setLocalStyle(newStyle);
    onStyleChange(newStyle);
  };

  const handleThicknessChange = (thickness: number[]) => {
    const newStyle = { ...localStyle, thickness: thickness[0] };
    setLocalStyle(newStyle);
    onStyleChange(newStyle);
  };

  const handleLineStyleChange = (lineStyle: 'solid' | 'dashed') => {
    const newStyle = { ...localStyle, lineStyle };
    setLocalStyle(newStyle);
    onStyleChange(newStyle);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-96 max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Drawing Settings
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Color Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Color</Label>
            <div className="grid grid-cols-5 gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    localStyle.color === color.value
                      ? 'border-gray-900 dark:border-gray-100 scale-110'
                      : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => handleColorChange(color.value)}
                  title={color.name}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">Selected:</Label>
              <div
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: localStyle.color }}
              />
              <span className="text-xs text-gray-500">{localStyle.color}</span>
            </div>
          </div>

          {/* Thickness */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Line Thickness: {localStyle.thickness}px
            </Label>
            <Slider
              value={[localStyle.thickness]}
              onValueChange={handleThicknessChange}
              max={10}
              min={1}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1px</span>
              <span>10px</span>
            </div>
          </div>

          {/* Line Style */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Line Style</Label>
            <Select value={localStyle.lineStyle} onValueChange={handleLineStyleChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Preview</Label>
            <div className="border rounded p-4 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
              <svg width="200" height="40">
                <line
                  x1="10"
                  y1="20"
                  x2="190"
                  y2="20"
                  stroke={localStyle.color}
                  strokeWidth={localStyle.thickness}
                  strokeDasharray={localStyle.lineStyle === 'dashed' ? '5,5' : 'none'}
                />
              </svg>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
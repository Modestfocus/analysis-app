import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { commonInstruments, sessions, type Session } from "@shared/schema";

interface InstrumentSelectorProps {
  selectedInstrument: string;
  selectedSession: Session | undefined;
  onInstrumentChange: (instrument: string) => void;
  onSessionChange: (session: Session | undefined) => void;
}

export default function InstrumentSelector({ 
  selectedInstrument, 
  selectedSession,
  onInstrumentChange, 
  onSessionChange 
}: InstrumentSelectorProps) {
  const [customInstrument, setCustomInstrument] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const handleInstrumentSelect = (value: string) => {
    if (value === "custom") {
      setUseCustom(true);
      onInstrumentChange("custom");
    } else {
      setUseCustom(false);
      onInstrumentChange(value);
    }
  };

  const handleCustomSubmit = () => {
    if (customInstrument.trim()) {
      onInstrumentChange(customInstrument.trim().toUpperCase());
      setUseCustom(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">
          Select Instrument:
        </Label>
        {!useCustom ? (
          <Select value={selectedInstrument} onValueChange={handleInstrumentSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose instrument..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect from filename</SelectItem>
              {commonInstruments.map((instrument) => (
                <SelectItem key={instrument} value={instrument}>
                  {instrument}
                </SelectItem>
              ))}
              <SelectItem value="custom">Enter custom instrument...</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex space-x-2">
            <Input
              placeholder="Enter instrument (e.g., XAUUSD)"
              value={customInstrument}
              onChange={(e) => setCustomInstrument(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleCustomSubmit} size="sm">
              Set
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setUseCustom(false)} 
              size="sm"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">
          Trading Session (optional):
        </Label>
        <Select value={selectedSession || "none"} onValueChange={(value) => onSessionChange(value === "none" ? undefined : value as Session)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select session..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No session</SelectItem>
            {sessions.map((session) => (
              <SelectItem key={session} value={session}>
                {session}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
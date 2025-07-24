import { Button } from "@/components/ui/button";
import type { Timeframe } from "@shared/schema";

interface TimeframeSelectorProps {
  selectedTimeframe: Timeframe;
  onTimeframeSelect: (timeframe: Timeframe) => void;
}

const timeframes: Timeframe[] = ["5M", "15M", "1H", "4H", "Daily"];

export default function TimeframeSelector({ selectedTimeframe, onTimeframeSelect }: TimeframeSelectorProps) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-3">Select Timeframe:</label>
      <div className="flex flex-wrap gap-2">
        {timeframes.map((timeframe) => (
          <Button
            key={timeframe}
            variant={selectedTimeframe === timeframe ? "default" : "secondary"}
            size="sm"
            onClick={() => onTimeframeSelect(timeframe)}
            className={selectedTimeframe === timeframe ? "bg-primary-500 hover:bg-primary-600" : ""}
          >
            {timeframe}
          </Button>
        ))}
      </div>
    </div>
  );
}

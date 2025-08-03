import html2canvas from 'html2canvas';

export interface ScreenshotOptions {
  filename?: string;
  quality?: number;
  backgroundColor?: string;
}

/**
 * Captures a screenshot of the TradingView chart area only
 * @param chartContainer The chart container element
 * @param options Screenshot configuration options
 * @returns Promise<File> The screenshot as a File object
 */
export async function captureChartScreenshot(
  chartContainer: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<File> {
  const {
    filename = `chart-screenshot-${Date.now()}.png`,
    quality = 1,
    backgroundColor = '#ffffff'
  } = options;

  try {
    // Create canvas from the chart container
    const canvas = await html2canvas(chartContainer, {
      backgroundColor,
      allowTaint: true,
      useCORS: true,
      scale: 1,
      scrollX: 0,
      scrollY: 0,
      width: chartContainer.offsetWidth,
      height: chartContainer.offsetHeight,
      ignoreElements: (element) => {
        // Ignore certain UI elements that shouldn't be in the screenshot
        const classesToIgnore = [
          'trading-panel',
          'watchlist-panel',
          'drawing-toolbar',
          'navbar',
          'sidebar'
        ];
        
        return classesToIgnore.some(className => 
          element.classList?.contains(className)
        );
      }
    });

    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], filename, {
            type: 'image/png',
            lastModified: Date.now()
          });
          resolve(file);
        } else {
          reject(new Error('Failed to create screenshot blob'));
        }
      }, 'image/png', quality);
    });
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    throw new Error(`Screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Finds the TradingView chart container element
 * @returns HTMLElement | null The chart container or null if not found
 */
export function findChartContainer(): HTMLElement | null {
  // Look for common TradingView container classes/ids
  const selectors = [
    '[id*="tradingview"]',
    '.tradingview-widget-container',
    '#tv-chart-container',
    '.chart-container'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
      return element;
    }
  }

  return null;
}
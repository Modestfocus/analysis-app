import html2canvas from 'html2canvas';

export interface ScreenshotOptions {
  filename?: string;
  quality?: number;
  backgroundColor?: string;
}

// Helper function for Screen Capture API
async function captureWithScreenAPI(chartContainer: HTMLElement, filename: string): Promise<File> {
  console.log('Attempting screen capture with getDisplayMedia API');
  
  try {
    // Request screen capture
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' }
    });
    
    // Create video element to capture frame
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();
    
    // Wait for video to load
    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });
    
    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    
    // Stop the stream
    stream.getTracks().forEach(track => track.stop());
    
    // Convert to blob and file
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], filename, { type: 'image/png' }));
        } else {
          reject(new Error('Failed to create screenshot blob'));
        }
      }, 'image/png');
    });
    
  } catch (error) {
    console.error('Screen capture failed:', error);
    throw new Error('User cancelled screen capture or browser does not support it');
  }
}

// Fallback method that creates a placeholder with instructions
async function captureWithFallbackMethod(
  chartContainer: HTMLElement, 
  filename: string, 
  backgroundColor: string, 
  quality: number
): Promise<File> {
  console.log('Using fallback method - creating instructional image');
  
  const canvas = document.createElement('canvas');
  canvas.width = chartContainer.offsetWidth || 800;
  canvas.height = chartContainer.offsetHeight || 600;
  
  const ctx = canvas.getContext('2d')!;
  
  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add instructional text
  ctx.fillStyle = '#333333';
  ctx.font = '24px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TradingView Chart Screenshot', canvas.width / 2, canvas.height / 2 - 60);
  
  ctx.font = '16px Arial, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('Due to browser security restrictions, TradingView charts', canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillText('cannot be automatically captured from iframes.', canvas.width / 2, canvas.height / 2);
  ctx.fillText('Please use your browser\'s screenshot tool or', canvas.width / 2, canvas.height / 2 + 40);
  ctx.fillText('the Screen Capture option above.', canvas.width / 2, canvas.height / 2 + 60);
  
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], filename, { type: 'image/png' }));
      } else {
        reject(new Error('Failed to create fallback screenshot'));
      }
    }, 'image/png', quality);
  });
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
    // Check if the container has an iframe (which won't capture properly)
    const iframe = chartContainer.querySelector('iframe[src*="tradingview"]');
    
    if (iframe) {
      console.log('Detected TradingView iframe - using alternative capture method');
      
      // For iframe content, we need to use a different approach
      // Try to use the modern Screen Capture API if available
      if ('getDisplayMedia' in navigator.mediaDevices) {
        return await captureWithScreenAPI(chartContainer, filename);
      } else {
        // Fallback: Capture the parent container area
        console.log('Screen Capture API not available, using fallback method');
        return await captureWithFallbackMethod(chartContainer, filename, backgroundColor, quality);
      }
    }

    console.log('Starting html2canvas capture with options:', {
      width: chartContainer.offsetWidth,
      height: chartContainer.offsetHeight,
      backgroundColor,
      element: chartContainer.tagName,
      className: chartContainer.className
    });

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
      foreignObjectRendering: true,
      logging: true, // Enable logging for debugging
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

    console.log('html2canvas capture completed. Canvas dimensions:', {
      width: canvas.width,
      height: canvas.height
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
  console.log('Looking for chart container...');
  
  // First try to find the parent container that wraps the iframe
  // This will capture the entire area including iframe content
  const parentSelectors = [
    '.tradingview-widget-container',
    '[id*="tradingview"]',
    '#tv-chart-container',
    '.chart-container'
  ];

  for (const selector of parentSelectors) {
    const element = document.querySelector(selector) as HTMLElement;
    console.log(`Checking parent selector "${selector}":`, element);
    if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
      // Check if it contains an iframe
      const iframe = element.querySelector('iframe[src*="tradingview"]');
      if (iframe) {
        console.log(`Found chart parent container with ${selector} (contains iframe):`, {
          width: element.offsetWidth,
          height: element.offsetHeight,
          element
        });
        return element;
      }
    }
  }

  // Fallback: try iframe selectors but we know these won't work for content
  const iframeSelectors = [
    'iframe[src*="tradingview"]',
    '.tradingview-widget-container__widget'
  ];
  
  for (const selector of iframeSelectors) {
    const element = document.querySelector(selector) as HTMLElement;
    console.log(`Checking iframe selector "${selector}":`, element);
    if (element && element.offsetWidth > 0 && element.offsetHeight > 0) {
      console.log(`Found iframe container with ${selector} (may be blank):`, {
        width: element.offsetWidth,
        height: element.offsetHeight,
        element
      });
      return element;
    }
  }

  console.log('No suitable chart container found');
  return null;
}
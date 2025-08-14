// server/services/chat/unifiedPrompt.ts
import fs from 'fs';
import path from 'path';

export type SimilarItem = {
  chart: {
    filename?: string;
    depthMapPath?: string;
    edgeMapPath?: string;
    gradientMapPath?: string;
    timeframe?: string | null;
    instrument?: string | null;
  };
  similarity?: number;
};

function filePathToDataUrl(filePath?: string): string | undefined {
  if (!filePath || typeof filePath !== 'string' || filePath.length === 0) {
    return undefined;
  }
  
  // If it's already a data URL, return as-is
  if (/^data:/i.test(filePath)) {
    return filePath;
  }
  
  // If it's an absolute HTTP URL, return as-is (though OpenAI may not be able to access Replit domains)
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  
  try {
    // Convert file path to absolute path - uploads are in server folder
    let absolutePath: string;
    if (filePath.startsWith('/uploads/')) {
      // File in uploads folder
      absolutePath = path.join(process.cwd(), 'server', filePath.slice(1));
    } else if (filePath.startsWith('/')) {
      // Other files (depth maps, etc.) might be in public folder
      absolutePath = path.join(process.cwd(), filePath.slice(1));
    } else {
      // Relative path
      absolutePath = path.join(process.cwd(), 'server', filePath);
    }
    
    console.log(`[IMG] Converting to data URL: ${filePath} -> ${absolutePath}`);
    
    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.warn(`🚨 Image file not found: ${absolutePath}`);
      return undefined;
    }
    
    // Read file and convert to base64
    const buffer = fs.readFileSync(absolutePath);
    const base64 = buffer.toString('base64');
    
    // Determine MIME type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'image/png'; // Default
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.log(`[IMG] ✅ Generated data URL - MIME: ${mimeType}, Size: ${buffer.length} bytes, Base64 length: ${base64.length}`);
    
    return dataUrl;
  } catch (error) {
    console.error(`❌ Error converting file to data URL: ${filePath}`, error);
    return undefined;
  }
}

export function buildUnifiedMessages(opts: {
  currentPromptText: string;   // dashboard Current Prompt
  injectText?: string;         // carries debugPromptId
  target: {
    filename?: string;
    depthMapPath?: string;
    edgeMapPath?: string;
    gradientMapPath?: string;
  };
  similars: SimilarItem[];
}) {
  const { currentPromptText, injectText, target, similars } = opts;

  // Safe system prompt with fallback
  const systemPrompt = (currentPromptText || '').trim() || "You are a financial chart analysis expert.";

  // Helper to safely add image URLs only when they're valid strings
  const pushImg = (url?: string) => {
    if (typeof url === 'string' && url.length > 0) {
      const convertedUrl = filePathToDataUrl(url);
      if (convertedUrl) {
        return { type: 'image_url', image_url: { url: convertedUrl, detail: 'high' } };
      }
    }
    return null;
  };

  // Convert target images to data URLs (OpenAI cannot access Replit domains externally)
  const targetImages: any[] = [];
  
  // Handle target filename - could be data URL, file path, or missing
  if (target.filename) {
    if (target.filename.startsWith('data:')) {
      // Direct data URL from frontend
      targetImages.push({ type: 'image_url', image_url: { url: target.filename, detail: 'high' } });
    } else {
      // File path - convert to data URL
      const converted = pushImg(`/uploads/${target.filename}`);
      if (converted) targetImages.push(converted);
    }
  }
  
  // Handle visual maps
  [target.depthMapPath, target.edgeMapPath, target.gradientMapPath].forEach(path => {
    const converted = pushImg(path);
    if (converted) targetImages.push(converted);
  });

  // Handle similar charts safely
  const similarImages: any[] = [];
  (similars || []).forEach(s => {
    const chart = s?.chart;
    if (!chart) return;
    
    // Add filename/original image if available
    const originalImg = pushImg(chart.filename ? `/uploads/${chart.filename}` : undefined);
    if (originalImg) similarImages.push(originalImg);
    
    // Add visual maps if available
    [chart.depthMapPath, chart.edgeMapPath, chart.gradientMapPath].forEach(path => {
      const converted = pushImg(path);
      if (converted) similarImages.push(converted);
    });
  });

  const system = { role: 'system', content: systemPrompt };

  // Build user message parts safely
  const userParts: any[] = [];
  userParts.push({ type: "text", text: "Analyze this chart." });

  // Add target images + maps only if they exist
  targetImages.forEach(img => userParts.push(img));
  similarImages.forEach(img => userParts.push(img));

  // injectText (from UI) goes into user text (not system) 
  if (injectText && typeof injectText === 'string' && injectText.trim().length > 0) {
    userParts.push({ type: "text", text: injectText });
  }

  const user = {
    role: 'user',
    content: userParts,
  };

  return [system, user];
}

export function logUnifiedPrompt(messages: any[]) {
  if (!process.env.DEBUG_UNIFIED_PROMPT) return;
  const sys = messages.find(m => m.role === 'system');
  const usr = messages.find(m => m.role === 'user');

  const sysText = typeof sys?.content === 'string' ? sys.content : sys?.content?.[0]?.text || '';
  const parts = Array.isArray(usr?.content) ? usr!.content : [{ type: 'text', text: usr?.content ?? '' }];
  const userText = parts.find((p: any) => p.type === 'text')?.text ?? '';
  const imgCount = parts.filter((p: any) => p.type === 'image_url').length;

  console.log('[PROMPT] System.len:', (sysText || '').length);
  console.log('[PROMPT] System.head:', (sysText || '').slice(0, 120));
  console.log('[PROMPT] Images total:', imgCount);
  console.log('[PROMPT] Has debugPromptId? ->', /"debugPromptId"\s*:\s*"/.test(userText));
}
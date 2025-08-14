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
  if (!filePath) return undefined;
  
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

  // Convert target images to data URLs (OpenAI cannot access Replit domains externally)
  const targetImages = [
    target.filename && { type: 'image_url', image_url: { url: filePathToDataUrl(`/uploads/${target.filename}`), detail: 'high' } },
    target.depthMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(target.depthMapPath), detail: 'high' } },
    target.edgeMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(target.edgeMapPath), detail: 'high' } },
    target.gradientMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(target.gradientMapPath), detail: 'high' } },
  ].filter(item => item && item.image_url.url) as any[];

  const similarImages: any[] = [];
  for (const { chart } of similars) {
    const images = [
      chart.filename && { type: 'image_url', image_url: { url: filePathToDataUrl(`/uploads/${chart.filename}`), detail: 'high' } },
      chart.depthMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(chart.depthMapPath), detail: 'high' } },
      chart.edgeMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(chart.edgeMapPath), detail: 'high' } },
      chart.gradientMapPath && { type: 'image_url', image_url: { url: filePathToDataUrl(chart.gradientMapPath), detail: 'high' } },
    ].filter(item => item && item.image_url.url);
    
    similarImages.push(...images);
  }

  const system = { role: 'system', content: currentPromptText };

  const userText = [
    'Analyze this chart.',
    injectText || '' // MUST include so "debugPromptId":"UP-123" reaches the model
  ].filter(Boolean).join('\n\n');

  const user = {
    role: 'user',
    content: [
      { type: 'text', text: userText },
      ...targetImages,
      ...similarImages,
    ],
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
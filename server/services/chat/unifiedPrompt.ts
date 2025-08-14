// server/services/chat/unifiedPrompt.ts
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

function toAbs(url?: string) {
  if (!url) return undefined;
  
  // Don't modify data URLs or absolute URLs
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) {
    return url;
  }
  
  // Generate proper absolute URL for Replit environment
  let base = process.env.PUBLIC_ASSETS_BASE;
  if (!base) {
    // Construct Replit domain URL
    const replSlug = process.env.REPL_SLUG;
    const replOwner = process.env.REPL_OWNER;
    if (replSlug && replOwner) {
      base = `https://${replSlug}.${replOwner}.repl.co`;
    } else {
      // Fallback to localhost for development
      base = `http://localhost:${process.env.PORT || 5000}`;
    }
  }
  
  const clean = url.startsWith('/') ? url : `/${url}`;
  return `${base}${clean}`;
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

  // target originals live under /uploads/<filename>
  const targetImages = [
    target.filename && { type: 'image_url', image_url: { url: toAbs(`/uploads/${target.filename}`), detail: 'high' } },
    target.depthMapPath && { type: 'image_url', image_url: { url: toAbs(target.depthMapPath), detail: 'high' } },
    target.edgeMapPath && { type: 'image_url', image_url: { url: toAbs(target.edgeMapPath), detail: 'high' } },
    target.gradientMapPath && { type: 'image_url', image_url: { url: toAbs(target.gradientMapPath), detail: 'high' } },
  ].filter(Boolean) as any[];

  const similarImages: any[] = [];
  for (const { chart } of similars) {
    if (chart.filename) similarImages.push({ type: 'image_url', image_url: { url: toAbs(`/uploads/${chart.filename}`), detail: 'high' } });
    if (chart.depthMapPath) similarImages.push({ type: 'image_url', image_url: { url: toAbs(chart.depthMapPath), detail: 'high' } });
    if (chart.edgeMapPath) similarImages.push({ type: 'image_url', image_url: { url: toAbs(chart.edgeMapPath), detail: 'high' } });
    if (chart.gradientMapPath) similarImages.push({ type: 'image_url', image_url: { url: toAbs(chart.gradientMapPath), detail: 'high' } });
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
import { getCurrentPrompt } from './system-prompt';

function toAbs(url?: string, req?: any) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  
  // Build absolute URL with proper domain
  const baseUrl = process.env.APP_BASE_URL || 
    (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:5000');
  
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function buildUnifiedMessages({
  currentPromptText,          // the "Current Prompt" from dashboard
  injectText,                 // e.g. 'Always include "debugPromptId":"UP-123" ...'
  target,                     // { filename, depthMapPath, edgeMapPath, gradientMapPath }
  similars,                   // array of { chart: { filename, depthMapPath, edgeMapPath, gradientMapPath, ... }, similarity }
  req,                        // request object for building absolute URLs
}: {
  currentPromptText: string;
  injectText?: string;
  target: { filename?: string; depthMapPath?: string; edgeMapPath?: string; gradientMapPath?: string; };
  similars: Array<{ chart: { filename?: string; depthMapPath?: string; edgeMapPath?: string; gradientMapPath?: string; timeframe?: string|null; instrument?: string|null }, similarity?: number }>;
  req?: any;
}) {
  // Build absolute URLs, including ORIGINAL chart images
  const targetOriginal = target.filename ? toAbs(`/uploads/${target.filename}`, req) : undefined;
  const imageParts: any[] = [
    ...(targetOriginal ? [{ type: 'image_url', image_url: { url: targetOriginal, detail: 'high' } }] : []),
    ...(target.depthMapPath ? [{ type: 'image_url', image_url: { url: toAbs(target.depthMapPath, req), detail: 'high' } }] : []),
    ...(target.edgeMapPath ? [{ type: 'image_url', image_url: { url: toAbs(target.edgeMapPath, req), detail: 'high' } }] : []),
    ...(target.gradientMapPath ? [{ type: 'image_url', image_url: { url: toAbs(target.gradientMapPath, req), detail: 'high' } }] : []),
  ];

  for (const { chart } of similars) {
    const simOriginal = chart.filename ? toAbs(`/uploads/${chart.filename}`, req) : undefined;
    if (simOriginal) imageParts.push({ type: 'image_url', image_url: { url: simOriginal, detail: 'high' } });
    if (chart.depthMapPath) imageParts.push({ type: 'image_url', image_url: { url: toAbs(chart.depthMapPath, req), detail: 'high' } });
    if (chart.edgeMapPath) imageParts.push({ type: 'image_url', image_url: { url: toAbs(chart.edgeMapPath, req), detail: 'high' } });
    if (chart.gradientMapPath) imageParts.push({ type: 'image_url', image_url: { url: toAbs(chart.gradientMapPath, req), detail: 'high' } });
  }

  const system: any = { role: 'system', content: currentPromptText };

  const userText = [
    'Analyze this chart.',
    // Include your dynamic bullet points / metadata if you have them…
    injectText || '', // <<<<<< VERY IMPORTANT: this is where "debugPromptId":"UP-123" gets injected
  ].filter(Boolean).join('\n\n');

  const user: any = {
    role: 'user',
    content: [
      { type: 'text', text: userText },
      ...imageParts,
    ],
  };

  return [system, user];
}

export function logUnifiedPrompt(messages: any[]) {
  if (!process.env.DEBUG_UNIFIED_PROMPT) return;
  const sys = messages.find(m => m.role === 'system');
  const usr = messages.find(m => m.role === 'user');

  const sysText = typeof sys?.content === 'string' ? sys.content : (sys?.content?.[0]?.text ?? '');
  const usrContent = Array.isArray(usr?.content) ? usr.content : [{ type: 'text', text: usr?.content ?? '' }];
  const usrTextPart = usrContent.find((c: any) => c.type === 'text')?.text ?? '';
  const imgCount = usrContent.filter((c: any) => c.type === 'image_url').length;
  const imgUrls = usrContent.filter((c: any) => c.type === 'image_url').map((c: any) => c.image_url?.url);

  console.log('[PROMPT] System.len:', sysText?.length ?? 0);
  console.log('[PROMPT] System.head:', (sysText || '').slice(0, 120));
  console.log('[PROMPT] Images total:', imgCount);
  console.log('[PROMPT] Image URLs:', imgUrls.slice(0, 3).join(', '), imgCount > 3 ? `... and ${imgCount - 3} more` : '');
  console.log('[PROMPT] Has debugPromptId? ->', /"debugPromptId"\s*:\s*"/.test(usrTextPart));
}
/**
 * System prompt management utilities
 * Handles merging default prompt with injected text
 */

const DEFAULT_PROMPT = "You are an expert trading chart analyst. Analyze the provided chart with precision and provide detailed technical insights including support/resistance levels, trend analysis, and potential trading opportunities.";

/**
 * Get the current prompt from the request context or fallback to default
 * The frontend sends the current prompt via systemPrompt parameter
 */
export async function getCurrentPrompt(systemPrompt?: string): Promise<string> {
  try {
    // Use the systemPrompt from request if provided, otherwise fallback to default
    if (systemPrompt && systemPrompt.trim()) {
      return systemPrompt.trim();
    }
    
    // Fallback to default prompt
    return DEFAULT_PROMPT;
  } catch (error) {
    console.warn('Failed to get current prompt, using default:', error);
    return DEFAULT_PROMPT;
  }
}

/**
 * Get the merged system prompt from database/storage or fallback to default
 * This mimics the frontend localStorage behavior but for backend use
 */
export async function getSystemPromptMergedFromDB(): Promise<string> {
  try {
    // TODO: In a real implementation, this would fetch from a database or user preferences
    // For now, return the default prompt
    return DEFAULT_PROMPT;
  } catch (error) {
    console.warn('Failed to get system prompt from DB, using default:', error);
    return DEFAULT_PROMPT;
  }
}

/**
 * Merge default prompt with inject text
 */
export function mergeSystemPrompt(defaultPrompt: string, injectText?: string): string {
  if (!injectText?.trim()) {
    return defaultPrompt;
  }
  return `${defaultPrompt}\n\n${injectText}`;
}

/**
 * Parse a merged prompt back into default and inject parts
 */
export function parseSystemPrompt(mergedPrompt: string, defaultPrompt: string): { defaultPrompt: string; injectText: string } {
  if (mergedPrompt.startsWith(defaultPrompt)) {
    const remaining = mergedPrompt.substring(defaultPrompt.length);
    const injectText = remaining.startsWith('\n\n') ? remaining.substring(2) : remaining;
    return { defaultPrompt, injectText };
  }
  return { defaultPrompt: mergedPrompt, injectText: '' };
}
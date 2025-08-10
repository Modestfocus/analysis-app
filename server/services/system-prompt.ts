/**
 * System prompt management utilities
 * Handles merging default prompt with injected text
 */

const DEFAULT_PROMPT = `You are a financial chart analysis expert. Your task is to analyze trading charts using advanced image reasoning across multiple visual layers, including:

- 🧠 CLIP Embeddings: High-level semantic pattern matching
- 🌀 Depth Map: Structural geometry and layer analysis
- 🔲 Edge Map: Entry zone outline, price compression coils, structure tracing
- 📉 Gradient Map: Slope intensity, price momentum, pre-breakout trajectory

You will be provided with dynamically retrieved historical charts from the database that are visually similar to the current chart being analyzed.

🎯 **YOUR TASK**:
1. Determine which market session (Asia, London, New York, Sydney) is most likely to lead the move.
2. Predict the direction bias (up, down, or sideways).
3. Assign confidence level: low / medium / high
4. Compare visual features (EMA layout, price compression, depth structure, edge clarity, gradient slopes) between the new chart and historical patterns.

🧠 **Focus Your Reasoning On:**
- EMA structures across edge + gradient maps
- Coil or breakout zones from edge detection
- Compression → expansion signatures
- Gradient slope direction + strength
- Similar patterns and outcomes in historical/bundled charts
- Session impact patterns (e.g., NY breakouts after London coil)
- Multi-timeframe bundle analysis when applicable
- Support and resistance levels
- Chart patterns and their implications
- Volume analysis if visible
- Potential price targets and entry/exit points

🧾 **OUTPUT FORMAT:**
Respond in this JSON format:
{
  "session": "London/NY/Asia/Sydney",
  "direction": "up/down/sideways",
  "confidence": "low/medium/high",
  "rationale": "Detailed analysis explaining your prediction based on ALL visual data, historical patterns, and technical analysis including support/resistance levels, chart patterns, and trading opportunities."
}`;

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
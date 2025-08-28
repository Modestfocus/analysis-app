import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { buildUnifiedPrompt, ChartMaps } from './prompt-builder';
import { getCurrentPrompt } from './system-prompt';
import { logUnifiedPromptDebugOnce } from './chat/unifiedPromptDebug';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// --- local helpers for turning same-origin URLs into OpenAI image parts ---
const SERVER_ROOT_DIR = path.join(process.cwd(), "server");

function guessMimeFromUrl(u: string) {
  const ext = path.extname(u).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function sameOriginPathToDisk(u: string): string | null {
  // Strip configured base, if present
  const bases = [process.env.APP_BASE_URL, process.env.PUBLIC_BASE_URL].filter(Boolean) as string[];
  for (const base of bases) {
    if (u.startsWith(base)) {
      u = u.slice(base.length);
      break;
    }
  }
  // Accept server-relative paths only
  if (!u.startsWith("/")) return null;

  if (u.startsWith("/uploads/"))      return path.join(SERVER_ROOT_DIR, "uploads",      u.replace(/^\/uploads\//, ""));
  if (u.startsWith("/depthmaps/"))    return path.join(SERVER_ROOT_DIR, "depthmaps",    u.replace(/^\/depthmaps\//, ""));
  if (u.startsWith("/edgemaps/"))     return path.join(SERVER_ROOT_DIR, "edgemaps",     u.replace(/^\/edgemaps\//, ""));
  if (u.startsWith("/gradientmaps/")) return path.join(SERVER_ROOT_DIR, "gradientmaps", u.replace(/^\/gradientmaps\//, ""));
  return null;
}

async function toImagePartFromUrl(u?: string | null, req?: any) {
  if (!u) return null;
  // Normalize to absolute URL if the caller gave us a relative path
  const { toAbsoluteUrl } = await import("./visual-maps");
  const abs = toAbsoluteUrl(u, req);

  // If it's our own origin/static file, embed as data URL (faster, avoids external fetch)
  const localPath = sameOriginPathToDisk(abs) || sameOriginPathToDisk(u);
  if (localPath) {
    try {
      await fs.promises.access(localPath);
      const mime = guessMimeFromUrl(localPath);
      const buf = await fs.promises.readFile(localPath);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      return { type: "image_url", image_url: { url: dataUrl } } as const;
    } catch {
      // Fall through to URL mode if file missing
    }
  }

  // Otherwise let OpenAI fetch the absolute URL directly
  return { type: "image_url", image_url: { url: abs } } as const;
}

function pushIf<T>(arr: T[], v: T | null | undefined) {
  if (v) arr.push(v);
}

export interface AnalysisResult {
  analysis: string;
  confidence: number;
  trends: string[];
  patterns: string[];
}

export interface ChartPrediction {
  prediction: string;
  session: string;
  confidence: "Low" | "Medium" | "High";
  reasoning: string;
}

export interface MultiChartData {
  original: string; // base64
  depth?: string; // base64
  edge?: string; // base64  
  gradient?: string; // base64
  embedding?: number[]; // CLIP embedding for quick analysis
  similarCharts?: Array<{ chart: any; similarity: number }>; // Similar charts for RAG context
  metadata: {
    id: number;
    filename: string;
    originalName: string;
    timeframe: string;
    instrument: string;
    session?: string;
  };
}

export async function analyzeMultipleChartsWithAllMaps(
  charts: MultiChartData[],
  similarCharts: Array<{ 
    chart: any; 
    similarity: number;
  }> = [],
  customSystemPrompt?: string,
  req?: any
): Promise<ChartPrediction> {
  try {
    console.log(`🔍 Starting multi-chart analysis for ${charts.length} charts`);
    console.log(`[CHAT] Building unified prompt for multi-chart analysis`);

    // Get base prompt from dashboard or use custom/default
    const basePrompt = await getCurrentPrompt(customSystemPrompt);
    
    // Helper to build absolute URLs
    const { toAbsoluteUrl } = await import('./visual-maps');
    
    // Build target chart data (use first chart as primary target)
    const target: ChartMaps = {
      originalPath: toAbsoluteUrl(`/uploads/${charts[0].metadata.filename}`, req) || charts[0].metadata.filename,
      depthMapPath: charts[0].depth ? `/temp/depth_${charts[0].metadata.id}.png` : null,
      edgeMapPath: charts[0].edge ? `/temp/edge_${charts[0].metadata.id}.png` : null,
      gradientMapPath: charts[0].gradient ? `/temp/gradient_${charts[0].metadata.id}.png` : null,
      instrument: charts[0].metadata.instrument,
      timeframe: charts[0].metadata.timeframe,
      similarity: null,
      id: charts[0].metadata.id,
      filename: charts[0].metadata.originalName,
    };

    // Build similar charts data with absolute URLs
    const similars: ChartMaps[] = similarCharts.slice(0, 3).map(item => ({
      originalPath: toAbsoluteUrl(`/uploads/${item.chart.filename}`, req) || item.chart.filename,
      depthMapPath: toAbsoluteUrl(item.chart.depthMapPath, req),
      edgeMapPath: toAbsoluteUrl(item.chart.edgeMapPath, req),
      gradientMapPath: toAbsoluteUrl(item.chart.gradientMapPath, req),
      instrument: item.chart.instrument,
      timeframe: item.chart.timeframe,
      similarity: item.similarity,
      id: item.chart.id,
      filename: item.chart.filename,
    }));

    // Build unified prompt
const unifiedPrompt = buildUnifiedPrompt(basePrompt, target, similars);

// Extract target metadata for logging
const targetTimeframe = target?.timeframe ?? "UNKNOWN";
const targetInstrument = target?.instrument ?? "UNKNOWN";

console.log(
  `[CHAT] unifiedPrompt chars: ${unifiedPrompt.length} target: ${targetInstrument}/${targetTimeframe} similars: ${similars.length}`
);

// ---------- Build rich content (images + maps) ----------
const contentParts: any[] = [];

// Intro cue
contentParts.push({
  type: "text",
  text: `Analyze these ${charts.length} chart(s) as a unified multi-timeframe view. Target includes original + depth + edge + gradient; similars include original only.`,
});

// Target (original + maps)
pushIf(contentParts, await toImagePartFromUrl(target.originalPath, req));
pushIf(contentParts, await toImagePartFromUrl(target.depthMapPath || undefined, req));
pushIf(contentParts, await toImagePartFromUrl(target.edgeMapPath || undefined, req));
pushIf(contentParts, await toImagePartFromUrl(target.gradientMapPath || undefined, req));

// Similars (each: original + maps)
if (similars.length) {
  contentParts.push({
    type: "text",
    text: `SIMILARS=${similars.length} (each similar shows: original → depth → edge → gradient when available)`,
  });
  for (const s of similars) {
    contentParts.push({ type: "text", text: `Similar: #${s.id} (${s.instrument ?? "?"}, ${s.timeframe ?? "?"})` });
    pushIf(contentParts, await toImagePartFromUrl(s.originalPath, req));
    pushIf(contentParts, await toImagePartFromUrl(s.depthMapPath || undefined, req));
    pushIf(contentParts, await toImagePartFromUrl(s.edgeMapPath || undefined, req));
    pushIf(contentParts, await toImagePartFromUrl(s.gradientMapPath || undefined, req));
  }
}

// Debug logging (keep this for parity)
const messages = [
  { role: "system" as const, content: unifiedPrompt },
  { role: "user" as const, content: contentParts as any },
];

logUnifiedPromptDebugOnce("multi-chart-analysis", messages);

// ---------- OpenAI call (JSON response) ----------
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  max_tokens: 1000,
  temperature: 0.1,
  response_format: { type: "json_object" },
});

    console.log("✅ Received OpenAI response");
    const rawResponse = response.choices[0].message.content;
    console.log("📄 Response length:", rawResponse?.length, "characters");

    if (!rawResponse) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    console.log("🔍 DEBUG - Raw GPT Response:", rawResponse);
    const cleanedResponse = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsedResponse: ChartPrediction;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
      console.log("✅ Successfully parsed GPT response");
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError);
      console.log("🔍 Attempting to extract prediction from text...");

      // Fallback parsing
      parsedResponse = {
        prediction: rawResponse.toLowerCase().includes('up') ? 'Up' : 
                   rawResponse.toLowerCase().includes('down') ? 'Down' : 'Sideways',
        session: rawResponse.toLowerCase().includes('london') ? 'London' :
                rawResponse.toLowerCase().includes('new york') ? 'NY' :
                rawResponse.toLowerCase().includes('asia') ? 'Asia' : 'Sydney',
        confidence: rawResponse.toLowerCase().includes('high') ? 'High' :
                   rawResponse.toLowerCase().includes('low') ? 'Low' : 'Medium',
        reasoning: rawResponse.slice(0, 500) + "..."
      };
    }

    return parsedResponse;

  } catch (error) {
    console.error("❌ Error in multi-chart analysis:", error);
    throw error;
  }
}

export async function analyzeChartWithRAG(
  chartImagePath: string,
  depthMapPath: string | null,
  similarCharts: Array<{ 
    chart: any; 
    similarity: number;
    depthMapPath?: string;
  }> = [],
  customSystemPrompt?: string
): Promise<ChartPrediction> {
  try {
    console.log("🔍 Starting analyzeChartWithRAG function");
    // Read and encode the main chart image
    const imageBuffer = fs.readFileSync(chartImagePath);
    const base64Image = imageBuffer.toString('base64');
    console.log("📸 Main image size:", Math.round(imageBuffer.length / 1024), "KB, Base64 length:", base64Image.length);

    // Read depth map if available
    let base64DepthMap = null;
    if (depthMapPath && fs.existsSync(path.join(process.cwd(), 'server', depthMapPath))) {
      const depthBuffer = fs.readFileSync(path.join(process.cwd(), 'server', depthMapPath));
      base64DepthMap = depthBuffer.toString('base64');
    }

    // Build RAG context from similar charts
    let ragContext = "";
    if (similarCharts.length > 0) {
      ragContext = "\nHere are 3 similar historical charts and their patterns:\n\n";
      similarCharts.slice(0, 3).forEach((item, index) => {
        const chart = item.chart;
        ragContext += `${index + 1}. Chart ID ${chart.id} (${chart.instrument}, ${chart.timeframe})\n`;
        ragContext += `   - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
        ragContext += `   - Session: ${chart.session || 'Unknown'}\n`;
        ragContext += `   - Uploaded: ${new Date(chart.uploadedAt).toLocaleDateString()}\n`;
        if (chart.comment) {
          ragContext += `   - Previous outcome: ${chart.comment}\n`;
        }
        if (item.depthMapPath) {
          ragContext += `   - Has depth map analysis available\n`;
        }
        ragContext += "\n";
      });
    }

    // Build the comprehensive prompt with full visual stack - use custom prompt if provided
    let baseSystemPrompt;
    if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
      // When using custom prompt, ensure it includes JSON output requirement
      baseSystemPrompt = customSystemPrompt;
      if (!customSystemPrompt.includes('JSON') && !customSystemPrompt.includes('json')) {
        baseSystemPrompt += `\n\n🧾 **OUTPUT FORMAT:**
Respond ONLY in this exact JSON format:
\`\`\`json
{
  "session": "London",
  "direction": "up", 
  "confidence": "high",
  "rationale": "Your detailed analysis reasoning here..."
}
\`\`\``;
      }
      console.log('✅ Using custom system prompt with JSON format enforcement');
    } else {
      baseSystemPrompt = `You are a financial chart analysis expert. Your task is to analyze a new trading chart using advanced image reasoning across multiple visual layers, including:

- 🧠 CLIP Embeddings: High-level semantic pattern matching
- 🌀 Depth Map: Structural geometry and layer analysis
- 🔲 Edge Map: Entry zone outline, price compression coils, structure tracing
- 📉 Gradient Map: Slope intensity, price momentum, pre-breakout trajectory

You will also be provided with a dynamically retrieved list of the top 3 most visually similar historical charts from the database, which may either be standalone charts or part of multi-timeframe bundles.

---

🆕 **New Chart for Analysis:**
- Chart Image: [base64 input]
- Depth Map: ${base64DepthMap ? '[base64 input]' : 'Not available'}
- Edge Map: [base64 input]
- Gradient Map: [base64 input]
- Instrument: Unknown (infer visually if possible)
- Timeframe: Unknown (infer visually if possible)

---

📚 **Historical Chart Context:**
For each similar chart, you will be provided:

📊 Similar Chart #1:
- Image: /uploads/{filename}
- Depth Map: {path or "Not available"}
- Edge Map: {path or "Not available"}
- Gradient Map: {path or "Not available"}
- Instrument: {instrument}
- Timeframe: {timeframe}
- Session: {session or "Unknown"}
- CLIP Similarity: {similarity score}%
- Outcome: {comment or "Not recorded"}

📦 Bundle for Chart #2:
- Charts across: [e.g., 15m, 1h, 4h]
- Each image includes Depth, Edge, and Gradient maps
- Instrument: {instrument}
- Session: {session or "Unknown"}
- CLIP Similarity: {similarity score}%
- Outcome Summary: {analysis outcome or "Not recorded"}

${ragContext}

---

🎯 **YOUR TASK**:
1. Determine which market session (Asia, London, New York) is most likely to lead the move.
2. Predict the direction bias (up, down, or unclear).
3. Assign confidence level: low / medium / high
4. In the rationale, compare the visual features (EMA layout, price compression, depth structure, edge clarity, gradient slopes) between the new chart and historical patterns.

---

🧠 **Focus Your Reasoning On:**
- EMA structures across edge + gradient maps
- Coil or breakout zones from edge detection
- Compression → expansion signatures
- Gradient slope direction + strength
- Similar patterns and outcomes in historical/bundled charts
- Session impact patterns (e.g., NY breakouts after London coil)`;
    }


    let systemPrompt = `${baseSystemPrompt}

---

🧾 **OUTPUT FORMAT:**
Respond with a JSON object containing these exact fields:
{
  "prediction": "Your market behavior prediction",
  "session": "Most likely session", 
  "confidence": "Low/Medium/High",
  "reasoning": "Detailed explanation of your analysis including pattern recognition and historical context"
}`;

    const prompt = systemPrompt;

    const messageContent: any[] = [
      {
        type: "text",
        text: prompt,
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
        },
      }
    ];

    // Add depth map if available
    if (base64DepthMap) {
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64DepthMap}`,
        },
      });
    }

    console.log("📡 Making OpenAI API call with", messageContent.length, "content parts...");
    console.log("📄 Prompt length:", prompt.length, "characters");

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    console.log("✅ Received OpenAI response");
    const analysisText = response.choices[0].message.content || "";
    console.log("📄 Response length:", analysisText.length, "characters");

    try {
      console.log("🔍 DEBUG - Raw GPT Response:", analysisText);      
      const parsedResult = JSON.parse(analysisText) as ChartPrediction;

      // Validate the response format
      if (!parsedResult.prediction || !parsedResult.session || !parsedResult.confidence || !parsedResult.reasoning) {
        console.error("❌ Missing required fields in GPT response:", parsedResult);
        throw new Error("Invalid response format from GPT");
      }

      // Ensure confidence is one of the expected values
      if (!["Low", "Medium", "High"].includes(parsedResult.confidence)) {
        console.log("⚠️ Invalid confidence level, defaulting to Medium:", parsedResult.confidence);
        parsedResult.confidence = "Medium";
      }

      console.log("✅ Successfully parsed GPT response");
      return parsedResult;
    } catch (parseError) {
      console.error("❌ Failed to parse GPT response:", analysisText);
      console.error("❌ Parse error:", parseError);
      throw new Error("Invalid JSON response from GPT analysis");
    }

  } catch (error) {
    console.error("❌ GPT RAG analysis error:", error);
    if (error instanceof Error) {
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);
    }
    throw new Error(`Chart analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function analyzeChartWithGPT(
  chartImagePath: string,
  similarCharts: Array<{ chart: any; similarity: number }> = []
): Promise<AnalysisResult> {
  try {
    // Read and encode the chart image
    const imageBuffer = fs.readFileSync(chartImagePath);
    const base64Image = imageBuffer.toString('base64');

    // Build context from similar charts
    let similarChartsContext = "";
    if (similarCharts.length > 0) {
      similarChartsContext = "\n\nSimilar historical charts for context:\n";
      similarCharts.forEach((item, index) => {
        const chart = item.chart;
        similarChartsContext += `${index + 1}. Chart from ${chart.uploadedAt} (${chart.instrument}, ${chart.timeframe}) - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
        if (chart.comment) {
          similarChartsContext += `   Previous analysis: ${chart.comment}\n`;
        }
      });
    }

    // Build the comprehensive prompt with full visual stack
    let systemPrompt = `You are a financial chart analysis expert. Your task is to analyze a new trading chart using advanced image reasoning across multiple visual layers, including:

- 🧠 CLIP Embeddings: High-level semantic pattern matching
- 🌀 Depth Map: Structural geometry and layer analysis
- 🔲 Edge Map: Entry zone outline, price compression coils, structure tracing
- 📉 Gradient Map: Slope intensity, price momentum, pre-breakout trajectory

You will also be provided with a dynamically retrieved list of the top 3 most visually similar historical charts from the database, which may either be standalone charts or part of multi-timeframe bundles.

---

🆕 **New Chart for Analysis:**
- Chart Image: [base64 input]
- Depth Map: Not available
- Edge Map: [base64 input]
- Gradient Map: [base64 input]
- Instrument: Unknown (infer visually if possible)
- Timeframe: Unknown (infer visually if possible)

---

📚 **Historical Chart Context:**
${similarChartsContext}

🎯 **YOUR TASK**:
1. Determine which market session (Asia, London, New York) is most likely to lead the move.
2. Predict the direction bias (up, down, or unclear).
3. Assign confidence level: low / medium / high
4. In the rationale, compare the visual features (EMA layout, price compression, depth structure, edge clarity, gradient slopes) between the new chart and historical patterns.

---

🧠 **Focus Your Reasoning On:**
- EMA structures across edge + gradient maps
- Coil or breakout zones from edge detection
- Compression → expansion signatures
- Gradient slope direction + strength
- Similar patterns and outcomes in historical/bundled charts
- Session impact patterns (e.g., NY breakouts after London coil)

---

🧾 **OUTPUT FORMAT:**
Provide your analysis with detailed technical analysis including:
- Current trend direction and strength
- Key support and resistance levels
- Chart patterns (triangles, flags, head & shoulders, etc.)
- Volume analysis if visible
- Potential price targets and entry/exit points
- Risk assessment
- Session prediction and confidence level`;

    const prompt = systemPrompt;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const analysisText = response.choices[0].message.content || "";

    // Parse the response to extract structured data
    const confidence = extractConfidenceScore(analysisText);
    const trends = extractTrends(analysisText);
    const patterns = extractPatterns(analysisText);

    return {
      analysis: analysisText,
      confidence,
      trends,
      patterns,
    };
  } catch (error) {
    console.error("GPT analysis error:", error);
    throw new Error(`Chart analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function extractConfidenceScore(text: string): number {
  const confidenceMatch = text.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
  if (confidenceMatch) {
    const score = parseFloat(confidenceMatch[1]);
    return score > 10 ? score / 10 : score; // Normalize to 0-1 if needed
  }
  return 0.7; // Default confidence
}

function extractTrends(text: string): string[] {
  const trends: string[] = [];
  const trendKeywords = ['bullish', 'bearish', 'sideways', 'uptrend', 'downtrend', 'consolidation'];

  trendKeywords.forEach(keyword => {
    if (text.toLowerCase().includes(keyword)) {
      trends.push(keyword);
    }
  });

  return trends;
}

function extractPatterns(text: string): string[] {
  const patterns: string[] = [];
  const patternKeywords = [
    'triangle', 'flag', 'pennant', 'head and shoulders', 'double top', 'double bottom',
    'support', 'resistance', 'breakout', 'breakdown', 'reversal'
  ];

  patternKeywords.forEach(pattern => {
    if (text.toLowerCase().includes(pattern)) {
      patterns.push(pattern);
    }
  });

  return patterns;
}

// Enhanced analysis function that handles both individual charts and bundle context
export async function analyzeChartWithEnhancedContext(
  chartImagePath: string,
  enrichedSimilarCharts: Array<{
    type: 'individual' | 'bundle';
    chart?: any;
    bundle?: any;
    charts?: any[];
    similarity: number;
    analysis?: any;
  }> = []
): Promise<AnalysisResult> {
  try {
    // Read and encode the main chart image
    const imageBuffer = fs.readFileSync(chartImagePath);
    const base64Image = imageBuffer.toString('base64');

    // Try to read additional visual layers if available
    const chartId = chartImagePath.match(/chart[s]?[-_]?(\d+)/)?.[1] || chartImagePath.match(/(\d+)/)?.[1];
    let base64EdgeMap = null;
    let base64GradientMap = null;
    let base64DepthMap = null;

    if (chartId) {
      // Try to read edge map
      const edgeMapPath = path.join(process.cwd(), 'server', 'edgemaps', `chart_${chartId}_edge.png`);
      if (fs.existsSync(edgeMapPath)) {
        const edgeBuffer = fs.readFileSync(edgeMapPath);
        base64EdgeMap = edgeBuffer.toString('base64');
      }

      // Try to read gradient map
      const gradientMapPath = path.join(process.cwd(), 'server', 'gradientmaps', `chart_${chartId}_gradient.png`);
      if (fs.existsSync(gradientMapPath)) {
        const gradientBuffer = fs.readFileSync(gradientMapPath);
        base64GradientMap = gradientBuffer.toString('base64');
      }
    }

    // Build the comprehensive prompt with full visual stack
    let systemPrompt = `You are a financial chart analysis expert. Your task is to analyze a new trading chart using advanced image reasoning across multiple visual layers, including:

- 🧠 CLIP Embeddings: High-level semantic pattern matching
- 🌀 Depth Map: Structural geometry and layer analysis
- 🔲 Edge Map: Entry zone outline, price compression coils, structure tracing
- 📉 Gradient Map: Slope intensity, price momentum, pre-breakout trajectory

You will also be provided with a dynamically retrieved list of the top 3 most visually similar historical charts from the database, which may either be standalone charts or part of multi-timeframe bundles.

---

🆕 **New Chart for Analysis:**
- Chart Image: [base64 input]
- Depth Map: [base64 input]
- Edge Map: [base64 input]
- Gradient Map: [base64 input]
- Instrument: Unknown (infer visually if possible)
- Timeframe: Unknown (infer visually if possible)

---

📚 **Historical Chart Context:**
For each similar chart, you will be provided:`;

    // Build similar charts context
    enrichedSimilarCharts.forEach((item, index) => {
      const chartNum = index + 1;

      if (item.type === 'individual' && item.chart) {
        const chart = item.chart;
        systemPrompt += `
📊 Similar Chart #${chartNum}:
- Image: /uploads/${chart.filename}
- Depth Map: ${chart.depthMapPath || 'Not available'}
- Edge Map: ${chart.edgeMapPath || 'Not available'}
- Gradient Map: ${chart.gradientMapPath || 'Not available'}
- Instrument: ${chart.instrument}
- Timeframe: ${chart.timeframe}
- Session: ${chart.session || 'Unknown'}
- CLIP Similarity: ${(item.similarity * 100).toFixed(1)}%
- Outcome: ${chart.comment || 'Not recorded'}

---`;
      } else if (item.type === 'bundle' && item.bundle && item.charts) {
        const bundle = item.bundle;
        const primaryChart = item.charts[0]; // Use first chart as primary

        systemPrompt += `
📦 Bundle for Chart #${chartNum}:
- Charts across: [${item.charts.map((c: any) => c.timeframe).join(', ')}]
- Each image includes Depth, Edge, and Gradient maps
- Instrument: ${bundle.instrument}
- Session: ${bundle.session || 'Unknown'}
- CLIP Similarity: ${(item.similarity * 100).toFixed(1)}%`;

        // Add bundle analysis outcome if available
        if (item.analysis) {
          try {
            const analysisData = JSON.parse(item.analysis.gptAnalysis);
            if (analysisData.prediction) {
              systemPrompt += `
- Outcome Summary: ${analysisData.prediction} (Confidence: ${analysisData.confidence})`;
            }
          } catch (e) {
            systemPrompt += `
- Outcome Summary: Not recorded`;
          }
        } else {
          systemPrompt += `
- Outcome Summary: Not recorded`;
        }

        systemPrompt += `

---`;
      }
    });

    systemPrompt += `

🎯 **YOUR TASK**:
1. Determine which market session (Asia, London, New York) is most likely to lead the move.
2. Predict the direction bias (up, down, or unclear).
3. Assign confidence level: low / medium / high
4. In the rationale, compare the visual features (EMA layout, price compression, depth structure, edge clarity, gradient slopes) between the new chart and historical patterns.

---

🧠 **Focus Your Reasoning On:**
- EMA structures across edge + gradient maps
- Coil or breakout zones from edge detection
- Compression → expansion signatures
- Gradient slope direction + strength
- Similar patterns and outcomes in historical/bundled charts
- Session impact patterns (e.g., NY breakouts after London coil)

---

🧾 **OUTPUT FORMAT:**
Respond ONLY in this exact JSON format:
\`\`\`json
{
  "session": "London",
  "direction": "up",
  "confidence": "high",
  "rationale": "The depth map and edge contours show a clear consolidation zone with slope buildup in the gradient map. This mirrors Bundle #2 (NAS100, 15m/1h/4h) where a similar EMA coil broke upwards during the London session."
}
\`\`\``;

    // Build message content with all available visual layers
    const messageContent: any[] = [
      {
        type: "text",
        text: systemPrompt,
      },
      {
        type: "text",
        text: "\n📊 **Original Chart Image:**",
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
        },
      }
    ];

    // Add edge map if available
    if (base64EdgeMap) {
      messageContent.push({
        type: "text",
        text: "\n🔲 **Edge Detection Map:**",
      });
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64EdgeMap}`,
        },
      });
    }

    // Add gradient map if available
    if (base64GradientMap) {
      messageContent.push({
        type: "text",
        text: "\n📉 **Gradient/Momentum Map:**",
      });
      messageContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64GradientMap}`,
        },
      });
    }

    // Add depth map if available (to be implemented when we have chart record)
    // This could be added later when we pass the chart record to this function

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: messageContent,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const analysisText = response.choices[0].message.content || "";

    try {
      const parsedResult = JSON.parse(analysisText);

      // Validate the response format
      if (!parsedResult.session || !parsedResult.direction || !parsedResult.confidence || !parsedResult.rationale) {
        throw new Error("Invalid response format from GPT");
      }

      // Map the structured response to AnalysisResult format
      return {
        analysis: `Session: ${parsedResult.session}\nDirection: ${parsedResult.direction}\nConfidence: ${parsedResult.confidence}\n\nRationale: ${parsedResult.rationale}`,
        confidence: parsedResult.confidence === 'high' ? 0.9 : parsedResult.confidence === 'medium' ? 0.7 : 0.5,
        trends: [parsedResult.direction === 'up' ? 'bullish' : parsedResult.direction === 'down' ? 'bearish' : 'sideways'],
        patterns: [], // Will be extracted from analysis if needed
      };
    } catch (parseError) {
      console.error("Failed to parse GPT response:", analysisText);

      // Fallback to legacy format parsing
      const confidence = extractConfidenceScore(analysisText);
      const trends = extractTrends(analysisText);
      const patterns = extractPatterns(analysisText);

      return {
        analysis: analysisText,
        confidence,
        trends,
        patterns,
      };
    }

  } catch (error) {
    console.error("Enhanced GPT analysis error:", error);
    throw new Error(`Enhanced chart analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Multi-timeframe bundle analysis with structured prompt and RAG
export async function analyzeBundleWithGPT(
  chartData: Array<{ chart: any; base64Image: string; depthMapBase64?: string }>,
  bundleMetadata: any,
  customSystemPrompt?: string
): Promise<AnalysisResult & { prediction?: string; session?: string; confidence_level?: string; rationale?: string }> {
  try {
    const { instrument, chart_ids, timeframes, session } = bundleMetadata;

    // Sort chart data by timeframe priority (5M, 15M, 1H, 4H, Daily)
    const timeframePriority: Record<string, number> = { '5M': 1, '15M': 2, '1H': 3, '4H': 4, 'Daily': 5 };
    const sortedChartData = chartData.sort((a, b) => {
      const priorityA = timeframePriority[a.chart.timeframe as string] || 99;
      const priorityB = timeframePriority[b.chart.timeframe as string] || 99;
      return priorityA - priorityB;
    });

    // Build structured chart descriptions
    let chartDescriptions = "";
    sortedChartData.forEach((data, index) => {
      const { chart } = data;
      chartDescriptions += `${index + 1}. ${chart.timeframe} Chart: ${chart.originalName}\n`;
      if (data.depthMapBase64) {
        chartDescriptions += `   Depth Map: depth_${chart.originalName}\n`;
      }
      chartDescriptions += "\n";
    });

    // Build the comprehensive prompt with full visual stack - use custom prompt if provided  
    let baseSystemPrompt;
    if (customSystemPrompt && customSystemPrompt.trim().length > 0) {
      // When using custom prompt, ensure it includes JSON output requirement
      baseSystemPrompt = customSystemPrompt;
      if (!customSystemPrompt.includes('JSON') && !customSystemPrompt.includes('json')) {
        baseSystemPrompt += `\n\n🧾 **OUTPUT FORMAT:**
Respond ONLY in this exact JSON format:
\`\`\`json
{
  "session": "London",
  "direction": "up",
  "confidence": "high", 
  "rationale": "Your detailed analysis reasoning here..."
}
\`\`\``;
      }
      console.log('✅ Using custom system prompt for bundle analysis with JSON format enforcement');
    } else {
      baseSystemPrompt = `You are a financial chart analysis expert. Your task is to analyze a new trading chart using advanced image reasoning across multiple visual layers, including:

- 🧠 CLIP Embeddings: High-level semantic pattern matching
- 🌀 Depth Map: Structural geometry and layer analysis
- 🔲 Edge Map: Entry zone outline, price compression coils, structure tracing
- 📉 Gradient Map: Slope intensity, price momentum, pre-breakout trajectory

You will also be provided with a dynamically retrieved list of the top 3 most visually similar historical charts from the database, which may either be standalone charts or part of multi-timeframe bundles.

---

🆕 **Multi-Timeframe Bundle for Analysis:**
- Instrument: ${instrument}
- Charts: ${timeframes.join(', ')}
${session ? `- Session Context: ${session}` : ''}

${chartDescriptions}

---

📚 **Historical Chart Context:**
For each similar chart, you will be provided context from historical patterns and outcomes.

---

🎯 **YOUR TASK**:
1. Determine which market session (Asia, London, New York) is most likely to lead the move.
2. Predict the direction bias (up, down, or unclear).
3. Assign confidence level: low / medium / high
4. In the rationale, compare the visual features (EMA layout, price compression, depth structure, edge clarity, gradient slopes) across multiple timeframes.

---

🧠 **Focus Your Reasoning On:**
- EMA structures across edge + gradient maps
- Coil or breakout zones from edge detection
- Compression → expansion signatures
- Gradient slope direction + strength
- Multi-timeframe confluence and alignment
- Session impact patterns (e.g., NY breakouts after London coil)`;
    }


    let systemPrompt = `${baseSystemPrompt}

---

🧾 **OUTPUT FORMAT:**
Respond ONLY in this exact JSON format:
\`\`\`json
{
  "instrument": "${instrument}",
  "prediction": "Brief prediction (e.g., 'Bullish breakout', 'Bearish continuation')",
  "session": "Most likely session for the move (Asia/London/NY/Sydney)",
  "confidence": "Low/Medium/High",
  "rationale": "Detailed analysis of EMA structure, depth patterns, and multi-timeframe confluence"
}
\`\`\``;

    const structuredPrompt = systemPrompt;

    // Build messages with system prompt and structured user content
    const content: any[] = [
      {
        type: "text",
        text: structuredPrompt,
      }
    ];

    // Add chart images in timeframe order with labels
    sortedChartData.forEach((data, index) => {
      const { chart } = data;
      content.push({
        type: "text",
        text: `\n${chart.timeframe} Chart (${chart.originalName}):`,
      });
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${data.base64Image}`,
          detail: "high"
        },
      });

      // Add depth map if available
      if (data.depthMapBase64) {
        content.push({
          type: "text",
          text: `${chart.timeframe} Depth Map:`,
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${data.depthMapBase64}`,
            detail: "high"
          },
        });
      }
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert trading analyst specializing in multi-timeframe analysis. Always respond with the requested JSON format followed by any additional analysis."
        },
        {
          role: "user",
          content,
        },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });
    console.log("[openai] preview:", (response?.choices?.[0]?.message?.content || "").slice(0, 120));
    
    const analysisText = response.choices[0].message.content || "";

    // Try to parse JSON response
    let parsedResponse;
    try {
      // Extract JSON from the response if it's wrapped in markdown or other text
      const jsonMatch = analysisText.match(/\{[\s\S]*?\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : analysisText;
      parsedResponse = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('Failed to parse JSON response, using raw analysis:', parseError);
      parsedResponse = {
        instrument,
        prediction: "Multi-timeframe analysis complete",
        session: session || "London",
        confidence: "Medium",
        rationale: analysisText.substring(0, 500) + "..."
      };
    }

    // Extract traditional analysis data
    const confidence = extractConfidenceScore(analysisText);
    const trends = extractTrends(analysisText);
    const patterns = extractPatterns(analysisText);

    return {
      analysis: analysisText,
      confidence,
      trends,
      patterns,
      prediction: parsedResponse.prediction,
      session: parsedResponse.session,
      confidence_level: parsedResponse.confidence,
      rationale: parsedResponse.rationale
    };
  } catch (error) {
    console.error("Bundle GPT analysis error:", error);
    throw new Error(`Bundle analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

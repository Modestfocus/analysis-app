import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { messageHasImageParts } from './unified-analysis';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';

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
  customSystemPrompt?: string
): Promise<ChartPrediction> {
  try {
    console.log(`🔍 Starting multi-chart analysis for ${charts.length} charts`);

    // Build comprehensive RAG context
    let ragContext = "";
    if (similarCharts.length > 0) {
      ragContext = "\nHistorical similar patterns found:\n\n";
      similarCharts.slice(0, 3).forEach((item, index) => {
        const chart = item.chart;
        ragContext += `${index + 1}. ${chart.originalName} (${chart.instrument}, ${chart.timeframe})\n`;
        ragContext += `   - Similarity: ${(item.similarity * 100).toFixed(1)}%\n`;
        ragContext += `   - Session: ${chart.session || 'Unknown'}\n\n`;
      });
    }

    // Defensive check: Ensure we have image content
    if (!charts.length) {
      throw new Error("No charts provided for analysis");
    }

    // Build comprehensive multi-chart prompt - use custom prompt if provided
    const baseSystemPrompt = customSystemPrompt || `You are a professional forex and trading chart analyst with expertise in multi-timeframe analysis. 

You will receive multiple trading charts with their complete visual processing pipeline:
- Original chart images (price action, candlesticks, indicators)
- Depth maps (3D depth perception for pattern recognition) 
- Edge maps (structural boundaries and trend lines)
- Gradient maps (price momentum and slope analysis)

ANALYZE ALL CHARTS TOGETHER as a unified multi-timeframe view to provide one comprehensive trading prediction.

Key Analysis Points:
1. **Multi-Timeframe Coherence**: How do the different timeframes align or conflict?
2. **Cross-Timeframe Patterns**: Identify patterns visible across multiple charts
3. **Volume/Momentum**: Analyze gradient maps for momentum shifts
4. **Structure Analysis**: Use edge maps for key support/resistance levels
5. **Depth Perception**: Use depth maps for pattern strength assessment
6. **Session Timing**: Consider optimal trading session for the setup`;

    const systemPrompt = `${baseSystemPrompt}

${ragContext}

Respond with a JSON object containing:
{
  "prediction": "Up/Down/Sideways",
  "session": "Asia/London/NY/Sydney", 
  "confidence": "Low/Medium/High",
  "reasoning": "Detailed analysis explaining your prediction based on ALL visual data from ALL charts"
}`;

    // Prepare content array with all visual data
    const content: any[] = [
      {
        type: "text",
        text: systemPrompt
      }
    ];

    // Add all chart visual data
    charts.forEach((chart, index) => {
      content.push({
        type: "text", 
        text: `\n--- CHART ${index + 1}: ${chart.metadata.originalName} (${chart.metadata.timeframe}) ---`
      });

      // Original chart
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${chart.original}`,
          detail: "high"
        }
      });

      // Depth map
      if (chart.depth) {
        content.push({
          type: "text",
          text: `Depth Map for ${chart.metadata.originalName}:`
        });
        content.push({
          type: "image_url", 
          image_url: {
            url: `data:image/png;base64,${chart.depth}`,
            detail: "high"
          }
        });
      }

      // Edge map  
      if (chart.edge) {
        content.push({
          type: "text",
          text: `Edge Map for ${chart.metadata.originalName}:`
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${chart.edge}`, 
            detail: "high"
          }
        });
      }

      // Gradient map
      if (chart.gradient) {
        content.push({
          type: "text",
          text: `Gradient Map for ${chart.metadata.originalName}:`
        });
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${chart.gradient}`,
            detail: "high"
          }
        });
      }
    });

    console.log("📡 Making OpenAI API call with", content.length, "content parts...");
    console.log("📄 Prompt length:", systemPrompt.length, "characters");

    // Defensive check: Ensure we have image content
    const hasImages = content.some(part => part.type === 'image_url');
    if (!hasImages) {
      throw new Error("No image parts attached");
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
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

    // Defensive check: Ensure we have image content
    const hasImages = messageContent.some(part => part.type === 'image_url');
    if (!hasImages) {
      throw new Error("No image parts attached");
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
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

    const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';
    const response = await openai.chat.completions.create({
      model: MODEL,
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

    const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';
    const response = await openai.chat.completions.create({
      model: MODEL,
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

    const MODEL = process.env.VISION_MODEL ?? 'gpt-4o';
    const response = await openai.chat.completions.create({
      model: MODEL,
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
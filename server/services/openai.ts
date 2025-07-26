import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export async function analyzeChartWithRAG(
  chartImagePath: string,
  depthMapPath: string | null,
  similarCharts: Array<{ 
    chart: any; 
    similarity: number;
    depthMapPath?: string;
  }> = []
): Promise<ChartPrediction> {
  try {
    // Read and encode the main chart image
    const imageBuffer = fs.readFileSync(chartImagePath);
    const base64Image = imageBuffer.toString('base64');

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

    const prompt = `You are a trading AI assistant specializing in pattern recognition and market prediction.

ANALYSIS TASK:
Analyze this new chart image${base64DepthMap ? ' and its depth map' : ''} to predict the most likely market behavior.

${ragContext}

ANALYSIS REQUIREMENTS:
Based on the visual similarity and depth patterns compared to historical charts:

1. What is the most likely market behavior next? (Bullish breakout, Bearish reversal, Rangebound consolidation, etc.)
2. In which trading session is the move likely to happen? (Asia, London, NY, Sydney)
3. Rate your confidence level (Low, Medium, High)
4. Explain the reasoning based on visual patterns${base64DepthMap ? ', depth map structure,' : ''} and historical similarity

RESPONSE FORMAT:
Respond with a JSON object in this exact format:
{
  "prediction": "Your market behavior prediction",
  "session": "Most likely session",
  "confidence": "Low/Medium/High",
  "reasoning": "Detailed explanation of your analysis including pattern recognition and historical context"
}`;

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

    const analysisText = response.choices[0].message.content || "";
    
    try {
      const parsedResult = JSON.parse(analysisText) as ChartPrediction;
      
      // Validate the response format
      if (!parsedResult.prediction || !parsedResult.session || !parsedResult.confidence || !parsedResult.reasoning) {
        throw new Error("Invalid response format from GPT");
      }

      // Ensure confidence is one of the expected values
      if (!["Low", "Medium", "High"].includes(parsedResult.confidence)) {
        parsedResult.confidence = "Medium";
      }

      return parsedResult;
    } catch (parseError) {
      console.error("Failed to parse GPT response:", analysisText);
      throw new Error("Invalid JSON response from GPT analysis");
    }

  } catch (error) {
    console.error("GPT RAG analysis error:", error);
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

    const prompt = `You are an expert trading analyst. Analyze this trading chart and provide detailed technical analysis.

Focus on:
1. Current trend direction and strength
2. Key support and resistance levels
3. Chart patterns (triangles, flags, head & shoulders, etc.)
4. Volume analysis if visible
5. Potential price targets and entry/exit points
6. Risk assessment

${similarChartsContext}

Please provide your analysis in a structured format and rate your confidence level from 1-10.`;

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
  bundleMetadata: any
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

    const structuredPrompt = `You are a trading AI assistant analyzing a multi-timeframe setup for ${instrument}.

Here are the charts provided for this trade setup:

${chartDescriptions}Please analyze how price action is evolving across these timeframes and answer:

- What is the most likely outcome?
- In which session is the breakout or major move likely to happen?
- Confidence level (Low, Medium, High)
- Provide a brief rationale using EMA structure, depth shape, and any chart similarities

${session ? `Current trading session context: ${session}` : ''}

Please provide your response in the following JSON format:
{
  "instrument": "${instrument}",
  "prediction": "Brief prediction (e.g., 'Bullish breakout', 'Bearish continuation')",
  "session": "Most likely session for the move (Asia/London/NY/Sydney)",
  "confidence": "Low/Medium/High",
  "rationale": "Detailed analysis of EMA structure, depth patterns, and multi-timeframe confluence"
}`;

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
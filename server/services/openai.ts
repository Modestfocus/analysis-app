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
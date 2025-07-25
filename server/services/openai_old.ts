import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ChartAnalysis {
  technical: {
    trend: string;
    supportResistance: string;
    volume: string;
    patterns: string[];
  };
  depth: {
    patternDepth: string;
    signalStrength: string;
  };
  insights: {
    setup: string;
    entry: string;
    riskManagement: string;
  };
  confidence: number;
}

export async function analyzeChartWithGPT(
  chartImageBase64: string,
  similarCharts: Array<{ chart: any; similarity: number }>,
  depthMapBase64?: string
): Promise<ChartAnalysis> {
  try {
    const systemPrompt = `You are an expert trading chart analyst. Analyze the provided trading chart image and provide detailed technical analysis. 

Consider the following similar charts found in the database:
${similarCharts.map((sc, i) => `${i + 1}. ${sc.chart.originalName} (${sc.chart.timeframe}) - ${Math.round(sc.similarity * 100)}% similarity`).join('\n')}

Provide your analysis in JSON format with the following structure:
{
  "technical": {
    "trend": "description of trend direction and strength",
    "supportResistance": "key support and resistance levels",
    "volume": "volume analysis",
    "patterns": ["list", "of", "chart", "patterns"]
  },
  "depth": {
    "patternDepth": "analysis of pattern depth and structure",
    "signalStrength": "strength of trading signals"
  },
  "insights": {
    "setup": "trading setup description",
    "entry": "entry strategy",
    "riskManagement": "risk management advice"
  },
  "confidence": 0.85
}`;

    const messages: any[] = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please analyze this trading chart and provide detailed technical analysis."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${chartImageBase64}`
            }
          }
        ]
      }
    ];

    if (depthMapBase64) {
      messages[1].content.push({
        type: "text",
        text: "Here is also the depth map for additional pattern analysis:"
      });
      messages[1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${depthMapBase64}`
        }
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as ChartAnalysis;
  } catch (error) {
    throw new Error("Failed to analyze chart with GPT: " + (error as Error).message);
  }
}

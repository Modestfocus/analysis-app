import { Request, Response } from 'express';

/**
 * Smoke test route that validates RAG API response format
 * Asserts: response has similarCharts.length === 3 and typeof similarity === 'number' for each item
 */
export async function smokeTestRAG(req: Request, res: Response) {
  try {
    // Test payload - minimal image for RAG testing
    const testPayload = {
      content: [
        { type: "text", text: "Smoke test for RAG system" },
        { 
          type: "image_url", 
          image_url: { 
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
          }
        }
      ],
      enableFullAnalysis: true,
      conversationId: `smoke-test-${Date.now()}`
    };

    // Make internal request to chat/analyze endpoint using axios
    const axios = (await import('axios')).default;
    const baseUrl = req.protocol + '://' + req.get('host');
    const response = await axios.post(`${baseUrl}/api/chat/analyze`, testPayload, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.status !== 200) {
      throw new Error(`Analysis request failed: ${response.status}`);
    }

    const data = response.data as any;

    // Run assertions
    const assertions = [];
    
    // Check similarCharts exists and is array
    if (!data.similarCharts || !Array.isArray(data.similarCharts)) {
      assertions.push('❌ similarCharts is not an array');
    } else {
      assertions.push('✅ similarCharts is an array');
      
      // Check length === 3
      if (data.similarCharts.length !== 3) {
        assertions.push(`❌ similarCharts.length = ${data.similarCharts.length}, expected 3`);
      } else {
        assertions.push('✅ similarCharts.length === 3');
      }
      
      // Check each similarity is a number
      data.similarCharts.forEach((chart: any, i: number) => {
        const similarity = chart.similarity;
        if (typeof similarity !== 'number') {
          assertions.push(`❌ similarCharts[${i}].similarity is ${typeof similarity}, expected number`);
        } else if (isNaN(similarity)) {
          assertions.push(`❌ similarCharts[${i}].similarity is NaN`);
        } else {
          assertions.push(`✅ similarCharts[${i}].similarity = ${similarity} (number)`);
        }
      });
    }

    // Check analysis response structure
    if (data.success) {
      assertions.push('✅ success: true');
    } else {
      assertions.push('❌ success: false');
    }

    const allPassed = assertions.every(a => a.startsWith('✅'));
    
    res.json({
      success: allPassed,
      timestamp: new Date().toISOString(),
      assertions,
      summary: allPassed ? 'All RAG smoke tests passed' : 'Some RAG smoke tests failed',
      sampleSimilarities: data.similarCharts?.map((c: any) => ({
        id: c.chart?.id,
        similarity: c.similarity,
        type: typeof c.similarity
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
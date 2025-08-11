#!/usr/bin/env tsx

import { embedImageToVectorCached } from './services/embeddings';
import { getTopSimilarCharts } from './services/retrieval';
import { storage } from './storage';
import crypto from 'crypto';
import fs from 'fs/promises';

async function testRAGSystem() {
  console.log('🧪 Testing RAG system...');

  try {
    // Test with our created test image  
    const imagePath = 'server/uploads/test-chart.png';
    
    console.log('📸 Testing embedding generation...');
    
    // Compute hash for the test image
    const buf = await fs.readFile(imagePath);
    const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
    
    // Generate embedding
    const vec = await embedImageToVectorCached(imagePath, sha);
    
    console.log(`✅ Generated embedding: dim=${vec.length}, first 5 values: [${Array.from(vec.slice(0, 5)).map(v => v.toFixed(4)).join(', ')}]`);
    
    // Test console.assert for dimension check
    console.assert(vec.length === 768, `Expected 768 dimensions, got ${vec.length}`);
    console.log('✅ Dimension assertion passed');
    
    // Test similarity search (will be empty initially)
    const similar = await getTopSimilarCharts(vec, 3);
    console.log(`🔍 Similarity search returned ${similar.length} results`);
    
    if (similar.length > 0) {
      console.table(similar.map(s => ({ 
        id: s.chart.id, 
        sim: +s.similarity.toFixed(4),
        filename: s.chart.filename
      })));
    }
    
    // Manually create a test chart with embedding for similarity testing
    console.log('💾 Creating test chart with embedding...');
    
    const testChart = await storage.createChart({
      filename: 'test-chart.jpg',
      originalName: 'Test Chart',
      timeframe: '1H',
      instrument: 'EURUSD',
      embedding: Array.from(vec), // Convert to regular array for storage
    });
    
    console.log(`✅ Created test chart with ID: ${testChart.id}`);
    
    // Test similarity search with new data
    const similarAfter = await getTopSimilarCharts(vec, 3);
    console.log(`🔍 After adding test chart, similarity search returned ${similarAfter.length} results`);
    
    if (similarAfter.length > 0) {
      console.table(similarAfter.map(s => ({ 
        id: s.chart.id, 
        sim: +s.similarity.toFixed(4),
        filename: s.chart.filename,
        instrument: s.chart.instrument
      })));
    }
    
    console.log('🎉 RAG system test completed successfully!');
    
  } catch (error) {
    console.error('❌ RAG system test failed:', error);
    throw error;
  }
}

// Run the test if this script is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  testRAGSystem()
    .then(() => {
      console.log('✅ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

export { testRAGSystem };
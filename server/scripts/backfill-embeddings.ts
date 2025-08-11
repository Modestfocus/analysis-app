#!/usr/bin/env tsx

import { db } from '../db';
import { charts } from '../../shared/schema';
import { embedImageToVector } from '../services/embeddings';
import { eq, isNull, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function backfillEmbeddings() {
  console.log('🔄 Starting embedding backfill process...');
  
  try {
    // Get all charts without embeddings
    const chartsWithoutEmbeddings = await db
      .select()
      .from(charts)
      .where(isNull(charts.embedding));
    
    console.log(`📊 Found ${chartsWithoutEmbeddings.length} charts without embeddings`);
    
    let processed = 0;
    let errors = 0;
    
    for (const chart of chartsWithoutEmbeddings) {
      try {
        // Construct the image path - try multiple possible locations
        let imagePath: string | null = null;
        const possiblePaths = [
          path.join('server/uploads', chart.filename),
          path.join('uploads', chart.filename),
          chart.filename
        ];
        
        for (const possPath of possiblePaths) {
          if (fs.existsSync(possPath)) {
            imagePath = possPath;
            break;
          }
        }
        
        if (!imagePath) {
          console.warn(`⚠️  Image not found for chart ${chart.id}: ${chart.filename}`);
          continue;
        }
        
        console.log(`🔍 Processing chart ${chart.id}: ${chart.filename}`);
        
        // Generate CLIP embedding (512 dimensions) 
        const vec = await embedImageToVector(imagePath);
        
        console.log(`✅ Generated CLIP embedding for chart ${chart.id}, dimensions: ${vec.length}`);
        
        // Convert to pgvector format using raw SQL
        const embedding = Array.from(vec);
        const vectorStr = `[${embedding.join(',')}]`;
        
        // Update the database with the embedding using raw SQL for pgvector compatibility
        await db.execute(sql`
          UPDATE charts 
          SET embedding = ${vectorStr}::vector 
          WHERE id = ${chart.id}
        `);
        
        processed++;
        console.log(`📝 Updated chart ${chart.id} with embedding (${processed}/${chartsWithoutEmbeddings.length})`);
        
      } catch (error) {
        console.error(`❌ Error processing chart ${chart.id}:`, error);
        errors++;
      }
    }
    
    console.log(`🎉 Backfill completed! Processed: ${processed}, Errors: ${errors}`);
    
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  }
}

// Run the backfill if this script is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  backfillEmbeddings()
    .then(() => {
      console.log('✅ Backfill script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Backfill script failed:', error);
      process.exit(1);
    });
}

export { backfillEmbeddings };
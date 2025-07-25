import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DepthMapResult {
  success?: boolean;
  error?: string;
  depthMapPath?: string;
  input?: string;
  output?: string;
  model?: string;
  depth_range?: [number, number];
}

/**
 * Generate depth map using MiDaS DPT-Hybrid model via Python script
 */
export async function generateDepthMap(inputPath: string, outputPath: string): Promise<DepthMapResult> {
  return new Promise((resolve) => {
    const pythonScript = path.join(__dirname, 'midas_depth.py');
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    fs.mkdir(outputDir, { recursive: true }).catch(() => {});
    
    // Call Python script for depth map generation
    const pythonProcess = spawn('python3', [pythonScript, '--input', inputPath, '--output', outputPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`MiDaS Python process failed with code ${code}`);
        console.error('stderr:', stderr);
        
        // Fallback: create simple depth map using Node.js
        createFallbackDepthMap(inputPath, outputPath)
          .then((result) => resolve(result))
          .catch(async (error) => {
            console.error('Fallback depth map failed:', error);
            // Create a simple gradient depth map as final fallback
            try {
              const sharp = await import('sharp');
              await sharp.default(inputPath)
                .grayscale()
                .blur(2)
                .toFile(outputPath);
              
              resolve({
                success: true,
                depthMapPath: outputPath,
                input: inputPath,
                output: outputPath,
                model: 'simple-gradient-fallback'
              });
            } catch (finalError) {
              resolve({ error: `All depth map methods failed: ${finalError.message}` });
            }
          });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim()) as DepthMapResult;
        
        if (result.error) {
          console.error('MiDaS error:', result.error);
          // Try fallback
          createFallbackDepthMap(inputPath, outputPath)
            .then((fallbackResult) => resolve(fallbackResult))
            .catch((error) => resolve({ error: `MiDaS failed: ${result.error}, fallback failed: ${error.message}` }));
        } else if (result.success) {
          console.log(`✓ Generated depth map using ${result.model}: ${result.output}`);
          resolve({
            success: true,
            depthMapPath: outputPath,
            ...result
          });
        } else {
          resolve({ error: 'Invalid response from MiDaS script' });
        }
      } catch (parseError) {
        console.error('Failed to parse MiDaS output:', parseError);
        console.error('stdout:', stdout);
        
        // Try fallback
        createFallbackDepthMap(inputPath, outputPath)
          .then((result) => resolve(result))
          .catch((error) => resolve({ error: `Parse failed and fallback failed: ${error.message}` }));
      }
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      console.error('Failed to start MiDaS Python process:', error);
      
      // Try fallback
      createFallbackDepthMap(inputPath, outputPath)
        .then((result) => resolve(result))
        .catch((fallbackError) => resolve({ error: `Process start failed: ${error.message}, fallback failed: ${fallbackError.message}` }));
    });
  });
}

/**
 * Create a simple depth map fallback when MiDaS is not available
 */
async function createFallbackDepthMap(inputPath: string, outputPath: string): Promise<DepthMapResult> {
  try {
    const sharp = (await import('sharp')).default;
    
    // Read input image and create simple depth effect
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Create a simple gradient-based depth map
    const width = metadata.width || 512;
    const height = metadata.height || 512;
    
    // Create depth effect using image processing
    await image
      .greyscale()
      .blur(2)
      .normalise()
      .png()
      .toFile(outputPath);
    
    console.log(`✓ Generated fallback depth map: ${outputPath}`);
    
    return {
      success: true,
      depthMapPath: outputPath,
      input: inputPath,
      output: outputPath,
      model: 'Fallback Grayscale + Blur'
    };
    
  } catch (error) {
    throw new Error(`Fallback depth map generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate depth maps for multiple charts in batch
 */
export async function generateDepthMapBatch(inputDir: string, outputDir: string): Promise<DepthMapResult[]> {
  try {
    const pythonScript = path.join(__dirname, 'midas_depth.py');
    
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [pythonScript, '--input', inputDir, '--output', outputDir, '--batch'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`MiDaS batch process failed with code ${code}`);
          console.error('stderr:', stderr);
          reject(new Error(`MiDaS batch processing failed: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          
          if (result.error) {
            reject(new Error(`MiDaS batch error: ${result.error}`));
          } else {
            resolve(result.batch_results || []);
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse batch output: ${parseError}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start batch process: ${error.message}`));
      });
    });
    
  } catch (error) {
    throw new Error(`Batch depth map generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
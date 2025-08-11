import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OpenCLIPResult {
  embedding?: number[];
  dimensions?: number;
  model?: string;
  error?: string;
}

/**
 * Generate 1024-dimensional OpenCLIP ViT-H/14 embeddings for chart images
 */
export async function generateOpenCLIPEmbedding(imagePath: string): Promise<OpenCLIPResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'openclip_embeddings.py');
    
    // Call Python script with image path
    const pythonProcess = spawn('python3', [pythonScript, imagePath], {
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
        console.error(`OpenCLIP Python process failed with code ${code}`);
        console.error('stderr:', stderr);
        resolve({ error: `Python process failed: ${stderr}` });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim()) as OpenCLIPResult;
        
        if (result.error) {
          console.error('OpenCLIP error:', result.error);
          resolve(result);
        } else if (result.embedding && result.embedding.length === 1024) {
          console.log(`Generated OpenCLIP embedding: ${result.dimensions}D vector using ${result.model}`);
          resolve(result);
        } else {
          resolve({ error: 'Invalid embedding dimensions received' });
        }
      } catch (parseError) {
        console.error('Failed to parse OpenCLIP output:', parseError);
        console.error('stdout:', stdout);
        resolve({ error: 'Failed to parse Python output' });
      }
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      console.error('Failed to start OpenCLIP Python process:', error);
      resolve({ error: `Failed to start Python process: ${error.message}` });
    });
  });
}

/**
 * Generate embedding from base64 image data
 */
export async function generateOpenCLIPEmbeddingFromBase64(base64Data: string): Promise<OpenCLIPResult> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'openclip_embeddings.py');
    
    // Call Python script with base64 data
    const pythonProcess = spawn('python3', [pythonScript, base64Data], {
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
        console.error(`OpenCLIP Python process failed with code ${code}`);
        console.error('stderr:', stderr);
        resolve({ error: `Python process failed: ${stderr}` });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim()) as OpenCLIPResult;
        
        if (result.error) {
          console.error('OpenCLIP error:', result.error);
          resolve(result);
        } else if (result.embedding && result.embedding.length === 1024) {
          console.log(`Generated OpenCLIP embedding: ${result.dimensions}D vector using ${result.model}`);
          resolve(result);
        } else {
          resolve({ error: 'Invalid embedding dimensions received' });
        }
      } catch (parseError) {
        console.error('Failed to parse OpenCLIP output:', parseError);
        console.error('stdout:', stdout);
        resolve({ error: 'Failed to parse Python output' });
      }
    });

    // Handle process errors
    pythonProcess.on('error', (error) => {
      console.error('Failed to start OpenCLIP Python process:', error);
      resolve({ error: `Failed to start Python process: ${error.message}` });
    });
  });
}
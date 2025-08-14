import express from 'express';
import { storage } from './storage';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

const router = express.Router();

// Debug viewer route to display all image processing results
router.get('/chart/:id/preview', async (req, res) => {
  try {
    const chartId = parseInt(req.params.id);
    
    if (isNaN(chartId)) {
      return res.status(400).send(`
        <html>
          <head><title>Invalid Chart ID</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Invalid Chart ID</h1>
            <p>Chart ID must be a valid number. Received: ${req.params.id}</p>
            <p><a href="/debug/admin">← Back to Admin Dashboard</a></p>
          </body>
        </html>
      `);
    }
    
    const chart = await storage.getChart(chartId);
    
    if (!chart) {
      return res.status(404).send(`
        <html>
          <head><title>Chart Not Found</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Chart Not Found</h1>
            <p>Chart with ID ${chartId} does not exist.</p>
            <p><a href="/debug/admin">← Back to Admin Dashboard</a></p>
          </body>
        </html>
      `);
    }

    // Generate grayscale version for debug display
    const originalPath = path.join(process.cwd(), 'server', 'uploads', chart.filename);
    const grayscalePath = path.join(process.cwd(), 'server', 'temp', `gray_chart_${chartId}.png`);
    
    // Ensure temp directory exists
    await fs.mkdir(path.dirname(grayscalePath), { recursive: true });
    
    // Generate grayscale version
    await sharp(originalPath)
      .grayscale()
      .png()
      .toFile(grayscalePath);

    // Create HTML preview page
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chart ${chartId} Debug Preview</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background: #f5f5f5; 
            }
            .header {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            .image-card {
                background: white;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                text-align: center;
            }
            .image-card h3 {
                margin: 0 0 15px 0;
                color: #333;
                font-size: 16px;
            }
            .image-card img {
                max-width: 100%;
                height: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            .status {
                margin-top: 10px;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
            }
            .status.available { background: #d4edda; color: #155724; }
            .status.missing { background: #f8d7da; color: #721c24; }
            .metadata {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .metadata-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }
            .metadata-item {
                padding: 10px;
                background: #f8f9fa;
                border-radius: 4px;
                border-left: 4px solid #007bff;
            }
            .metadata-item strong {
                display: block;
                color: #333;
                margin-bottom: 5px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Chart ${chartId} Debug Preview</h1>
            <p><strong>Original Name:</strong> ${chart.originalName}</p>
            <p><strong>Timeframe:</strong> ${chart.timeframe} | <strong>Instrument:</strong> ${chart.instrument || 'N/A'}</p>
            <p><strong>Uploaded:</strong> ${new Date(chart.uploadedAt).toLocaleString()}</p>
        </div>

        <div class="grid">
            <div class="image-card">
                <h3>🖼️ Original Image</h3>
                <img src="/uploads/${chart.filename}" alt="Original chart">
                <div class="status available">✅ Available</div>
            </div>

            <div class="image-card">
                <h3>⚫ Grayscale Version</h3>
                <img src="/temp/gray_chart_${chartId}.png" alt="Grayscale chart">
                <div class="status available">✅ Generated for Debug</div>
            </div>

            <div class="image-card">
                <h3>🔍 Edge Detection Map</h3>
                ${chart.edgeMapPath ? `
                    <img src="${chart.edgeMapPath}" alt="Edge map">
                    <div class="status available">✅ Available</div>
                ` : `
                    <div style="height: 200px; background: #f8f9fa; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #666;">
                        Edge map not available
                    </div>
                    <div class="status missing">❌ Missing</div>
                `}
            </div>

            <div class="image-card">
                <h3>📈 Gradient Map</h3>
                ${chart.gradientMapPath ? `
                    <img src="${chart.gradientMapPath}" alt="Gradient map">
                    <div class="status available">✅ Available</div>
                ` : `
                    <div style="height: 200px; background: #f8f9fa; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #666;">
                        Gradient map not available
                    </div>
                    <div class="status missing">❌ Missing</div>
                `}
            </div>

            <div class="image-card">
                <h3>🌊 Depth Map</h3>
                ${chart.depthMapPath ? `
                    <img src="${chart.depthMapPath}" alt="Depth map">
                    <div class="status available">✅ Available</div>
                ` : `
                    <div style="height: 200px; background: #f8f9fa; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #666;">
                        Depth map not available
                    </div>
                    <div class="status missing">❌ Missing</div>
                `}
            </div>
        </div>

        <div class="metadata">
            <h2>Processing Metadata</h2>
            <div class="metadata-grid">
                <div class="metadata-item">
                    <strong>CLIP Embedding</strong>
                    ${chart.embedding ? '✅ Available (1024D vector)' : '❌ Missing'}
                </div>
                <div class="metadata-item">
                    <strong>Depth Map Path</strong>
                    ${chart.depthMapPath || 'Not generated'}
                </div>
                <div class="metadata-item">
                    <strong>Edge Map Path</strong>
                    ${chart.edgeMapPath || 'Not generated'}
                </div>
                <div class="metadata-item">
                    <strong>Gradient Map Path</strong>
                    ${chart.gradientMapPath || 'Not generated'}
                </div>
                <div class="metadata-item">
                    <strong>File Size</strong>
                    ${chart.filename}
                </div>
                <div class="metadata-item">
                    <strong>Session</strong>
                    ${chart.session || 'Not specified'}
                </div>
            </div>
        </div>

        <div style="margin-top: 30px; text-align: center; color: #666;">
            <p>🔍 This debug view helps verify what GPT-4o sees during analysis</p>
            <p><a href="/debug/report" style="color: #007bff;">View Full System Report</a></p>
        </div>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Debug preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// QA Report route
router.get('/report', async (req, res) => {
  try {
    const charts = await storage.getAllCharts();
    
    // Generate comprehensive report
    const report = {
      totalCharts: charts.length,
      summary: {
        withClipEmbedding: 0,
        withDepthMap: 0,
        withEdgeMap: 0,
        withGradientMap: 0,
        completeProcessing: 0
      },
      charts: [] as Array<{
        id: number;
        originalName: string;
        timeframe: string;
        instrument: string;
        clip: string;
        depth: string;
        edge: string;
        gradient: string;
        complete: string;
        depthMapPath: string;
        edgeMapPath: string;
        gradientMapPath: string;
      }>
    };

    for (const chart of charts) {
      const hasClip = chart.embedding && chart.embedding.length > 0;
      const hasDepth = !!chart.depthMapPath;
      const hasEdge = !!chart.edgeMapPath;
      const hasGradient = !!chart.gradientMapPath;
      
      if (hasClip) report.summary.withClipEmbedding++;
      if (hasDepth) report.summary.withDepthMap++;
      if (hasEdge) report.summary.withEdgeMap++;
      if (hasGradient) report.summary.withGradientMap++;
      if (hasClip && hasDepth && hasEdge && hasGradient) report.summary.completeProcessing++;

      report.charts.push({
        id: chart.id,
        originalName: chart.originalName,
        timeframe: chart.timeframe,
        instrument: chart.instrument,
        clip: hasClip ? '✅' : '❌',
        depth: hasDepth ? '✅' : '❌',
        edge: hasEdge ? '✅' : '❌',
        gradient: hasGradient ? '✅' : '❌',
        complete: (hasClip && hasDepth && hasEdge && hasGradient) ? '✅' : '❌',
        depthMapPath: chart.depthMapPath || '',
        edgeMapPath: chart.edgeMapPath || '',
        gradientMapPath: chart.gradientMapPath || ''
      });
    }

    // Return JSON if requested
    if (req.query.format === 'json') {
      return res.json(report);
    }

    // Return CSV if requested
    if (req.query.format === 'csv') {
      const csvHeaders = 'chart_id,original_name,timeframe,instrument,clip,depth,edge,gradient,complete,depth_path,edge_path,gradient_path\n';
      const csvRows = report.charts.map(chart => 
        `${chart.id},"${chart.originalName}","${chart.timeframe}","${chart.instrument || ''}","${chart.clip}","${chart.depth}","${chart.edge}","${chart.gradient}","${chart.complete}","${chart.depthMapPath}","${chart.edgeMapPath}","${chart.gradientMapPath}"`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="chart_processing_report.csv"');
      return res.send(csvHeaders + csvRows);
    }

    // Default HTML report
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chart Processing QA Report</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                background: #f5f5f5; 
            }
            .header {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .summary {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 30px;
            }
            .summary-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                text-align: center;
            }
            .summary-card h3 {
                margin: 0 0 10px 0;
                color: #333;
                font-size: 14px;
            }
            .summary-card .number {
                font-size: 28px;
                font-weight: bold;
                color: #007bff;
            }
            .table-container {
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            th {
                background: #f8f9fa;
                font-weight: bold;
                color: #333;
            }
            tr:hover {
                background: #f8f9fa;
            }
            .status {
                font-size: 16px;
            }
            .download-links {
                margin: 20px 0;
                text-align: center;
            }
            .download-links a {
                display: inline-block;
                margin: 0 10px;
                padding: 10px 20px;
                background: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 4px;
            }
            .download-links a:hover {
                background: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 Chart Processing QA Report</h1>
            <p>Comprehensive status of image processing pipeline for all ${report.totalCharts} charts</p>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>Total Charts</h3>
                <div class="number">${report.totalCharts}</div>
            </div>
            <div class="summary-card">
                <h3>CLIP Embeddings</h3>
                <div class="number">${report.summary.withClipEmbedding}</div>
            </div>
            <div class="summary-card">
                <h3>Depth Maps</h3>
                <div class="number">${report.summary.withDepthMap}</div>
            </div>
            <div class="summary-card">
                <h3>Edge Maps</h3>
                <div class="number">${report.summary.withEdgeMap}</div>
            </div>
            <div class="summary-card">
                <h3>Gradient Maps</h3>
                <div class="number">${report.summary.withGradientMap}</div>
            </div>
            <div class="summary-card">
                <h3>Complete Processing</h3>
                <div class="number">${report.summary.completeProcessing}</div>
            </div>
        </div>

        <div class="download-links">
            <a href="/debug/report?format=csv">📄 Download CSV Report</a>
            <a href="/debug/report?format=json">📋 Download JSON Report</a>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Original Name</th>
                        <th>Timeframe</th>
                        <th>Instrument</th>
                        <th>CLIP</th>
                        <th>Depth</th>
                        <th>Edge</th>
                        <th>Gradient</th>
                        <th>Complete</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.charts.map(chart => `
                        <tr>
                            <td>${chart.id}</td>
                            <td>${chart.originalName}</td>
                            <td>${chart.timeframe}</td>
                            <td>${chart.instrument || 'N/A'}</td>
                            <td class="status">${chart.clip}</td>
                            <td class="status">${chart.depth}</td>
                            <td class="status">${chart.edge}</td>
                            <td class="status">${chart.gradient}</td>
                            <td class="status">${chart.complete}</td>
                            <td><a href="/debug/chart/${chart.id}/preview" target="_blank">🔍 View</a></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div style="margin-top: 30px; text-align: center; color: #666;">
            <p>🔍 Click "View" next to any chart to see detailed image processing results</p>
        </div>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('QA report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Admin dashboard route for CLIP index management
router.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chart Analysis Admin Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .action-card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .button { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .button:hover { background: #005a87; }
        .success { color: green; }
        .error { color: red; }
        .debug-toggle { margin: 20px 0; }
        .debug-info { background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Chart Analysis Admin Dashboard</h1>
        
        <div class="action-card">
          <h3>🔄 CLIP Vector Index Management</h3>
          <p>Rebuild the CLIP embedding index to fix similarity search issues and ensure all charts have proper embeddings.</p>
          <button class="button" onclick="rebuildClipIndex()">Rebuild CLIP Index</button>
          <div id="clip-status"></div>
        </div>
        
        <div class="action-card">
          <h3>🐛 Debug Settings</h3>
          <div class="debug-toggle">
            <label>
              <input type="checkbox" id="debug-checkbox" onchange="toggleDebugMode()"> 
              Show Similarity Retrieval Debug Logs
            </label>
          </div>
          <div class="debug-info">
            <strong>Debug Mode Features:</strong>
            <ul>
              <li>Vector similarity distances and percentages</li>
              <li>Which charts were found in similarity search</li>
              <li>File existence verification for each result</li>
              <li>CLIP embedding validation status</li>
            </ul>
            <p><em>To use: Add ?debug=true to any analysis URL</em></p>
          </div>
        </div>
        
        <div class="action-card">
          <h3>📊 System Status</h3>
          <button class="button" onclick="checkSystemStatus()">Check Chart Database Status</button>
          <div id="system-status"></div>
        </div>
      </div>

      <script>
        async function rebuildClipIndex() {
          const statusDiv = document.getElementById('clip-status');
          statusDiv.innerHTML = '<p>🔄 Rebuilding CLIP index...</p>';
          
          try {
            const response = await fetch('/api/admin/rebuild-clip-index', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
              statusDiv.innerHTML = \`
                <div class="success">
                  <h4>✅ CLIP Index Rebuild Complete</h4>
                  <p>Total charts: \${result.details.totalCharts}</p>
                  <p>Charts processed: \${result.details.chartsProcessed}</p>
                  <p>Successful: \${result.details.successful}</p>
                  <p>Failed: \${result.details.failed}</p>
                </div>
              \`;
            } else {
              statusDiv.innerHTML = \`<div class="error">❌ \${result.message}</div>\`;
            }
          } catch (error) {
            statusDiv.innerHTML = \`<div class="error">❌ Error: \${error.message}</div>\`;
          }
        }
        
        async function checkSystemStatus() {
          const statusDiv = document.getElementById('system-status');
          statusDiv.innerHTML = '<p>🔍 Checking system status...</p>';
          
          try {
            const response = await fetch('/api/charts');
            const result = await response.json();
            
            const validCharts = result.charts.filter(chart => chart.embedding && chart.embedding.length === 1024);
            
            statusDiv.innerHTML = \`
              <div class="success">
                <h4>📊 System Status</h4>
                <p>Total charts: \${result.charts.length}</p>
                <p>Charts with valid CLIP embeddings: \${validCharts.length}</p>
                <p>Missing embeddings: \${result.charts.length - validCharts.length}</p>
              </div>
            \`;
          } catch (error) {
            statusDiv.innerHTML = \`<div class="error">❌ Error: \${error.message}</div>\`;
          }
        }
        
        function toggleDebugMode() {
          const checkbox = document.getElementById('debug-checkbox');
          if (checkbox.checked) {
            alert('Debug mode enabled! Add ?debug=true to analysis URLs to see detailed similarity logs.');
          } else {
            alert('Debug mode disabled.');
          }
        }
      </script>
    </body>
    </html>
  `);
});

export default router;
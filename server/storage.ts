import { users, charts, analysisResults, chartBundles, type User, type InsertUser, type Chart, type InsertChart, type AnalysisResult, type InsertAnalysis, type ChartBundle, type InsertBundle, type BundleMetadata } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { existsSync } from "fs";
import { join } from "path";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createChart(chart: InsertChart): Promise<Chart>;
  getChart(id: number): Promise<Chart | undefined>;
  getAllCharts(timeframe?: string, instrument?: string): Promise<Chart[]>;
  getChartsByInstrument(instrument: string): Promise<Chart[]>;
  updateChart(id: number, updates: Partial<Chart>): Promise<Chart | undefined>;
  deleteChart(id: number): Promise<boolean>;
  deleteCharts(ids: number[]): Promise<boolean>;
  
  createAnalysis(analysis: InsertAnalysis): Promise<AnalysisResult>;
  getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined>;
  getAnalysisByBundleId(bundleId: string): Promise<AnalysisResult | undefined>;
  getAllAnalyses(): Promise<AnalysisResult[]>;
  
  createBundle(bundle: InsertBundle): Promise<ChartBundle>;
  getBundle(id: string): Promise<ChartBundle | undefined>;
  getAllBundles(instrument?: string): Promise<ChartBundle[]>;
  updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined>;
  deleteBundle(id: string): Promise<boolean>;
  getChartsByBundleId(bundleId: string): Promise<Chart[]>;
  
  findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private charts: Map<number, Chart>;
  private analyses: Map<number, AnalysisResult>;
  private bundles: Map<string, ChartBundle>;
  private currentUserId: number;
  private currentChartId: number;
  private currentAnalysisId: number;

  constructor() {
    this.users = new Map();
    this.charts = new Map();
    this.analyses = new Map();
    this.bundles = new Map();
    this.currentUserId = 1;
    this.currentChartId = 1;
    this.currentAnalysisId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createChart(insertChart: InsertChart): Promise<Chart> {
    const id = this.currentChartId++;
    const chart: Chart = {
      ...insertChart,
      id,
      uploadedAt: new Date().toISOString(),
      comment: insertChart.comment || null,
      depthMapPath: insertChart.depthMapPath || null,
      edgeMapPath: insertChart.edgeMapPath || null,
      gradientMapPath: insertChart.gradientMapPath || null,
      embedding: insertChart.embedding || null,
      instrument: insertChart.instrument,
      session: insertChart.session || null,
      bundleId: insertChart.bundleId || null,
    };
    this.charts.set(id, chart);
    return chart;
  }

  async getChart(id: number): Promise<Chart | undefined> {
    return this.charts.get(id);
  }

  async getAllCharts(timeframe?: string, instrument?: string): Promise<Chart[]> {
    let allCharts = Array.from(this.charts.values());
    if (timeframe) {
      allCharts = allCharts.filter(chart => chart.timeframe === timeframe);
    }
    if (instrument) {
      allCharts = allCharts.filter(chart => chart.instrument === instrument);
    }
    return allCharts.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getChartsByInstrument(instrument: string): Promise<Chart[]> {
    const allCharts = Array.from(this.charts.values());
    return allCharts
      .filter(chart => chart.instrument === instrument)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async updateChart(id: number, updates: Partial<Chart>): Promise<Chart | undefined> {
    const chart = this.charts.get(id);
    if (!chart) return undefined;
    
    const updatedChart = { ...chart, ...updates };
    this.charts.set(id, updatedChart);
    return updatedChart;
  }

  async deleteChart(id: number): Promise<boolean> {
    // First delete any analysis results for this chart
    const analysesToDelete = Array.from(this.analyses.entries())
      .filter(([_, analysis]) => analysis.chartId === id)
      .map(([analysisId, _]) => analysisId);
    
    for (const analysisId of analysesToDelete) {
      this.analyses.delete(analysisId);
    }
    
    // Then delete the chart
    return this.charts.delete(id);
  }

  async deleteCharts(ids: number[]): Promise<boolean> {
    let deleted = true;
    for (const id of ids) {
      // First delete any analysis results for this chart
      const analysesToDelete = Array.from(this.analyses.entries())
        .filter(([_, analysis]) => analysis.chartId === id)
        .map(([analysisId, _]) => analysisId);
      
      for (const analysisId of analysesToDelete) {
        this.analyses.delete(analysisId);
      }
      
      // Then delete the chart
      if (!this.charts.delete(id)) {
        deleted = false;
      }
    }
    return deleted;
  }

  async createAnalysis(insertAnalysis: InsertAnalysis): Promise<AnalysisResult> {
    const id = this.currentAnalysisId++;
    const analysis: AnalysisResult = {
      ...insertAnalysis,
      id,
      createdAt: new Date().toISOString(),
      chartId: insertAnalysis.chartId || null,
      bundleId: insertAnalysis.bundleId || null,
    };
    this.analyses.set(id, analysis);
    return analysis;
  }

  async getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined> {
    return Array.from(this.analyses.values()).find(
      (analysis) => analysis.chartId === chartId,
    );
  }

  async getAnalysisByBundleId(bundleId: string): Promise<AnalysisResult | undefined> {
    return Array.from(this.analyses.values()).find(
      (analysis) => analysis.bundleId === bundleId,
    );
  }

  async getAllAnalyses(): Promise<AnalysisResult[]> {
    return Array.from(this.analyses.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createBundle(insertBundle: InsertBundle): Promise<ChartBundle> {
    const bundle: ChartBundle = {
      ...insertBundle,
      session: insertBundle.session || null,
      createdAt: new Date().toISOString(),
    };
    this.bundles.set(bundle.id, bundle);
    return bundle;
  }

  async getBundle(id: string): Promise<ChartBundle | undefined> {
    return this.bundles.get(id);
  }

  async getAllBundles(instrument?: string): Promise<ChartBundle[]> {
    let allBundles = Array.from(this.bundles.values());
    if (instrument) {
      allBundles = allBundles.filter(bundle => bundle.instrument === instrument);
    }
    return allBundles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined> {
    const bundle = this.bundles.get(id);
    if (!bundle) return undefined;
    
    const updatedBundle = { ...bundle, ...updates };
    this.bundles.set(id, updatedBundle);
    return updatedBundle;
  }

  async deleteBundle(id: string): Promise<boolean> {
    // First delete any analysis results for this bundle
    const analysesToDelete = Array.from(this.analyses.entries())
      .filter(([_, analysis]) => analysis.bundleId === id)
      .map(([analysisId, _]) => analysisId);
    
    for (const analysisId of analysesToDelete) {
      this.analyses.delete(analysisId);
    }
    
    // Update charts to remove bundle reference
    Array.from(this.charts.entries()).forEach(([chartId, chart]) => {
      if (chart.bundleId === id) {
        const updatedChart = { ...chart, bundleId: null };
        this.charts.set(chartId, updatedChart);
      }
    });
    
    // Then delete the bundle
    return this.bundles.delete(id);
  }

  async getChartsByBundleId(bundleId: string): Promise<Chart[]> {
    return Array.from(this.charts.values())
      .filter(chart => chart.bundleId === bundleId)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async findSimilarCharts(embedding: number[], limit: number, debugLogs: boolean = false): Promise<Array<{ chart: Chart; similarity: number }>> {
    // fs and path modules are now imported at top level
    
    const allCharts = Array.from(this.charts.values());
    
    if (debugLogs) {
      console.log(`🔍 SIMILARITY DEBUG (Memory): Searching ${allCharts.length} total charts in memory`);
    }
    
    // Filter charts with valid embeddings and check file existence
    const validCharts = [];
    for (const chart of allCharts) {
      if (!chart.embedding || chart.embedding.length === 0) {
        if (debugLogs) {
          console.log(`❌ Chart ${chart.id} (${chart.filename}): No embedding`);
        }
        continue;
      }
      
      // Check if main chart file exists
      const chartPath = join(process.cwd(), 'server', 'uploads', chart.filename);
      if (!existsSync(chartPath)) {
        if (debugLogs) {
          console.log(`❌ Chart ${chart.id} (${chart.filename}): File missing at ${chartPath}`);
        }
        continue;
      }
      
      validCharts.push(chart);
      if (debugLogs) {
        console.log(`✅ Chart ${chart.id} (${chart.filename}): Valid for similarity search`);
      }
    }
    
    if (debugLogs) {
      console.log(`🎯 SIMILARITY DEBUG (Memory): ${validCharts.length} charts with valid embeddings and existing files`);
    }
    
    const similarities = validCharts.map(chart => {
      const similarity = this.calculateCosineSimilarity(embedding, chart.embedding!);
      return { chart, similarity };
    });

    const results = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
      
    if (debugLogs) {
      console.log(`📊 SIMILARITY RESULTS (Memory):`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. Chart ${result.chart.id} (${result.chart.filename}): ${(result.similarity * 100).toFixed(2)}% similarity`);
      });
    }

    return results;
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values([insertUser])
      .returning();
    return user;
  }

  async createChart(insertChart: InsertChart): Promise<Chart> {
    const [chart] = await db
      .insert(charts)
      .values([{
        ...insertChart,
        uploadedAt: new Date().toISOString()
      }])
      .returning();
    return chart;
  }

  async getChart(id: number): Promise<Chart | undefined> {
    const [chart] = await db.select().from(charts).where(eq(charts.id, id));
    return chart || undefined;
  }

  async getAllCharts(timeframe?: string, instrument?: string): Promise<Chart[]> {
    let query = db.select().from(charts).orderBy(desc(charts.uploadedAt));
    
    if (timeframe && instrument) {
      return await query.where(and(eq(charts.timeframe, timeframe), eq(charts.instrument, instrument)));
    } else if (timeframe) {
      return await query.where(eq(charts.timeframe, timeframe));
    } else if (instrument) {
      return await query.where(eq(charts.instrument, instrument));
    }
    
    return await query;
  }

  async getChartsByInstrument(instrument: string): Promise<Chart[]> {
    return await db.select().from(charts)
      .where(eq(charts.instrument, instrument))
      .orderBy(desc(charts.uploadedAt));
  }

  async updateChart(id: number, updates: Partial<Chart>): Promise<Chart | undefined> {
    const [updatedChart] = await db
      .update(charts)
      .set(updates)
      .where(eq(charts.id, id))
      .returning();
    return updatedChart || undefined;
  }

  async deleteChart(id: number): Promise<boolean> {
    // First delete any analysis results for this chart
    await db.delete(analysisResults).where(eq(analysisResults.chartId, id));
    
    // Then delete the chart
    const result = await db.delete(charts).where(eq(charts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteCharts(ids: number[]): Promise<boolean> {
    // First delete any analysis results for these charts
    for (const id of ids) {
      await db.delete(analysisResults).where(eq(analysisResults.chartId, id));
    }
    
    // Then delete the charts
    const results = await Promise.all(
      ids.map(id => db.delete(charts).where(eq(charts.id, id)))
    );
    return results.every(result => (result.rowCount ?? 0) > 0);
  }

  async createAnalysis(insertAnalysis: InsertAnalysis): Promise<AnalysisResult> {
    const [analysis] = await db
      .insert(analysisResults)
      .values([{
        ...insertAnalysis,
        createdAt: new Date().toISOString()
      }])
      .returning();
    return analysis;
  }

  async getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined> {
    const [analysis] = await db.select().from(analysisResults).where(eq(analysisResults.chartId, chartId));
    return analysis || undefined;
  }

  async getAnalysisByBundleId(bundleId: string): Promise<AnalysisResult | undefined> {
    const [analysis] = await db.select().from(analysisResults).where(eq(analysisResults.bundleId, bundleId));
    return analysis || undefined;
  }

  async getAllAnalyses(): Promise<AnalysisResult[]> {
    return await db.select().from(analysisResults).orderBy(desc(analysisResults.createdAt));
  }

  async createBundle(insertBundle: InsertBundle): Promise<ChartBundle> {
    const [bundle] = await db
      .insert(chartBundles)
      .values([{
        ...insertBundle,
        createdAt: new Date().toISOString()
      }])
      .returning();
    return bundle;
  }

  async getBundle(id: string): Promise<ChartBundle | undefined> {
    const [bundle] = await db.select().from(chartBundles).where(eq(chartBundles.id, id));
    return bundle || undefined;
  }

  async getAllBundles(instrument?: string): Promise<ChartBundle[]> {
    let query = db.select().from(chartBundles).orderBy(desc(chartBundles.createdAt));
    
    if (instrument) {
      return await query.where(eq(chartBundles.instrument, instrument));
    }
    
    return await query;
  }

  async updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined> {
    const [updatedBundle] = await db
      .update(chartBundles)
      .set(updates)
      .where(eq(chartBundles.id, id))
      .returning();
    return updatedBundle || undefined;
  }

  async deleteBundle(id: string): Promise<boolean> {
    // First delete any analysis results for this bundle
    await db.delete(analysisResults).where(eq(analysisResults.bundleId, id));
    
    // Update charts to remove bundle reference
    await db.update(charts).set({ bundleId: null }).where(eq(charts.bundleId, id));
    
    // Then delete the bundle
    const result = await db.delete(chartBundles).where(eq(chartBundles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getChartsByBundleId(bundleId: string): Promise<Chart[]> {
    return await db.select().from(charts)
      .where(eq(charts.bundleId, bundleId))
      .orderBy(desc(charts.uploadedAt));
  }

  async findSimilarCharts(embedding: number[], limit: number, debugLogs: boolean = false): Promise<Array<{ chart: Chart; similarity: number }>> {
    // fs and path modules are now imported at top level
    
    // Get all charts with embeddings (note: the WHERE clause needs to be corrected for checking non-null)
    const allCharts = await db.select().from(charts);
    
    if (debugLogs) {
      console.log(`🔍 SIMILARITY DEBUG: Searching ${allCharts.length} total charts in database`);
    }
    
    // Filter charts with valid embeddings and check file existence
    const validCharts = [];
    for (const chart of allCharts) {
      if (!chart.embedding || chart.embedding.length === 0) {
        if (debugLogs) {
          console.log(`❌ Chart ${chart.id} (${chart.filename}): No embedding`);
        }
        continue;
      }
      
      // Check if main chart file exists
      const chartPath = join(process.cwd(), 'server', 'uploads', chart.filename);
      if (!existsSync(chartPath)) {
        if (debugLogs) {
          console.log(`❌ Chart ${chart.id} (${chart.filename}): File missing at ${chartPath}`);
        }
        continue;
      }
      
      validCharts.push(chart);
      if (debugLogs) {
        console.log(`✅ Chart ${chart.id} (${chart.filename}): Valid for similarity search`);
      }
    }
    
    if (debugLogs) {
      console.log(`🎯 SIMILARITY DEBUG: ${validCharts.length} charts with valid embeddings and existing files`);
    }
    
    // Calculate similarities for valid charts only
    const similarities = validCharts.map(chart => {
      const similarity = this.calculateCosineSimilarity(embedding, chart.embedding!);
      return { chart, similarity };
    });

    const results = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
      
    if (debugLogs) {
      console.log(`📊 SIMILARITY RESULTS:`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. Chart ${result.chart.id} (${result.chart.filename}): ${(result.similarity * 100).toFixed(2)}% similarity`);
      });
    }

    return results;
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export const storage = new DatabaseStorage();

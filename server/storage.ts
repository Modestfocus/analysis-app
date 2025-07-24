import { users, charts, analysisResults, type User, type InsertUser, type Chart, type InsertChart, type AnalysisResult, type InsertAnalysis } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

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
  
  findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private charts: Map<number, Chart>;
  private analyses: Map<number, AnalysisResult>;
  private currentUserId: number;
  private currentChartId: number;
  private currentAnalysisId: number;

  constructor() {
    this.users = new Map();
    this.charts = new Map();
    this.analyses = new Map();
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
      embedding: insertChart.embedding || null,
      instrument: insertChart.instrument,
      session: insertChart.session || null,
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
    return this.charts.delete(id);
  }

  async deleteCharts(ids: number[]): Promise<boolean> {
    let deleted = true;
    for (const id of ids) {
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
    };
    this.analyses.set(id, analysis);
    return analysis;
  }

  async getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined> {
    return Array.from(this.analyses.values()).find(
      (analysis) => analysis.chartId === chartId,
    );
  }

  async findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>> {
    const chartsWithEmbeddings = Array.from(this.charts.values()).filter(chart => chart.embedding);
    
    const similarities = chartsWithEmbeddings.map(chart => {
      const similarity = this.calculateCosineSimilarity(embedding, chart.embedding!);
      return { chart, similarity };
    });

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
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
    const result = await db.delete(charts).where(eq(charts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteCharts(ids: number[]): Promise<boolean> {
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

  async findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>> {
    // Get all charts with embeddings (note: the WHERE clause needs to be corrected for checking non-null)
    const allCharts = await db.select().from(charts);
    
    // Calculate similarities in memory (for now - could be optimized with vector DB extensions)
    const similarities = allCharts
      .filter(chart => chart.embedding && chart.embedding.length > 0)
      .map(chart => {
        const similarity = this.calculateCosineSimilarity(embedding, chart.embedding!);
        return { chart, similarity };
      });

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
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

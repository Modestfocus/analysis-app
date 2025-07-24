import { users, charts, analysisResults, type User, type InsertUser, type Chart, type InsertChart, type AnalysisResult, type InsertAnalysis } from "@shared/schema";

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

export const storage = new MemStorage();

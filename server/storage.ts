import { 
  users, 
  charts, 
  analysisResults, 
  chartBundles, 
  watchlists,
  chartLayouts,
  documents,
  type User, 
  type InsertUser, 
  type Chart, 
  type InsertChart, 
  type AnalysisResult, 
  type InsertAnalysis, 
  type ChartBundle, 
  type InsertBundle,
  type Watchlist,
  type InsertWatchlist,
  type ChartLayout,
  type InsertChartLayout,
  type Document,
  type InsertDocument
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { existsSync } from "fs";
import { join } from "path";
import axios from "axios";
import * as cheerio from "cheerio";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  linkWalletToUser(userId: string, walletAddress: string, walletType: string): Promise<User | undefined>;
  
  // Chart operations
  createChart(chart: InsertChart): Promise<Chart>;
  getChart(id: number): Promise<Chart | undefined>;
  getAllCharts(timeframe?: string, instrument?: string): Promise<Chart[]>;
  getChartsByInstrument(instrument: string): Promise<Chart[]>;
  updateChart(id: number, updates: Partial<Chart>): Promise<Chart | undefined>;
  deleteChart(id: number): Promise<boolean>;
  deleteCharts(ids: number[]): Promise<boolean>;
  
  // Analysis operations
  createAnalysis(analysis: InsertAnalysis): Promise<AnalysisResult>;
  getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined>;
  getAnalysisByBundleId(bundleId: string): Promise<AnalysisResult | undefined>;
  getAllAnalyses(): Promise<AnalysisResult[]>;
  
  // Bundle operations
  createBundle(bundle: InsertBundle): Promise<ChartBundle>;
  getBundle(id: string): Promise<ChartBundle | undefined>;
  getAllBundles(instrument?: string): Promise<ChartBundle[]>;
  updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined>;
  deleteBundle(id: string): Promise<boolean>;
  getChartsByBundleId(bundleId: string): Promise<Chart[]>;
  
  // Watchlist operations
  getUserWatchlist(userId: string): Promise<Watchlist[]>;
  addToWatchlist(watchlistItem: InsertWatchlist): Promise<Watchlist>;
  removeFromWatchlist(userId: string, symbol: string): Promise<void>;
  importWatchlistFromURL(url: string, userId: string): Promise<string[]>;
  
  // Chart layout operations
  getUserChartLayout(userId: string): Promise<ChartLayout | undefined>;
  saveChartLayout(layout: InsertChartLayout): Promise<ChartLayout>;
  
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentByFilename(filename: string): Promise<Document | undefined>;
  getUserDocuments(userId: string): Promise<Document[]>;
  updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined>;
  deleteDocument(id: number): Promise<boolean>;
  
  // Similarity search
  findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private charts: Map<number, Chart>;
  private analyses: Map<number, AnalysisResult>;
  private bundles: Map<string, ChartBundle>;
  private watchlists: Map<string, Watchlist[]>;
  private chartLayouts: Map<string, ChartLayout>;
  private documents: Map<number, Document>;
  private currentChartId: number;
  private currentAnalysisId: number;
  private currentDocumentId: number;

  constructor() {
    this.users = new Map();
    this.charts = new Map();
    this.analyses = new Map();
    this.bundles = new Map();
    this.watchlists = new Map();
    this.chartLayouts = new Map();
    this.documents = new Map();
    this.currentChartId = 1;
    this.currentAnalysisId = 1;
    this.currentDocumentId = 1;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.walletAddress === walletAddress,
    );
  }

  async linkWalletToUser(userId: string, walletAddress: string, walletType: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    const updatedUser = { ...user, walletAddress, walletType };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user: User = { 
      ...insertUser, 
      id,
      email: insertUser.email || null,
      passwordHash: insertUser.passwordHash || null,
      username: insertUser.username || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      profileImageUrl: insertUser.profileImageUrl || null,
      walletAddress: insertUser.walletAddress || null,
      walletType: insertUser.walletType || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async createChart(insertChart: InsertChart): Promise<Chart> {
    const id = this.currentChartId++;
    const chart: Chart = {
      ...insertChart,
      id,
      userId: insertChart.userId || null,
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
    return Array.from(this.charts.values()).filter(chart => chart.instrument === instrument);
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
    let success = true;
    for (const id of ids) {
      if (!this.charts.delete(id)) {
        success = false;
      }
    }
    return success;
  }

  async createAnalysis(insertAnalysis: InsertAnalysis): Promise<AnalysisResult> {
    const id = this.currentAnalysisId++;
    const analysis: AnalysisResult = {
      ...insertAnalysis,
      id,
      chartId: insertAnalysis.chartId || null,
      bundleId: insertAnalysis.bundleId || null,
      createdAt: new Date().toISOString(),
    };
    this.analyses.set(id, analysis);
    return analysis;
  }

  async getAnalysisByChartId(chartId: number): Promise<AnalysisResult | undefined> {
    return Array.from(this.analyses.values()).find(analysis => analysis.chartId === chartId);
  }

  async getAnalysisByBundleId(bundleId: string): Promise<AnalysisResult | undefined> {
    return Array.from(this.analyses.values()).find(analysis => analysis.bundleId === bundleId);
  }

  async getAllAnalyses(): Promise<AnalysisResult[]> {
    return Array.from(this.analyses.values());
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
    return allBundles;
  }

  async updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined> {
    const bundle = this.bundles.get(id);
    if (!bundle) return undefined;
    const updatedBundle = { ...bundle, ...updates };
    this.bundles.set(id, updatedBundle);
    return updatedBundle;
  }

  async deleteBundle(id: string): Promise<boolean> {
    return this.bundles.delete(id);
  }

  async getChartsByBundleId(bundleId: string): Promise<Chart[]> {
    return Array.from(this.charts.values()).filter(chart => chart.bundleId === bundleId);
  }

  async getUserWatchlist(userId: string): Promise<Watchlist[]> {
    return this.watchlists.get(userId) || [];
  }

  async addToWatchlist(insertWatchlist: InsertWatchlist): Promise<Watchlist> {
    const id = `watchlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const watchlistItem: Watchlist = {
      ...insertWatchlist,
      id,
      createdAt: new Date()
    };
    
    const userWatchlist = this.watchlists.get(insertWatchlist.userId) || [];
    userWatchlist.push(watchlistItem);
    this.watchlists.set(insertWatchlist.userId, userWatchlist);
    
    return watchlistItem;
  }

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    const userWatchlist = this.watchlists.get(userId) || [];
    const filteredWatchlist = userWatchlist.filter(item => item.symbol !== symbol);
    this.watchlists.set(userId, filteredWatchlist);
  }

  async importWatchlistFromURL(url: string, userId: string): Promise<string[]> {
    // MemStorage implementation - this is mainly for testing/development
    throw new Error('URL import is not supported in memory storage. Please use database storage.');
  }

  async getUserChartLayout(userId: string): Promise<ChartLayout | undefined> {
    return this.chartLayouts.get(userId);
  }

  async saveChartLayout(insertLayout: InsertChartLayout): Promise<ChartLayout> {
    const id = `layout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const layout: ChartLayout = {
      ...insertLayout,
      id,
      updatedAt: new Date()
    };
    
    this.chartLayouts.set(insertLayout.userId, layout);
    return layout;
  }

  // Document operations (MemStorage implementation)
  private documents: Map<number, Document> = new Map();

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = Math.max(...Array.from(this.documents.keys()), 0) + 1;
    const document: Document = {
      ...insertDocument,
      id,
      uploadedAt: new Date(),
      tags: insertDocument.tags || null,
      description: insertDocument.description || null
    };
    this.documents.set(id, document);
    return document;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getDocumentByFilename(filename: string): Promise<Document | undefined> {
    return Array.from(this.documents.values()).find(doc => doc.filename === filename);
  }

  async getUserDocuments(userId: string): Promise<Document[]> {
    return Array.from(this.documents.values()).filter(doc => doc.userId === userId);
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const document = this.documents.get(id);
    if (!document) return undefined;
    const updatedDocument = { ...document, ...updates };
    this.documents.set(id, updatedDocument);
    return updatedDocument;
  }

  async deleteDocument(id: number): Promise<boolean> {
    return this.documents.delete(id);
  }

  async findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>> {
    const similarities: Array<{ chart: Chart; similarity: number }> = [];

    for (const chart of Array.from(this.charts.values())) {
      if (!chart.embedding) continue;
      
      const similarity = this.calculateCosineSimilarity(embedding, chart.embedding);
      if (similarity > 0.1) { // Only include charts with some similarity
        similarities.push({ chart, similarity });
      }
    }

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
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user || undefined;
  }

  async linkWalletToUser(userId: string, walletAddress: string, walletType: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ walletAddress, walletType })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.walletAddress, walletAddress));
    return user || undefined;
  }

  async linkWalletToUser(userId: string, walletAddress: string, walletType: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ walletAddress, walletType })
      .where(eq(users.id, userId))
      .returning();
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
    if (timeframe && instrument) {
      return await db.select().from(charts)
        .where(and(eq(charts.timeframe, timeframe), eq(charts.instrument, instrument)))
        .orderBy(desc(charts.uploadedAt));
    } else if (timeframe) {
      return await db.select().from(charts)
        .where(eq(charts.timeframe, timeframe))
        .orderBy(desc(charts.uploadedAt));
    } else if (instrument) {
      return await db.select().from(charts)
        .where(eq(charts.instrument, instrument))
        .orderBy(desc(charts.uploadedAt));
    }
    
    return await db.select().from(charts).orderBy(desc(charts.uploadedAt));
  }

  async getChartsByInstrument(instrument: string): Promise<Chart[]> {
    return await db.select().from(charts).where(eq(charts.instrument, instrument));
  }

  async updateChart(id: number, updates: Partial<Chart>): Promise<Chart | undefined> {
    const [chart] = await db
      .update(charts)
      .set(updates)
      .where(eq(charts.id, id))
      .returning();
    return chart || undefined;
  }

  async deleteChart(id: number): Promise<boolean> {
    // First delete any analysis results that reference this chart
    await db.delete(analysisResults).where(eq(analysisResults.chartId, id));
    
    // Then delete the chart
    const result = await db.delete(charts).where(eq(charts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteCharts(ids: number[]): Promise<boolean> {
    // First delete any analysis results that reference these charts
    for (const id of ids) {
      await db.delete(analysisResults).where(eq(analysisResults.chartId, id));
    }
    
    // Then delete the charts
    let success = true;
    for (const id of ids) {
      const result = await db.delete(charts).where(eq(charts.id, id));
      if ((result.rowCount ?? 0) === 0) {
        success = false;
      }
    }
    return success;
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
    return await db.select().from(analysisResults);
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
    if (instrument) {
      return await db.select().from(chartBundles).where(eq(chartBundles.instrument, instrument));
    }
    return await db.select().from(chartBundles);
  }

  async updateBundle(id: string, updates: Partial<ChartBundle>): Promise<ChartBundle | undefined> {
    const [bundle] = await db
      .update(chartBundles)
      .set(updates)
      .where(eq(chartBundles.id, id))
      .returning();
    return bundle || undefined;
  }

  async deleteBundle(id: string): Promise<boolean> {
    const result = await db.delete(chartBundles).where(eq(chartBundles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getChartsByBundleId(bundleId: string): Promise<Chart[]> {
    return await db.select().from(charts).where(eq(charts.bundleId, bundleId));
  }

  async getUserWatchlist(userId: string): Promise<Watchlist[]> {
    return await db.select().from(watchlists).where(eq(watchlists.userId, userId));
  }

  async addToWatchlist(insertWatchlist: InsertWatchlist): Promise<Watchlist> {
    const [watchlistItem] = await db
      .insert(watchlists)
      .values([insertWatchlist])
      .returning();
    return watchlistItem;
  }

  async removeFromWatchlist(userId: string, symbol: string): Promise<void> {
    await db
      .delete(watchlists)
      .where(and(eq(watchlists.userId, userId), eq(watchlists.symbol, symbol)));
  }

  async importWatchlistFromURL(url: string, userId: string): Promise<string[]> {
    try {
      console.log(`🔍 Importing watchlist from URL: ${url}`);
      
      // Fetch the HTML content from TradingView
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 15000
      });

      if (response.status !== 200) {
        throw new Error(`Failed to fetch page: HTTP ${response.status}`);
      }

      // Parse HTML with Cheerio
      const $ = cheerio.load(response.data);
      const symbols: string[] = [];

      // Multiple selectors to try for different TradingView page layouts
      const selectors = [
        // Common symbol selectors on TradingView
        '[data-symbol]',
        '.tv-screener__symbol',
        '.js-symbol-link',
        '.symbol-name',
        '.tv-symbol-link',
        'a[href*="/symbols/"]',
        '.watchlist-item [data-symbol]',
        '.row .symbol'
      ];

      console.log(`📊 Trying ${selectors.length} different selectors to find symbols...`);

      for (const selector of selectors) {
        $(selector).each((_, element) => {
          const symbolElement = $(element);
          
          // Try different ways to extract symbol
          let symbol = symbolElement.attr('data-symbol') ||
                      symbolElement.text().trim() ||
                      symbolElement.attr('title') ||
                      symbolElement.attr('data-field-key');

          if (symbol) {
            // Clean up symbol - remove exchange prefix if present (e.g., "NASDAQ:AAPL" -> "AAPL")
            symbol = symbol.split(':').pop()?.trim().toUpperCase();
            
            if (symbol && 
                symbol.length > 0 && 
                symbol.length <= 20 && 
                /^[A-Z0-9]+$/.test(symbol) && 
                !symbols.includes(symbol)) {
              symbols.push(symbol);
              console.log(`✓ Found symbol: ${symbol}`);
            }
          }
        });

        if (symbols.length > 0) {
          console.log(`📈 Found ${symbols.length} symbols using selector: ${selector}`);
          break; // Use the first successful selector
        }
      }

      // Alternative: Look for symbol patterns in text content
      if (symbols.length === 0) {
        console.log(`🔍 No symbols found with selectors, trying text pattern matching...`);
        
        const pageText = $.text();
        // Look for common trading symbols pattern
        const symbolMatches = pageText.match(/\b[A-Z]{2,10}(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|\d{2,4})\b/g);
        
        if (symbolMatches) {
          symbolMatches.forEach(match => {
            const cleanSymbol = match.trim().toUpperCase();
            if (!symbols.includes(cleanSymbol) && cleanSymbol.length <= 20) {
              symbols.push(cleanSymbol);
              console.log(`✓ Found symbol via pattern: ${cleanSymbol}`);
            }
          });
        }
      }

      if (symbols.length === 0) {
        throw new Error('No trading symbols found on this page. Please check the URL or try a different watchlist.');
      }

      console.log(`📋 Total symbols found: ${symbols.length} - ${symbols.join(', ')}`);

      // Get existing watchlist to avoid duplicates
      const existingWatchlist = await this.getUserWatchlist(userId);
      const existingSymbols = existingWatchlist.map(item => item.symbol.toUpperCase());

      // Filter out duplicates
      const newSymbols = symbols.filter(symbol => !existingSymbols.includes(symbol.toUpperCase()));
      
      if (newSymbols.length === 0) {
        console.log(`⚠️ All symbols already exist in watchlist`);
        return [];
      }

      console.log(`💾 Adding ${newSymbols.length} new symbols to watchlist: ${newSymbols.join(', ')}`);

      // Add new symbols to watchlist
      const insertPromises = newSymbols.map(symbol => 
        this.addToWatchlist({
          userId,
          symbol: symbol.toUpperCase()
        })
      );

      await Promise.all(insertPromises);

      console.log(`✅ Successfully imported ${newSymbols.length} symbols from ${url}`);
      return newSymbols;

    } catch (error) {
      console.error(`❌ Error importing watchlist from URL:`, error);
      throw new Error(`Failed to import watchlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getUserChartLayout(userId: string): Promise<ChartLayout | undefined> {
    const [layout] = await db.select().from(chartLayouts).where(eq(chartLayouts.userId, userId));
    return layout || undefined;
  }

  async saveChartLayout(insertLayout: InsertChartLayout): Promise<ChartLayout> {
    // Check if layout exists and update, otherwise insert
    const existingLayout = await this.getUserChartLayout(insertLayout.userId);
    
    if (existingLayout) {
      const [layout] = await db
        .update(chartLayouts)
        .set({ layoutConfig: insertLayout.layoutConfig, updatedAt: new Date() })
        .where(eq(chartLayouts.userId, insertLayout.userId))
        .returning();
      return layout;
    } else {
      const [layout] = await db
        .insert(chartLayouts)
        .values([insertLayout])
        .returning();
      return layout;
    }
  }

  // Document operations (DatabaseStorage implementation)
  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values([insertDocument])
      .returning();
    return document;
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getUserDocuments(userId: string): Promise<Document[]> {
    return await db.select().from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.uploadedAt));
  }

  async updateDocument(id: number, updates: Partial<Document>): Promise<Document | undefined> {
    const [document] = await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return document || undefined;
  }

  async deleteDocument(id: number): Promise<boolean> {
    const result = await db.delete(documents).where(eq(documents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async findSimilarCharts(embedding: number[], limit: number): Promise<Array<{ chart: Chart; similarity: number }>> {
    // For database implementation, we would need to implement vector similarity search
    // For now, return empty array as this requires specialized vector database functionality
    return [];
  }
}

export const storage = new DatabaseStorage();
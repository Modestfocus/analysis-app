import { pgTable, text, serial, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const charts = pgTable("charts", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  timeframe: text("timeframe").notNull(),
  instrument: text("instrument").notNull(), // e.g., "XAUUSD", "EURUSD"
  session: text("session"), // e.g., "Asia", "London", "NY"
  uploadedAt: text("uploaded_at").notNull(),
  comment: text("comment").default(""),
  depthMapPath: text("depth_map_path"),
  edgeMapPath: text("edge_map_path"),
  gradientMapPath: text("gradient_map_path"),
  embedding: real("embedding").array(),
  bundleId: text("bundle_id"), // Group related charts together
});

export const chartBundles = pgTable("chart_bundles", {
  id: text("id").primaryKey(), // e.g., "bundle_xyz"
  instrument: text("instrument").notNull(),
  session: text("session"),
  createdAt: text("created_at").notNull(),
  metadata: text("metadata").notNull(), // JSON string with chart_ids, timeframes, etc.
});

export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  chartId: integer("chart_id").references(() => charts.id),
  bundleId: text("bundle_id").references(() => chartBundles.id), // For bundle analysis
  gptAnalysis: text("gpt_analysis").notNull(),
  similarCharts: text("similar_charts").notNull(), // JSON string
  confidence: real("confidence").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertChartSchema = createInsertSchema(charts).omit({
  id: true,
  uploadedAt: true,
});

export const insertAnalysisSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

export const insertBundleSchema = createInsertSchema(chartBundles).omit({
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Chart = typeof charts.$inferSelect;
export type InsertChart = z.infer<typeof insertChartSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type ChartBundle = typeof chartBundles.$inferSelect;
export type InsertBundle = z.infer<typeof insertBundleSchema>;

// Bundle metadata interface
export interface BundleMetadata {
  bundle_id: string;
  instrument: string;
  chart_ids: number[];
  timeframes: string[];
  session?: string;
  created_at: string;
}

export const timeframes = ["5M", "15M", "1H", "4H", "Daily"] as const;
export type Timeframe = typeof timeframes[number];

export const sessions = ["Asia", "London", "NY", "Sydney"] as const;
export type Session = typeof sessions[number];

// Common forex and commodity instruments
export const commonInstruments = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", 
  "AUDUSD", "NZDUSD", "USDCAD", "EURJPY", "GBPJPY", "EURGBP",
  "BTCUSD", "ETHUSD", "SPX500", "NAS100", "US30"
] as const;

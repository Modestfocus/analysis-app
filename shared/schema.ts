import { pgTable, text, serial, integer, boolean, real, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  // Keep existing profile fields for backwards compatibility
  username: text("username").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  // Wallet authentication fields
  walletAddress: text("wallet_address").unique(),
  walletType: text("wallet_type"), // "phantom", "metamask", etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const watchlists = pgTable("watchlists", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  symbol: text("symbol").notNull(), // e.g., "NAS100", "EURUSD"
  createdAt: timestamp("created_at").defaultNow(),
});

export const chartLayouts = pgTable("chart_layouts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  layoutConfig: jsonb("layout_config").notNull(), // Saved chart layout configuration from TradingView SDK
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const charts = pgTable("charts", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id), // Allow null for existing charts
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

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Changed from uuid to text to handle demo-user-id
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileType: text("file_type").notNull(), // "pdf", "doc", "docx", "txt", etc.
  fileSize: integer("file_size").notNull(), // in bytes
  filePath: text("file_path").notNull(), // path to stored file
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  tags: text("tags").array(), // optional tags for organization
  description: text("description"), // optional description
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tradingRules = pgTable("trading_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  order: integer("order").notNull().default(0), // For ordering rules
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chart Analysis Sessions - stores past GPT-4o analysis sessions
export const chartAnalysisSessions = pgTable("chart_analysis_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  systemPrompt: text("system_prompt").notNull(), // The exact prompt sent for this analysis
  chartImageUrl: text("chart_image_url").notNull(), // URL or base64 reference of chart image
  depthMapUrl: text("depth_map_url"), // URL/base64 of depth map image
  edgeMapUrl: text("edge_map_url"), // URL/base64 of edge map
  gradientMapUrl: text("gradient_map_url"), // URL/base64 of gradient map
  vectorMatches: jsonb("vector_matches"), // List of top 3 matched charts & metadata
  gptResponse: text("gpt_response").notNull(), // GPT-4o reply
  createdAt: timestamp("created_at").defaultNow(),
});

// User Prompts History - stores user's historical prompt versions
export const userPromptsHistory = pgTable("user_prompts_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  promptType: text("prompt_type").notNull().default("default"), // 'default', 'custom', 'injected'
  promptContent: text("prompt_content").notNull(), // Full prompt string
  createdAt: timestamp("created_at").defaultNow(), // When this prompt version was created/used
});

// Chat Conversations - stores chat sessions for conversational analysis
export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: integer("user_id").notNull(), // Use integer to match existing users table
  title: text("title").notNull().default("New Chat"), // Auto-generated or user-defined
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat Messages - individual messages within conversations
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => chatConversations.id).notNull(),
  role: text("role").notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(), // Message text content
  imageUrls: text("image_urls").array(), // Array of uploaded chart image URLs
  systemPrompt: text("system_prompt"), // System prompt used for this message (assistant role)
  metadata: jsonb("metadata"), // Additional data like analysis results, similar charts, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWatchlistSchema = createInsertSchema(watchlists).omit({
  id: true,
  createdAt: true,
});

export const insertChartLayoutSchema = createInsertSchema(chartLayouts).omit({
  id: true,
  updatedAt: true,
});

export const insertChartSchema = createInsertSchema(charts).omit({
  id: true,
  uploadedAt: true,
});

export const insertAnalysisSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

// Unified Analysis Response Schema for strict JSON enforcement
export const UnifiedAnalysisResponseSchema = z.object({
  session: z.enum(["Asia", "London", "NY", "Sydney"]),
  direction_bias: z.enum(["Up", "Down", "Sideways"]),
  confidence: z.number().min(0).max(100),
  rationale: z.string().min(10),
  pattern_match: z.array(z.string()).optional(),
  risk_notes: z.string().optional(),
  next_steps: z.string().optional()
});

export const insertBundleSchema = createInsertSchema(chartBundles).omit({
  createdAt: true,
});

// Timeframe enum for validation - removed duplicate to fix error

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTradingRuleSchema = createInsertSchema(tradingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChartAnalysisSessionSchema = createInsertSchema(chartAnalysisSessions).omit({
  id: true,
  createdAt: true,
});

export const insertUserPromptsHistorySchema = createInsertSchema(userPromptsHistory).omit({
  id: true,
  createdAt: true,
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlists.$inferSelect;
export type InsertChartLayout = z.infer<typeof insertChartLayoutSchema>;
export type ChartLayout = typeof chartLayouts.$inferSelect;
export type Chart = typeof charts.$inferSelect;
export type InsertChart = z.infer<typeof insertChartSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type ChartBundle = typeof chartBundles.$inferSelect;
export type InsertBundle = z.infer<typeof insertBundleSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type TradingRule = typeof tradingRules.$inferSelect;
export type InsertTradingRule = z.infer<typeof insertTradingRuleSchema>;
export type ChartAnalysisSession = typeof chartAnalysisSessions.$inferSelect;
export type InsertChartAnalysisSession = z.infer<typeof insertChartAnalysisSessionSchema>;
export type UserPromptsHistory = typeof userPromptsHistory.$inferSelect;
export type InsertUserPromptsHistory = z.infer<typeof insertUserPromptsHistorySchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// Bundle metadata interface
export interface BundleMetadata {
  bundle_id: string;
  instrument: string;
  chart_ids: number[];
  timeframes: string[];
  session?: string;
  created_at: string;
}

// Timeframe and other enums for the application
export const timeframes = ["5M", "15M", "1H", "4H", "Daily"] as const;
export type Timeframe = typeof timeframes[number];
export const TimeframeEnum = z.enum(["5M", "15M", "1H", "4H", "Daily"]);

export const sessions = ["Asia", "London", "NY", "Sydney"] as const;
export type Session = typeof sessions[number];

// Common forex and commodity instruments
export const commonInstruments = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", 
  "AUDUSD", "NZDUSD", "USDCAD", "EURJPY", "GBPJPY", "EURGBP",
  "BTCUSD", "ETHUSD", "SPX500", "NAS100", "US30"
] as const;

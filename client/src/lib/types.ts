/**
 * Unified Analysis Response Types
 * Used for consistent type checking across dashboard and chat analysis
 */

export interface UnifiedAnalysisResponse {
  session: "Asia" | "London" | "NY" | "Sydney";
  direction_bias: "Up" | "Down" | "Sideways";
  confidence: number; // 0-100
  rationale: string;
  pattern_match?: string[];
  risk_notes?: string;
  next_steps?: string;
}

export interface AnalysisMetadata {
  imageCount: number;
  bundleId?: string | null;
  hasRAGContext: boolean;
  processingMode: 'quick_analysis' | 'saved_analysis' | 'bundle_analysis' | 'temporary_analysis' | 'temporary_bundle_analysis';
}

export interface UnifiedAnalysisApiResponse {
  success: boolean;
  analysis: UnifiedAnalysisResponse;
  analysisId?: number;
  metadata: AnalysisMetadata;
  warning?: string;
}

export interface QuickAnalysisApiResponse {
  success: boolean;
  analysis: UnifiedAnalysisResponse;
  metadata: AnalysisMetadata;
}

export interface AnalysisErrorResponse {
  error: string;
  message: string;
  code: 'NO_IMAGES' | 'INVALID_CHART_ID' | 'CHART_NOT_FOUND' | 'CHART_FILE_NOT_FOUND' | 'BUNDLE_NOT_FOUND' | 'EMPTY_BUNDLE' | 'CHART_FILES_NOT_FOUND' | 'SCHEMA_VALIDATION_ERROR' | 'ANALYSIS_ERROR' | 'BUNDLE_ANALYSIS_ERROR';
}
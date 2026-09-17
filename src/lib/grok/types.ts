export type FieldType =
  | "string"
  | "number"
  | "ip"
  | "timestamp"
  | "url"
  | "word"
  | "custom";

export interface ParseField {
  id: string;
  name: string;
  grokType: string;
  description?: string;
  required?: boolean;
}

export interface ParseLineResult {
  line: number;
  raw: string;
  matched: boolean;
  fields: Record<string, string> | null;
  missingFields?: string[];
  extraFields?: string[];
  error?: string;
}

export interface ParseResponse {
  pattern: string;
  total: number;
  matched: number;
  failed: number;
  results: ParseLineResult[];
  extractedFieldNames: string[];
}

export interface AnalyzedField {
  name: string;
  grokType: string;
  cast?: string;
  rawToken: string;
  suggestedMapping?: string;
  notes?: string;
}

export interface AnalyzeResponse {
  pattern: string;
  fields: AnalyzedField[];
  literals: string[];
  suggestions: string[];
  mappingDiff?: {
    missingInPattern: string[];
    extraInPattern: string[];
    renameHints: Array<{ from: string; to: string; reason: string }>;
  };
}

export interface AiAssistRequest {
  mode: "generate" | "improve" | "explain" | "map";
  sampleLogs?: string;
  fields?: ParseField[];
  pattern?: string;
  context?: string;
}

export interface AiAssistResponse {
  provider: "openai" | "heuristic";
  message: string;
  pattern?: string;
  fields?: ParseField[];
  mappingUpdates?: Array<{ field: string; suggestion: string; reason: string }>;
}

import type { Confidence } from '../types.js';

export type KeywordIntent =
  | 'informacional'
  | 'navegacional'
  | 'comercial'
  | 'transaccional'
  | 'local'
  | 'desconocida';

export type KeywordSource = 'on-page' | 'gsc' | 'bing';

export type KeywordProviderId = 'gsc' | 'bing';

export type KeywordProviderState =
  | 'ok'
  | 'partial'
  | 'no-config'
  | 'no-property'
  | 'error'
  | 'skipped';

export interface KeywordMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface KeywordOnPageSignals {
  occurrences: number;
  pages: number;
  title: number;
  headings: number;
  meta: number;
  url: number;
  alt: number;
  anchors: number;
  body: number;
}

export interface KeywordCandidate {
  keyword: string;
  normalized: string;
  intent: KeywordIntent;
  score: number;
  confidence: Confidence;
  sources: KeywordSource[];
  onPage: KeywordOnPageSignals;
  gsc?: KeywordMetrics;
  bing?: KeywordMetrics;
  recommendedPage: string | null;
  action: string;
  cluster: string | null;
  cannibalization: string[];
}

export interface KeywordCluster {
  label: string;
  keywords: string[];
  score: number;
}

export interface NegativeKeyword {
  keyword: string;
  normalized: string;
  reason: string;
  confidence: Confidence;
  matchType: 'phrase' | 'exact';
  sources: KeywordSource[];
}

export interface KeywordProviderStatus {
  provider: KeywordProviderId;
  status: KeywordProviderState;
  message: string;
  property: string | null;
  fetchedAt: string | null;
  rows: number;
  truncated: boolean;
  cached: boolean;
}

export interface KeywordSummary {
  positives: number;
  negatives: number;
  highConfidence: number;
  clusters: number;
  externalSources: number;
}

export interface KeywordReport {
  version: 1;
  generatedAt: string;
  locale: string;
  country: string;
  period: { start: string; end: string } | null;
  providers: KeywordProviderStatus[];
  positives: KeywordCandidate[];
  negatives: NegativeKeyword[];
  clusters: KeywordCluster[];
  summary: KeywordSummary;
  limitations: string[];
}

export interface KeywordOptions {
  locale?: string;
  country?: string;
  negativeTerms?: string[];
  refresh?: boolean;
  cacheDir?: string;
  providerTimeoutMs?: number;
}

export interface ProviderKeywordRow {
  keyword: string;
  metrics: KeywordMetrics;
  pages?: string[];
}

export interface KeywordProviderResult {
  status: KeywordProviderStatus;
  rows: ProviderKeywordRow[];
}

export interface KeywordProviderInput {
  host: string;
  finalUrl: string;
  locale: string;
  country: string;
  now: Date;
  refresh: boolean;
  cacheDir: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

export interface KeywordProvider {
  id: KeywordProviderId;
  load(input: KeywordProviderInput): Promise<KeywordProviderResult>;
}

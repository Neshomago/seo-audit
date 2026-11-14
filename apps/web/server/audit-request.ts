export const KEYWORD_LOCALES = new Set(['es-ES', 'en-US']);
export const MAX_NEGATIVE_TERMS = 50;

export interface AuditPayload {
  url: string;
  maxPages: number;
  lighthouse: boolean;
  allowPrivate: boolean;
  keywords: boolean;
  keywordLocale: string;
  negativeTerms: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeKeywordLocale(value: unknown): string {
  return typeof value === 'string' && KEYWORD_LOCALES.has(value) ? value : 'es-ES';
}

function normalizeNegativeTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((term): term is string => typeof term === 'string')
    .map((term) => term.replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_NEGATIVE_TERMS);
}

export function parseAuditPayload(value: unknown): AuditPayload {
  const payload = isRecord(value) ? value : {};
  return {
    url: typeof payload.url === 'string' ? payload.url.trim() : '',
    maxPages: clampInt(payload.maxPages, 10, 1, 30),
    lighthouse: payload.lighthouse !== false,
    allowPrivate: payload.allowPrivate === true,
    keywords: payload.keywords !== false,
    keywordLocale: normalizeKeywordLocale(payload.keywordLocale),
    negativeTerms: normalizeNegativeTerms(payload.negativeTerms),
  };
}

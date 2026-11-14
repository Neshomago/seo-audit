import { resolve } from 'node:path';
import type { KeywordOptions } from './types.js';

export interface GscConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
}

export interface BingConfig {
  apiKey: string;
}

export interface KeywordConfig {
  locale: string;
  country: string;
  cacheDir: string;
  refresh: boolean;
  timeoutMs: number;
  negativeTerms: string[];
  gsc: GscConfig | null;
  bing: BingConfig | null;
}

export function readKeywordConfig(
  options: KeywordOptions = {},
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): KeywordConfig {
  const clientId = env.SEO_AUDIT_GSC_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.SEO_AUDIT_GSC_CLIENT_SECRET?.trim() ?? '';
  const refreshToken = env.SEO_AUDIT_GSC_REFRESH_TOKEN?.trim() ?? '';
  const accessToken = env.SEO_AUDIT_GSC_ACCESS_TOKEN?.trim();
  const bingApiKey = env.SEO_AUDIT_BING_API_KEY?.trim() ?? '';

  return {
    locale: options.locale ?? env.SEO_AUDIT_KEYWORDS_LOCALE ?? 'es-ES',
    country: options.country ?? env.SEO_AUDIT_KEYWORDS_COUNTRY ?? 'ES',
    cacheDir: options.cacheDir ?? env.SEO_AUDIT_CACHE_DIR ?? resolve(cwd, '.cache/seo-audit'),
    refresh: options.refresh ?? false,
    timeoutMs: options.providerTimeoutMs ?? 15_000,
    negativeTerms: options.negativeTerms ?? [],
    gsc:
      (clientId && clientSecret && refreshToken) || accessToken
        ? { clientId, clientSecret, refreshToken, accessToken }
        : null,
    bing: bingApiKey ? { apiKey: bingApiKey } : null,
  };
}

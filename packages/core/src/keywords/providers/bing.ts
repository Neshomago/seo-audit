import type { BingConfig } from '../config.js';
import { normalizeKeyword } from '../normalize.js';
import type {
  KeywordMetrics,
  KeywordProvider,
  KeywordProviderInput,
  KeywordProviderResult,
  ProviderKeywordRow,
} from '../types.js';
import { readCache, writeCache } from './cache.js';
import { fetchJson } from './http.js';

const API = 'https://ssl.bing.com/webmaster/api.svc/json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface BingSite {
  Url?: string;
  SiteUrl?: string;
  url?: string;
}

interface BingSitesResponse {
  d?: BingSite[];
}

interface BingQueryRow {
  Query?: string;
  Impressions?: number;
  Clicks?: number;
  AvgClickPosition?: number;
  AvgImpressionPosition?: number;
  Date?: string;
}

interface BingQueryResponse {
  d?: BingQueryRow[];
}

interface CachedBing {
  rows: ProviderKeywordRow[];
}

function parseBingDate(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /\/Date\((\d+)(?:[+-]\d{4})?\)\//.exec(value);
  if (match?.[1]) return new Date(Number(match[1]));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function siteUrl(site: BingSite): string | null {
  return site.Url ?? site.SiteUrl ?? site.url ?? null;
}

export function findBingProperty(sites: BingSite[], host: string): string | null {
  for (const site of sites) {
    const raw = siteUrl(site);
    if (!raw) continue;
    try {
      if (new URL(raw).host === host) return raw;
    } catch {
      continue;
    }
  }
  return null;
}

function metricsOf(row: BingQueryRow): KeywordMetrics {
  const impressions = Math.max(0, row.Impressions ?? 0);
  const clicks = Math.max(0, row.Clicks ?? 0);
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: Math.max(0, row.AvgImpressionPosition ?? row.AvgClickPosition ?? 0),
  };
}

export function aggregateBingRows(
  rows: BingQueryRow[],
  now: Date,
): ProviderKeywordRow[] {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 28);
  const grouped = new Map<
    string,
    { keyword: string; impressions: number; clicks: number; positionTotal: number; positionWeight: number }
  >();

  for (const row of rows) {
    const keyword = row.Query?.trim();
    if (!keyword) continue;

    const date = parseBingDate(row.Date);
    if (date && date < start) continue;

    const key = normalizeKeyword(keyword);
    if (!key) continue;

    const metrics = metricsOf(row);
    const current = grouped.get(key) ?? {
      keyword,
      impressions: 0,
      clicks: 0,
      positionTotal: 0,
      positionWeight: 0,
    };
    current.impressions += metrics.impressions;
    current.clicks += metrics.clicks;
    current.positionTotal += metrics.position * metrics.impressions;
    current.positionWeight += metrics.impressions;
    grouped.set(key, current);
  }

  return [...grouped.values()].map((row) => ({
    keyword: row.keyword,
    metrics: {
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      position: row.positionWeight > 0 ? row.positionTotal / row.positionWeight : 0,
    },
  }));
}

function status(
  state: KeywordProviderResult['status']['status'],
  message: string,
  property: string | null,
  rows = 0,
  cached = false,
  fetchedAt: string | null = null,
): KeywordProviderResult['status'] {
  return {
    provider: 'bing',
    status: state,
    message,
    property,
    fetchedAt,
    rows,
    truncated: false,
    cached,
  };
}

export function createBingProvider(config: BingConfig | null): KeywordProvider {
  return {
    id: 'bing',
    async load(input: KeywordProviderInput): Promise<KeywordProviderResult> {
      if (!config) {
        return { status: status('no-config', 'Bing Webmaster no configurado.', null), rows: [] };
      }

      const key = encodeURIComponent(config.apiKey);

      try {
        const sites = await fetchJson<BingSitesResponse>(`${API}/GetUserSites?apikey=${key}`, {
          fetchImpl: input.fetchImpl,
          timeoutMs: input.timeoutMs,
        });
        const property = findBingProperty(sites.d ?? [], input.host);

        if (!property) {
          return { status: status('no-property', 'Sin propiedad verificada en Bing.', null), rows: [] };
        }

        const cacheKey = `bing:v1:${property}`;
        if (!input.refresh) {
          const cached = await readCache<CachedBing>(input.cacheDir, cacheKey, CACHE_TTL_MS, input.now);
          if (cached) {
            return {
              status: status(
                'ok',
                'Datos de Bing desde caché.',
                property,
                cached.value.rows.length,
                true,
                cached.cachedAt.toISOString(),
              ),
              rows: cached.value.rows,
            };
          }
        }

        const response = await fetchJson<BingQueryResponse>(
          `${API}/GetQueryStats?siteUrl=${encodeURIComponent(property)}&apikey=${key}`,
          { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs },
        );
        const rows = aggregateBingRows(response.d ?? [], input.now);
        const message = rows.length === 0 ? 'Bing no devolvió consultas.' : `${rows.length} consultas de Bing.`;

        await writeCache(input.cacheDir, cacheKey, { rows }, input.now);

        return {
          status: status('ok', message, property, rows.length, false, input.now.toISOString()),
          rows,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al consultar Bing.';
        return { status: status('error', message, null), rows: [] };
      }
    },
  };
}

import type { GscConfig } from '../config.js';
import { normalizeKeyword } from '../normalize.js';
import type {
  KeywordProvider,
  KeywordProviderInput,
  KeywordProviderResult,
  ProviderKeywordRow,
} from '../types.js';
import { readCache, writeCache } from './cache.js';
import { fetchJson } from './http.js';

const API = 'https://www.googleapis.com/webmasters/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ROW_LIMIT = 25_000;

interface GscSite {
  siteUrl?: string;
  permissionLevel?: string;
}

interface GscSitesResponse {
  siteEntry?: GscSite[];
}

interface GscQueryRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface GscQueryResponse {
  rows?: GscQueryRow[];
}

interface CachedGsc {
  rows: ProviderKeywordRow[];
  truncated: boolean;
  period: { start: string; end: string };
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function gscPeriod(now: Date): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: dateString(start), end: dateString(end) };
}

export function findGscProperty(sites: GscSite[], host: string, finalUrl: string): string | null {
  const candidates = sites
    .map((site) => site.siteUrl)
    .filter((site): site is string => typeof site === 'string' && site.length > 0);
  const target = new URL(finalUrl);
  const matches: Array<{ site: string; specificity: number }> = [];

  for (const site of candidates) {
    if (site.startsWith('sc-domain:')) {
      const domain = site.slice('sc-domain:'.length).toLowerCase();
      if (host === domain || host.endsWith(`.${domain}`)) {
        matches.push({ site, specificity: domain.length });
      }
      continue;
    }

    try {
      const url = new URL(site);
      const prefix = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
      const pathMatches = target.pathname === url.pathname || target.pathname.startsWith(prefix);
      if (url.host === target.host && pathMatches) {
        matches.push({ site, specificity: site.length });
      }
    } catch {
      continue;
    }
  }

  return matches.sort((a, b) => b.specificity - a.specificity)[0]?.site ?? null;
}

async function accessToken(config: GscConfig, input: KeywordProviderInput): Promise<string> {
  if (config.accessToken) return config.accessToken;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
  });

  const response = await fetchJson<{ access_token?: string }>(TOKEN_URL, {
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  });

  if (!response.access_token) throw new Error('Google no devolvió un access token.');
  return response.access_token;
}

async function query(
  property: string,
  dimensions: string[],
  period: { start: string; end: string },
  token: string,
  input: KeywordProviderInput,
): Promise<GscQueryRow[]> {
  const response = await fetchJson<GscQueryResponse>(
    `${API}/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
      init: {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          startDate: period.start,
          endDate: period.end,
          dimensions,
          rowLimit: ROW_LIMIT,
          searchType: 'web',
        }),
      },
    },
  );

  return response.rows ?? [];
}

function aggregateRows(rows: GscQueryRow[]): ProviderKeywordRow[] {
  const grouped = new Map<string, { keyword: string; impressions: number; clicks: number; positionTotal: number; positionWeight: number }>();

  for (const row of rows) {
    const keyword = row.keys?.[0]?.trim();
    if (!keyword) continue;
    const key = normalizeKeyword(keyword);
    if (!key) continue;

    const current = grouped.get(key) ?? {
      keyword,
      impressions: 0,
      clicks: 0,
      positionTotal: 0,
      positionWeight: 0,
    };
    const impressions = Math.max(0, row.impressions ?? 0);
    current.impressions += impressions;
    current.clicks += Math.max(0, row.clicks ?? 0);
    current.positionTotal += Math.max(0, row.position ?? 0) * impressions;
    current.positionWeight += impressions;
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

function pageMap(rows: GscQueryRow[]): Map<string, string[]> {
  const pages = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const keyword = row.keys?.[0]?.trim();
    const page = row.keys?.[1]?.trim();
    if (!keyword || !page) continue;
    const key = normalizeKeyword(keyword);
    if (!key) continue;

    const list = pages.get(key) ?? new Map<string, number>();
    list.set(page, (list.get(page) ?? 0) + Math.max(0, row.impressions ?? 0));
    pages.set(key, list);
  }

  return new Map(
    [...pages.entries()].map(([key, list]) => [
      key,
      [...list.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([page]) => page),
    ]),
  );
}

function status(
  state: KeywordProviderResult['status']['status'],
  message: string,
  property: string | null,
  rows = 0,
  truncated = false,
  cached = false,
  fetchedAt: string | null = null,
): KeywordProviderResult['status'] {
  return {
    provider: 'gsc',
    status: state,
    message,
    property,
    fetchedAt,
    rows,
    truncated,
    cached,
  };
}

export function createGscProvider(config: GscConfig | null): KeywordProvider {
  return {
    id: 'gsc',
    async load(input): Promise<KeywordProviderResult> {
      if (!config) {
        return { status: status('no-config', 'GSC no configurado.', null), rows: [] };
      }

      const period = gscPeriod(input.now);

      try {
        const token = await accessToken(config, input);
        const sites = await fetchJson<GscSitesResponse>(`${API}/sites`, {
          fetchImpl: input.fetchImpl,
          timeoutMs: input.timeoutMs,
          init: { headers: { authorization: `Bearer ${token}` } },
        });
        const property = findGscProperty(sites.siteEntry ?? [], input.host, input.finalUrl);

        if (!property) {
          return { status: status('no-property', 'Sin propiedad verificada en GSC.', null), rows: [], period };
        }

        const cacheKey = `gsc:v1:${property}:${period.start}:${period.end}`;
        if (!input.refresh) {
          const cached = await readCache<CachedGsc>(input.cacheDir, cacheKey, CACHE_TTL_MS, input.now);
          if (cached) {
            return {
              status: status(
                'ok',
                'Datos de GSC desde caché.',
                property,
                cached.value.rows.length,
                cached.value.truncated,
                true,
                cached.cachedAt.toISOString(),
              ),
              rows: cached.value.rows,
              period: cached.value.period,
            };
          }
        }

        const [queryResult, pageResult] = await Promise.allSettled([
          query(property, ['query'], period, token, input),
          query(property, ['query', 'page'], period, token, input),
        ]);
        const queryRows = queryResult.status === 'fulfilled' ? queryResult.value : [];
        const pageRows = pageResult.status === 'fulfilled' ? pageResult.value : [];

        if (queryResult.status === 'rejected' && pageResult.status === 'rejected') {
          throw queryResult.reason;
        }

        const rows = aggregateRows(queryRows.length > 0 ? queryRows : pageRows);
        const pages = pageMap(pageRows);
        const withPages = rows.map((row) => ({
          ...row,
          pages: pages.get(normalizeKeyword(row.keyword)) ?? [],
        }));
        const truncated = queryRows.length >= ROW_LIMIT || pageRows.length >= ROW_LIMIT;
        const partial = queryResult.status === 'rejected' || pageResult.status === 'rejected';
        const state = partial ? 'partial' : 'ok';
        const message = withPages.length === 0 ? 'GSC no devolvió consultas.' : `${withPages.length} consultas de GSC.`;

        await writeCache(input.cacheDir, cacheKey, { rows: withPages, truncated, period }, input.now);

        return {
          status: status(
            state,
            message,
            property,
            withPages.length,
            truncated,
            false,
            input.now.toISOString(),
          ),
          rows: withPages,
          period,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al consultar GSC.';
        return { status: status('error', message, null), rows: [] };
      }
    },
  };
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BingConfig, GscConfig } from '../config.js';
import type { KeywordProviderInput } from '../types.js';
import { aggregateBingRows, createBingProvider, findBingProperty } from './bing.js';
import { createGscProvider, findGscProperty, gscPeriod } from './gsc.js';

const tempDirs: string[] = [];

async function cacheDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'seo-audit-keywords-'));
  tempDirs.push(dir);
  return dir;
}

function input(overrides: Partial<KeywordProviderInput> = {}): KeywordProviderInput {
  return {
    host: 'example.com',
    finalUrl: 'https://example.com/',
    locale: 'es-ES',
    country: 'ES',
    now: new Date('2026-01-15T12:00:00Z'),
    refresh: true,
    cacheDir: '',
    timeoutMs: 5_000,
    fetchImpl: fetch,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('GSC provider', () => {
  it('encuentra la propiedad de dominio o prefijo más específica', () => {
    const sites = [
      { siteUrl: 'https://example.com/' },
      { siteUrl: 'https://example.com/blog/' },
      { siteUrl: 'sc-domain:example.com' },
    ];

    expect(findGscProperty(sites, 'www.example.com', 'https://www.example.com/')).toBe(
      'sc-domain:example.com',
    );
    expect(findGscProperty(sites, 'example.com', 'https://example.com/blog/post')).toBe(
      'https://example.com/blog/',
    );
  });

  it('calcula la ventana de 28 días con retraso de 3 días', () => {
    expect(gscPeriod(new Date('2026-01-15T12:00:00Z'))).toEqual({
      start: '2025-12-16',
      end: '2026-01-12',
    });
  });

  it('consulta GSC y cruza las páginas con cada consulta', async () => {
    const dir = await cacheDir();
    const config: GscConfig = {
      accessToken: 'token',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    };

    const fetchImpl: typeof fetch = async (request, init) => {
      const url = String(request);
      if (url.endsWith('/sites')) {
        return new Response(JSON.stringify({ siteEntry: [{ siteUrl: 'sc-domain:example.com' }] }));
      }

      const body = JSON.parse(String(init?.body)) as { dimensions: string[] };
      if (body.dimensions.length === 1) {
        return new Response(
          JSON.stringify({
            rows: [
              {
                keys: ['auditoria seo'],
                impressions: 500,
                clicks: 20,
                ctr: 0.04,
                position: 8,
              },
            ],
          }),
        );
      }

      return new Response(
        JSON.stringify({
          rows: [
            {
              keys: ['auditoria seo', 'https://example.com/'],
              impressions: 400,
              clicks: 18,
              ctr: 0.045,
              position: 7,
            },
            {
              keys: ['auditoria seo', 'https://example.com/servicios'],
              impressions: 100,
              clicks: 2,
              ctr: 0.02,
              position: 12,
            },
          ],
        }),
      );
    };

    const provider = createGscProvider(config);
    const result = await provider.load(input({ cacheDir: dir, fetchImpl }));

    expect(result.status.status).toBe('ok');
    expect(result.status.property).toBe('sc-domain:example.com');
    expect(result.rows[0]?.metrics.impressions).toBe(500);
    expect(result.rows[0]?.pages).toEqual([
      'https://example.com/',
      'https://example.com/servicios',
    ]);
  });

  it('usa la caché antes de volver a consultar', async () => {
    const dir = await cacheDir();
    const config: GscConfig = {
      accessToken: 'token',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    };
    const firstFetch: typeof fetch = async (request) => {
      if (String(request).endsWith('/sites')) {
        return new Response(JSON.stringify({ siteEntry: [{ siteUrl: 'sc-domain:example.com' }] }));
      }
      return new Response(
        JSON.stringify({
          rows: [{ keys: ['seo'], impressions: 10, clicks: 1, ctr: 0.1, position: 5 }],
        }),
      );
    };

    const provider = createGscProvider(config);
    await provider.load(input({ cacheDir: dir, fetchImpl: firstFetch }));

    const secondFetch: typeof fetch = async (request) => {
      if (String(request).endsWith('/sites')) {
        return new Response(JSON.stringify({ siteEntry: [{ siteUrl: 'sc-domain:example.com' }] }));
      }
      throw new Error('No debería consultar la API');
    };

    const result = await provider.load(
      input({ cacheDir: dir, fetchImpl: secondFetch, refresh: false }),
    );
    expect(result.status.cached).toBe(true);
    expect(result.rows[0]?.keyword).toBe('seo');
  });

  it('devuelve error sin romper cuando la API falla', async () => {
    const dir = await cacheDir();
    const config: GscConfig = {
      accessToken: 'token',
      clientId: '',
      clientSecret: '',
      refreshToken: '',
    };
    const fetchImpl: typeof fetch = async () => new Response('', { status: 401 });

    const result = await createGscProvider(config).load(input({ cacheDir: dir, fetchImpl }));
    expect(result.status.status).toBe('error');
    expect(result.rows).toEqual([]);
  });
});

describe('Bing provider', () => {
  it('encuentra la propiedad por host', () => {
    expect(findBingProperty([{ Url: 'https://example.com/' }], 'example.com')).toBe(
      'https://example.com/',
    );
    expect(findBingProperty([{ Url: 'https://other.com/' }], 'example.com')).toBeNull();
  });

  it('agrega consultas y descarta filas antiguas', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    const rows = aggregateBingRows(
      [
        {
          Query: 'Auditoria SEO',
          Impressions: 10,
          Clicks: 1,
          AvgImpressionPosition: 5,
          Date: `/Date(${new Date('2026-01-10T00:00:00Z').getTime()})/`,
        },
        {
          Query: 'auditoria seo',
          Impressions: 30,
          Clicks: 3,
          AvgImpressionPosition: 9,
          Date: `/Date(${new Date('2026-01-03T00:00:00Z').getTime()})/`,
        },
        {
          Query: 'auditoria seo',
          Impressions: 100,
          Clicks: 10,
          AvgImpressionPosition: 1,
          Date: `/Date(${new Date('2025-01-03T00:00:00Z').getTime()})/`,
        },
      ],
      now,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metrics.impressions).toBe(40);
    expect(rows[0]?.metrics.clicks).toBe(4);
  });

  it('consulta Bing y devuelve filas normalizadas', async () => {
    const dir = await cacheDir();
    const config: BingConfig = { apiKey: 'secret-key' };
    const fetchImpl: typeof fetch = async (request) => {
      const url = String(request);
      if (url.includes('GetUserSites')) {
        return new Response(JSON.stringify({ d: [{ Url: 'https://example.com/' }] }));
      }
      return new Response(
        JSON.stringify({
          d: [
            {
              Query: 'auditoria seo',
              Impressions: 80,
              Clicks: 4,
              AvgImpressionPosition: 12,
              Date: `/Date(${new Date('2026-01-10T00:00:00Z').getTime()})/`,
            },
          ],
        }),
      );
    };

    const result = await createBingProvider(config).load(input({ cacheDir: dir, fetchImpl }));
    expect(result.status.status).toBe('ok');
    expect(result.status.property).toBe('https://example.com/');
    expect(result.rows[0]?.metrics.position).toBe(12);
  });

  it('no llama a la API sin clave', async () => {
    const result = await createBingProvider(null).load(input());
    expect(result.status.status).toBe('no-config');
  });
});

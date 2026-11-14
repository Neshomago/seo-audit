import { describe, expect, it } from 'vitest';
import type { CrawledPage } from '../crawl.js';
import { createEmptyDom } from '../dom.js';
import { analyzeKeywords } from './analyze.js';
import { detectIntent } from './intent.js';
import { normalizeKeyword } from './normalize.js';
import type { KeywordProviderResult } from './types.js';

const URL = 'https://example.com/auditoria-seo';

function makePage(html: string, url = URL): CrawledPage {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {},
    html,
    title: '',
    cookieNames: [],
    resources: [],
    links: [],
    consoleErrors: [],
    dom: createEmptyDom(),
    elapsedMs: 0,
    depth: 0,
  };
}

function html(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <title>Auditoría SEO para empresas</title>
    <meta name="description" content="Auditoría SEO completa y accionable para mejorar tu web.">
  </head>
  <body>
    <h1>Auditoría SEO completa</h1>
    <h2>Cómo mejorar el SEO técnico</h2>
    <p>Una auditoría SEO revisa el contenido, el rendimiento y la estructura de tu web.</p>
    <img alt="Informe de auditoría SEO" src="/informe.png">
    <a href="/servicios">Servicios de auditoría SEO</a>
  </body>
</html>`;
}

describe('analyzeKeywords', () => {
  it('extrae keywords on-page y las agrupa por intención', () => {
    const report = analyzeKeywords({
      pages: [
        makePage(html()),
        makePage(
          `<html><head><title>Auditoria SEO</title></head><body><h1>Servicios SEO</h1></body></html>`,
          'https://example.com/servicios',
        ),
      ],
      host: 'example.com',
      now: new Date('2026-01-01T00:00:00Z'),
    });

    const keyword = report.positives.find((item) => item.normalized === 'auditoria seo');
    expect(keyword).toBeDefined();
    expect(keyword?.onPage.title).toBeGreaterThan(0);
    expect(keyword?.onPage.headings).toBeGreaterThan(0);
    expect(keyword?.sources).toEqual(['on-page']);
    expect(keyword?.recommendedPage).toContain('example.com');
    expect(report.summary.positives).toBeGreaterThan(0);
    expect(report.providers).toEqual([]);
  });

  it('normaliza acentos y mayúsculas para deduplicar', () => {
    expect(normalizeKeyword('Auditoría SEO')).toBe('auditoria seo');
    expect(normalizeKeyword('AUDITORIA   seo')).toBe('auditoria seo');
  });

  it('detecta intenciones básicas', () => {
    expect(detectIntent('comprar zapatillas', 'example.com')).toBe('transaccional');
    expect(detectIntent('mejores zapatillas', 'example.com')).toBe('comercial');
    expect(detectIntent('que es el seo', 'example.com')).toBe('informacional');
    expect(detectIntent('zapatillas cerca de mi', 'example.com')).toBe('local');
    expect(detectIntent('example login', 'example.com')).toBe('navegacional');
  });

  it('genera negativas desde el contenido y desde términos manuales', () => {
    const report = analyzeKeywords({
      pages: [
        makePage(
          `<html><head><title>Trabajo en Madrid</title></head><body><h1>Trabajo en Madrid</h1><p>Consulta la oferta de empleo.</p></body></html>`,
        ),
      ],
      host: 'example.com',
      negativeTerms: ['curso gratis'],
    });

    expect(report.negatives.some((item) => item.normalized === 'trabajo')).toBe(true);
    expect(report.negatives.some((item) => item.normalized === 'curso gratis')).toBe(true);
  });

  it('fusiona métricas externas sin sumar proveedores', () => {
    const providerResults: KeywordProviderResult[] = [
      {
        status: {
          provider: 'gsc',
          status: 'ok',
          message: 'ok',
          property: 'sc-domain:example.com',
          fetchedAt: '2026-01-01T00:00:00.000Z',
          rows: 1,
          truncated: false,
          cached: false,
        },
        rows: [
          {
            keyword: 'auditoria seo',
            metrics: { impressions: 500, clicks: 20, ctr: 0.04, position: 8 },
            pages: ['https://example.com/auditoria-seo'],
          },
        ],
      },
      {
        status: {
          provider: 'bing',
          status: 'ok',
          message: 'ok',
          property: 'https://example.com/',
          fetchedAt: '2026-01-01T00:00:00.000Z',
          rows: 1,
          truncated: false,
          cached: false,
        },
        rows: [
          {
            keyword: 'auditoria seo',
            metrics: { impressions: 80, clicks: 4, ctr: 0.05, position: 12 },
          },
        ],
      },
    ];

    const report = analyzeKeywords({
      pages: [makePage(html())],
      host: 'example.com',
      providerResults,
    });

    const keyword = report.positives.find((item) => item.normalized === 'auditoria seo');
    expect(keyword?.gsc?.impressions).toBe(500);
    expect(keyword?.bing?.impressions).toBe(80);
    expect(keyword?.sources).toEqual(['bing', 'gsc', 'on-page']);
    expect(keyword?.action).toBe('Optimizar página existente');
    expect(report.summary.externalSources).toBe(2);
  });

  it('incluye keywords que solo aparecen en GSC', () => {
    const report = analyzeKeywords({
      pages: [makePage(html())],
      host: 'example.com',
      providerResults: [
        {
          status: {
            provider: 'gsc',
            status: 'partial',
            message: 'ok',
            property: 'sc-domain:example.com',
            fetchedAt: null,
            rows: 1,
            truncated: false,
            cached: false,
          },
          rows: [
            {
              keyword: 'contenido nuevo',
              metrics: { impressions: 100, clicks: 1, ctr: 0.01, position: 30 },
            },
          ],
        },
      ],
    });

    const keyword = report.positives.find((item) => item.normalized === 'contenido nuevo');
    expect(keyword).toBeDefined();
    expect(keyword?.sources).toContain('gsc');
    expect(keyword?.action).toBe('Crear contenido específico');
  });
});

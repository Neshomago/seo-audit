import { describe, expect, it } from 'vitest';
import { analyzeSeo } from '../seo/index.js';
import { summarizeLighthouse } from '../perf/lighthouse.js';
import type { CrawledPage } from '../crawl.js';
import type { InspectResult } from '../pipeline.js';
import type { HttpProbe, ResourceProbe, SiteProbe } from '../types.js';
import { createEmptyDom } from '../dom.js';
import { analyzeKeywords } from '../keywords/analyze.js';
import { renderMarkdownReport } from './markdown.js';

const URL = 'https://example.com/';
const FILLER = 'palabra '.repeat(320);

function makePage(html: string): CrawledPage {
  return {
    url: URL,
    finalUrl: URL,
    status: 200,
    headers: {},
    html,
    title: 'Mi sitio',
    cookieNames: [],
    resources: [{ name: 'https://example.com/app.js', initiatorType: 'script', transferSize: 204800, encodedBodySize: 204800, decodedBodySize: 600000, duration: 120 }],
    links: [URL],
    consoleErrors: [],
    dom: createEmptyDom(),
    elapsedMs: 0,
    depth: 0,
  };
}

function makeProbe(url: string): HttpProbe {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {
      'strict-transport-security': 'max-age=31536000',
      'content-security-policy': "default-src 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'SAMEORIGIN',
    },
    setCookies: [],
    contentType: 'text/html',
    html: '',
    htmlBytes: 0,
    truncated: false,
    redirectChain: [url],
    elapsedMs: 0,
  };
}

function makeResource(url: string, found: boolean, text = '', urlsCount = 0): ResourceProbe {
  return {
    url,
    finalUrl: url,
    status: found ? 200 : 404,
    found,
    contentType: 'text/plain',
    bytes: text.length,
    text,
    urlsCount,
  };
}

function makeSite(): SiteProbe {
  return {
    robots: makeResource('https://example.com/robots.txt', true, 'User-agent: *\nAllow: /'),
    sitemap: makeResource('https://example.com/sitemap.xml', true, '<urlset></urlset>', 12),
    sitemapsDeclared: [],
  };
}

function makeResult(html: string, withLighthouse: boolean): InspectResult {
  const page = makePage(html);
  const probe = makeProbe(URL);
  const site = makeSite();
  const stack = {
    technologies: [
      { id: 'wordpress', name: 'WordPress', category: 'CMS' as const, confidence: 'alta' as const, evidence: [{ signal: 'header', detail: 'X-Powered-By: PHP' }] },
    ],
    primaryStack: ['WordPress'],
    notes: [],
  };
  const seo = analyzeSeo({ pages: [page], probe, site, stack });

  return {
    probe,
    site,
    page,
    stack,
    crawl: { startUrl: URL, host: 'example.com', pages: [page], errors: [], visited: 1, elapsedMs: 0 },
    seo,
    lighthouse: withLighthouse
      ? summarizeLighthouse({
          requestedUrl: URL,
          finalUrl: URL,
          categories: {
            performance: { score: 0.72, auditRefs: [{ id: 'total-blocking-time', weight: 30 }] },
            accessibility: { score: 0.9, auditRefs: [{ id: 'image-alt', weight: 10 }] },
            'best-practices': { score: 1, auditRefs: [] },
            seo: { score: 0.8, auditRefs: [] },
          },
          audits: {
            'largest-contentful-paint': {
              score: 0.5,
              scoreDisplayMode: 'numeric',
              title: 'Largest Contentful Paint',
              description: 'LCP',
              displayValue: '4.2 s',
              numericValue: 4200,
            },
            'total-blocking-time': {
              score: 0.3,
              scoreDisplayMode: 'numeric',
              title: 'Total Blocking Time',
              description: 'TBT',
              displayValue: '800 ms',
              numericValue: 800,
            },
            'image-alt': {
              score: 0,
              scoreDisplayMode: 'binary',
              title: 'Image elements do not have [alt] attributes',
              description: 'Faltan atributos alt.',
            },
          },
        })
      : undefined,
  };
}

function pageHtml(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <title>Auditoría SEO | Mi Sitio</title>
    <meta name="description" content="Descubre cómo mejorar el SEO técnico y on-page de tu sitio con una auditoría completa y accionable.">
    <link rel="canonical" href="${URL}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="Auditoría SEO">
    <meta property="og:description" content="Auditoría SEO completa.">
    <meta property="og:image" content="https://example.com/og.png">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Auditoría SEO">
    <meta name="twitter:description" content="Auditoría SEO completa.">
  </head>
  <body>
    <h2>Sin H1</h2>
    <p>${FILLER}</p>
    <a href="/servicios">Servicios</a>
  </body>
</html>`;
}

describe('renderMarkdownReport', () => {
  it('genera un informe en español con resumen, hallazgos y plan de acción', () => {
    const markdown = renderMarkdownReport(makeResult(pageHtml(), true), {
      generatedAt: '2026-11-13T12:00:00Z',
    });

    expect(markdown).toContain('# Auditoría SEO — example.com');
    expect(markdown).toContain('**Fecha:** 13 de noviembre de 2026');
    expect(markdown).toContain('## Resumen ejecutivo');
    expect(markdown).toContain('Lighthouse: Rendimiento 72/100');
    expect(markdown).toContain('### Hallazgos prioritarios');
    expect(markdown).toContain('## Stack tecnológico');
    expect(markdown).toContain('## Lo que ya funciona');
    expect(markdown).toContain('## Problemas encontrados');
    expect(markdown).toContain('### Altos');
    expect(markdown).toContain('Cómo mejorar');
    expect(markdown).toContain('## Rendimiento y calidad (Lighthouse)');
    expect(markdown).toContain('| Rendimiento | 72/100 | Mejorable |');
    expect(markdown).toContain('| Largest Contentful Paint | 4,2 s |');
    expect(markdown).toContain('## Accesibilidad y buenas prácticas');
    expect(markdown).toContain('## Páginas analizadas');
    expect(markdown).toContain('## Plan de acción priorizado');
    expect(markdown).toContain('## Anexo técnico');
    expect(markdown).toContain('## Limitaciones');
  });

  it('incluye la sección de palabras clave cuando hay informe', () => {
    const result = makeResult(pageHtml(), false);
    result.keywords = analyzeKeywords({
      pages: result.crawl.pages,
      host: 'example.com',
      negativeTerms: ['curso gratis'],
    });

    const markdown = renderMarkdownReport(result, { generatedAt: '2026-11-13T12:00:00Z' });

    expect(markdown).toContain('## Palabras clave y oportunidades');
    expect(markdown).toContain('### Oportunidades prioritarias');
    expect(markdown).toContain('### Negativas sugeridas');
    expect(markdown).toContain('curso gratis');
  });

  it('indica cuando no se ejecutó Lighthouse y no hay páginas', () => {
    const base = makeResult(pageHtml(), false);
    const empty: InspectResult = {
      ...base,
      crawl: { ...base.crawl, pages: [], errors: [] },
      seo: {
        checks: base.seo.checks.filter((check) => !check.pageUrl),
        pages: [],
        summary: base.seo.summary,
      },
    };

    const markdown = renderMarkdownReport(empty, { generatedAt: '2026-11-13T12:00:00Z' });

    expect(markdown).toContain('No se ejecutó Lighthouse en esta auditoría.');
    expect(markdown).toContain('| — | — | — | — | — | — | — |');
  });
});

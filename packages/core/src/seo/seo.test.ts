import { describe, expect, it } from 'vitest';
import { createEmptyDom } from '../dom.js';
import type { StackReport } from '../detect/stack.js';
import type { CrawledPage } from '../crawl.js';
import type { HttpProbe, ResourceProbe, SiteProbe } from '../types.js';
import { analyzeSeo, parsePageSeo } from './index.js';

const FILLER = 'palabra '.repeat(320);

function stackWith(id: string, name: string): StackReport {
  return {
    technologies: [{ id, name, category: 'CMS', confidence: 'alta', evidence: [] }],
    primaryStack: [name],
    notes: [],
  };
}

function makePage(url: string, html: string, overrides: Partial<CrawledPage> = {}): CrawledPage {
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
    ...overrides,
  };
}

function makeProbe(
  url: string,
  headers: Record<string, string> = {},
  redirectChain: string[] = [url],
): HttpProbe {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers,
    setCookies: [],
    contentType: 'text/html',
    html: '',
    htmlBytes: 0,
    truncated: false,
    redirectChain,
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

function makeSite(
  robotsText: string | null,
  options: { sitemapFound?: boolean; sitemapUrls?: number } = {},
): SiteProbe {
  const robots = robotsText ?? '';
  return {
    robots: makeResource('https://example.com/robots.txt', robotsText !== null, robots),
    sitemap: makeResource(
      'https://example.com/sitemap.xml',
      options.sitemapFound ?? true,
      '<urlset></urlset>',
      options.sitemapUrls ?? 2,
    ),
    sitemapsDeclared: [],
  };
}

const GOOD_HEADERS = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
};

function goodHtml(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <title>Auditoría SEO para empresas | Mi Sitio</title>
    <meta name="description" content="Descubre cómo mejorar el SEO técnico y on-page de tu sitio con una auditoría completa, clara y accionable.">
    <link rel="canonical" href="https://example.com/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="Auditoría SEO para empresas">
    <meta property="og:description" content="Auditoría SEO completa y accionable.">
    <meta property="og:image" content="https://example.com/og.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Auditoría SEO para empresas">
    <meta name="twitter:description" content="Auditoría SEO completa y accionable.">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Mi Sitio"}</script>
  </head>
  <body>
    <h1>Auditoría SEO completa</h1>
    <main>
      <h2>Qué incluye</h2>
      <p>${FILLER}</p>
      <h3>Detalle técnico</h3>
      <img src="/grafico.png" alt="Gráfico de rendimiento">
      <img src="/tabla.png" alt="Tabla comparativa">
      <a href="/servicios">Servicios</a>
      <a href="/contacto">Contacto</a>
      <a href="https://external.com">Sitio externo</a>
    </main>
  </body>
</html>`;
}

describe('analyzeSeo', () => {
  it('no genera fallos ni avisos en una página bien construida', () => {
    const url = 'https://example.com/';
    const result = analyzeSeo({
      pages: [makePage(url, goodHtml())],
      probe: makeProbe(url, GOOD_HEADERS),
      site: makeSite('User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml'),
      stack: stackWith('wordpress', 'WordPress'),
    });

    expect(result.summary.fail).toBe(0);
    expect(result.summary.warn).toBe(0);
    expect(result.summary.pass).toBe(result.checks.length);
    expect(result.summary.pass + result.summary.warn + result.summary.fail).toBe(
      result.checks.length,
    );
  });

  it('detecta problemas críticos en una página mala', () => {
    const url = 'https://example.com/bad_page';
    const html = `<!doctype html>
<html>
  <head>
    <meta name="robots" content="noindex">
    <script type="application/ld+json">{esto no es json}</script>
    <link rel="stylesheet" href="http://cdn.example.com/style.css">
  </head>
  <body>
    <h2>Sin estructura</h2>
    <img src="/foto.png">
    <p>Texto corto.</p>
  </body>
</html>`;

    const result = analyzeSeo({
      pages: [makePage(url, html, { status: 404, headers: { 'x-robots-tag': 'noindex' } })],
      probe: makeProbe(url),
      site: makeSite('User-agent: *\nDisallow: /', { sitemapFound: false }),
      stack: stackWith('wordpress', 'WordPress'),
    });

    const byId = new Map(result.checks.map((check) => [check.id, check]));
    for (const id of [
      'http-status',
      'title',
      'meta-description',
      'h1',
      'viewport',
      'json-ld',
      'image-alt',
      'meta-robots',
      'mixed-content',
      'robots',
    ]) {
      expect(byId.get(id)?.status, id).toBe('fail');
    }

    expect(byId.get('title')?.fix).toContain('Yoast');
    expect(byId.get('robots')?.detail).toContain('Disallow: /');

    const data = parsePageSeo(html, url, 404, { 'x-robots-tag': 'noindex' });
    expect(data.mixedContentCount).toBe(1);
    expect(data.jsonLdValid).toBe(false);
    expect(data.h1Count).toBe(0);
    expect(data.imagesWithoutAlt).toBe(1);
  });

  it('detecta títulos y meta descriptions duplicados entre páginas', () => {
    const title = 'Servicios profesionales | Mi Sitio';
    const description =
      'Servicios profesionales de auditoría SEO, rendimiento web y accesibilidad para empresas que quieren crecer.';
    const html = (canonical: string): string => `<!doctype html>
<html lang="es">
  <head>
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body><h1>Servicios</h1><p>${FILLER}</p></body>
</html>`;

    const result = analyzeSeo({
      pages: [
        makePage('https://example.com/a', html('https://example.com/a')),
        makePage('https://example.com/b', html('https://example.com/b')),
      ],
      probe: makeProbe('https://example.com/', GOOD_HEADERS),
      site: makeSite('User-agent: *\nAllow: /'),
      stack: stackWith('wordpress', 'WordPress'),
    });

    const byId = new Map(result.checks.map((check) => [check.id, check]));
    expect(byId.get('duplicate-titles')?.status).toBe('fail');
    expect(byId.get('duplicate-titles')?.detail).toContain('1');
    expect(byId.get('duplicate-descriptions')?.status).toBe('warn');
  });

  it('extrae hreflang y avisa cuando faltan x-default y auto-referencia', () => {
    const url = 'https://example.com/es/';
    const html = `<!doctype html>
<html lang="es">
  <head>
    <title>Auditoría SEO en español | Mi Sitio</title>
    <meta name="description" content="Auditoría SEO en español con análisis técnico, contenido y accesibilidad para tu sitio web.">
    <link rel="canonical" href="${url}">
    <link rel="alternate" hreflang="en" href="https://example.com/en/">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body><h1>Auditoría SEO</h1><p>${FILLER}</p></body>
</html>`;

    const data = parsePageSeo(html, url, 200);
    expect(data.lang).toBe('es');
    expect(data.hreflangs).toEqual([{ hreflang: 'en', href: 'https://example.com/en/' }]);
    expect(data.headings.map((heading) => heading.level)).toEqual([1]);

    const result = analyzeSeo({
      pages: [makePage(url, html)],
      probe: makeProbe(url, GOOD_HEADERS),
      site: makeSite('User-agent: *\nAllow: /'),
    });
    const hreflang = result.checks.find((check) => check.id === 'hreflang');
    expect(hreflang?.status).toBe('warn');
    expect(hreflang?.detail).toContain('x-default');
    expect(hreflang?.detail).toContain('auto-referencia');
  });
});

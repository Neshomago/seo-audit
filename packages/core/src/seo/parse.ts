import { load, type CheerioAPI } from 'cheerio';
import type { HreflangEntry, PageSeoData } from './types.js';

function safeUrl(raw: string, base?: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

function metaContent($: CheerioAPI, key: string): string | null {
  let value: string | null = null;
  $('meta').each((_, element) => {
    const meta = $(element);
    const name = (meta.attr('name') ?? meta.attr('property') ?? '').toLowerCase();
    if (name !== key) return;
    const content = meta.attr('content');
    if (content !== undefined) value = content.trim();
  });
  return value;
}

function findCanonical($: CheerioAPI): string | null {
  let canonical: string | null = null;
  $('link[rel]').each((_, element) => {
    const link = $(element);
    const rel = (link.attr('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('canonical')) return;
    const href = link.attr('href');
    if (href) canonical = href.trim();
  });
  return canonical;
}

function collectHreflangs($: CheerioAPI): HreflangEntry[] {
  const entries: HreflangEntry[] = [];
  $('link[rel][hreflang]').each((_, element) => {
    const link = $(element);
    const rel = (link.attr('rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('alternate')) return;
    const hreflang = link.attr('hreflang')?.trim();
    const href = link.attr('href')?.trim();
    if (hreflang && href) entries.push({ hreflang, href });
  });
  return entries;
}

function collectJsonLdTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectJsonLdTypes);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const types: string[] = [];
  const rawType = record['@type'];

  if (typeof rawType === 'string') types.push(rawType);
  else if (Array.isArray(rawType)) {
    types.push(...rawType.filter((item): item is string => typeof item === 'string'));
  }

  const graph = record['@graph'];
  if (graph) types.push(...collectJsonLdTypes(graph));
  return types;
}

export function parsePageSeo(
  html: string,
  url: string,
  status: number | null,
  headers: Record<string, string> = {},
): PageSeoData {
  const $ = load(html);
  const base = safeUrl(url);

  const headings: Array<{ level: number; text: string }> = [];
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    const tag = element.tagName.toLowerCase();
    const level = Number(tag.slice(1));
    if (level < 1 || level > 6) return;
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    headings.push({ level, text });
  });

  const imageCount = $('img').length;
  let imagesWithoutAlt = 0;
  $('img').each((_, element) => {
    if ($(element).attr('alt') === undefined) imagesWithoutAlt += 1;
  });

  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')?.trim();
    if (!href || href.startsWith('#')) return;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) return;

    const target = safeUrl(href, url);
    if (!target) return;

    if (base && target.host === base.host) internalLinks += 1;
    else externalLinks += 1;
  });

  const body = $('body').clone();
  body.find('script, style, noscript, template, svg').remove();
  const bodyText = body.text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText
    ? bodyText.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length
    : 0;

  let jsonLdCount = 0;
  let jsonLdValid = true;
  const jsonLdTypes = new Set<string>();
  $('script[type="application/ld+json"]').each((_, element) => {
    jsonLdCount += 1;
    const content = $(element).text().trim();
    if (!content) {
      jsonLdValid = false;
      return;
    }
    try {
      const parsed: unknown = JSON.parse(content);
      for (const type of collectJsonLdTypes(parsed)) jsonLdTypes.add(type);
    } catch {
      jsonLdValid = false;
    }
  });

  let mixedContentCount = 0;
  if (base?.protocol === 'https:') {
    $('script[src], img[src], link[href], iframe[src], source[src], video[src], audio[src]').each(
      (_, element) => {
        const elementRef = $(element);
        const value = elementRef.attr('src') ?? elementRef.attr('href') ?? '';
        if (/^http:\/\//i.test(value.trim())) mixedContentCount += 1;
      },
    );
  }

  const title = $('head title').first().text().trim();

  return {
    url,
    status,
    title: title.length > 0 ? title : null,
    metaDescription: metaContent($, 'description'),
    metaRobots: metaContent($, 'robots'),
    xRobotsTag: headers['x-robots-tag'] ?? null,
    canonical: findCanonical($),
    lang: $('html').attr('lang')?.trim() ?? null,
    viewport: metaContent($, 'viewport'),
    h1Count: headings.filter((heading) => heading.level === 1).length,
    headings,
    imageCount,
    imagesWithoutAlt,
    internalLinks,
    externalLinks,
    wordCount,
    openGraph: {
      title: Boolean(metaContent($, 'og:title')),
      description: Boolean(metaContent($, 'og:description')),
      image: Boolean(metaContent($, 'og:image')),
    },
    twitterCard: {
      card: Boolean(metaContent($, 'twitter:card')),
      title: Boolean(metaContent($, 'twitter:title')),
      description: Boolean(metaContent($, 'twitter:description')),
    },
    jsonLdCount,
    jsonLdValid,
    jsonLdTypes: [...jsonLdTypes],
    hreflangs: collectHreflangs($),
    mixedContentCount,
  };
}

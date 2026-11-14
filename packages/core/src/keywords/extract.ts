import { load } from 'cheerio';
import type { CrawledPage } from '../crawl.js';
import { isUsefulPhrase, tokenize } from './normalize.js';

export type KeywordField = 'title' | 'h1' | 'h2' | 'h3' | 'meta' | 'url' | 'alt' | 'anchor' | 'body';

export interface PageKeywordField {
  kind: KeywordField;
  text: string;
}

export interface PageKeywordSignals {
  url: string;
  fields: PageKeywordField[];
}

const BODY_LIMIT = 12_000;
const LIST_LIMIT = 200;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractPageSignals(page: CrawledPage): PageKeywordSignals {
  const $ = load(page.html);
  const fields: PageKeywordField[] = [];

  const title = clean($('head title').first().text());
  if (title) fields.push({ kind: 'title', text: title });

  const description = $('meta[name="description"]').first().attr('content');
  if (description) fields.push({ kind: 'meta', text: clean(description) });

  $('h1, h2, h3').each((_, element) => {
    const level = element.tagName.toLowerCase();
    const text = clean($(element).text());
    if (text) fields.push({ kind: level as 'h1' | 'h2' | 'h3', text });
  });

  $('img[alt]').slice(0, LIST_LIMIT).each((_, element) => {
    const text = clean($(element).attr('alt') ?? '');
    if (text) fields.push({ kind: 'alt', text });
  });

  $('a').slice(0, LIST_LIMIT).each((_, element) => {
    const text = clean($(element).text());
    if (text) fields.push({ kind: 'anchor', text });
  });

  const body = $('body').clone();
  body.find('script, style, noscript, template, svg, nav, footer').remove();
  body.find('p, li, div, section, article, h1, h2, h3').append(' ');
  const bodyText = clean(body.text()).slice(0, BODY_LIMIT);
  if (bodyText) fields.push({ kind: 'body', text: bodyText });

  try {
    const path = decodeURIComponent(new URL(page.finalUrl).pathname).replace(/[-_/]+/g, ' ');
    if (path.trim()) fields.push({ kind: 'url', text: path });
  } catch {
    fields.push({ kind: 'url', text: page.finalUrl });
  }

  return { url: page.finalUrl, fields };
}

export function ngrams(text: string, maxN = 3, locale = 'es-ES', maxTokens = 2_500): string[] {
  const tokens = tokenize(text).slice(0, maxTokens);
  const phrases: string[] = [];

  for (let size = 1; size <= maxN; size += 1) {
    for (let index = 0; index + size <= tokens.length; index += 1) {
      const slice = tokens.slice(index, index + size);
      if (size === 1 && (slice[0]?.length ?? 0) < 3) continue;
      if (!isUsefulPhrase(slice, locale)) continue;
      phrases.push(slice.join(' '));
    }
  }

  return phrases;
}

import type { RenderedPage } from './types.js';

const DEFAULT_MAX_PAGES = 10;

const SKIP_EXTENSIONS = new Set([
  '.pdf',
  '.zip',
  '.rar',
  '.7z',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.js',
  '.css',
  '.xml',
  '.json',
  '.txt',
  '.rss',
]);

export interface CrawlProgress {
  crawled: number;
  maxPages: number;
  pending: number;
  url: string;
  depth: number;
}

export interface CrawlError {
  url: string;
  depth: number;
  message: string;
}

export interface CrawledPage extends RenderedPage {
  depth: number;
}

export interface CrawlOptions {
  maxPages?: number;
  initialPage?: RenderedPage;
  render: (url: string) => Promise<RenderedPage>;
  onPage?: (page: CrawledPage, progress: CrawlProgress) => void;
}

export interface CrawlResult {
  startUrl: string;
  host: string;
  pages: CrawledPage[];
  errors: CrawlError[];
  visited: number;
  elapsedMs: number;
}

interface QueueItem {
  url: string;
  depth: number;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'igshid',
  'mkt_tok',
  'vero_id',
  'oly_enc_id',
  'oly_anon_id',
  's_cid',
  'wickedid',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

function withoutTracking(url: URL): URL {
  const clean = new URL(url.toString());
  clean.hash = '';
  for (const name of [...clean.searchParams.keys()]) {
    if (isTrackingParam(name)) clean.searchParams.delete(name);
  }
  return clean;
}

function crawlKey(url: URL): string {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : '';
  return `${url.host}${path}${search}`;
}

function hasSkippedExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').pop() ?? '';
  const dot = lastSegment.lastIndexOf('.');
  if (dot === -1) return false;
  return SKIP_EXTENSIONS.has(lastSegment.slice(dot).toLowerCase());
}

export async function crawlSite(startUrl: string, options: CrawlOptions): Promise<CrawlResult> {
  const started = Date.now();
  const start = parseHttpUrl(startUrl);
  if (!start) throw new Error(`URL de inicio inválida: ${startUrl}`);

  const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES));
  const pages: CrawledPage[] = [];
  const errors: CrawlError[] = [];
  const visited = new Set<string>();
  const queue: QueueItem[] = [];

  let host = start.host;

  if (options.initialPage) {
    const initial = options.initialPage;
    const finalUrl = withoutTracking(parseHttpUrl(initial.finalUrl) ?? start);
    host = finalUrl.host;
    pages.push({ ...initial, depth: 0 });
    visited.add(crawlKey(finalUrl));
    visited.add(crawlKey(withoutTracking(start)));
  } else {
    visited.add(crawlKey(withoutTracking(start)));
    queue.push({ url: start.toString(), depth: 0 });
  }

  const enqueue = (raw: string, depth: number): void => {
    const url = parseHttpUrl(raw);
    if (!url) return;
    if (url.host !== host) return;
    if (hasSkippedExtension(url.pathname)) return;

    const clean = withoutTracking(url);
    const key = crawlKey(clean);
    if (visited.has(key)) return;

    visited.add(key);
    queue.push({ url: clean.toString(), depth });
  };

  if (options.initialPage) {
    for (const link of options.initialPage.links) enqueue(link, 1);
  }

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (!next) break;

    let rendered: RenderedPage;
    try {
      rendered = await options.render(next.url);
    } catch (error) {
      errors.push({ url: next.url, depth: next.depth, message: messageOf(error) });
      continue;
    }

    const crawled: CrawledPage = { ...rendered, depth: next.depth };
    pages.push(crawled);
    options.onPage?.(crawled, {
      crawled: pages.length,
      maxPages,
      pending: queue.length,
      url: crawled.finalUrl,
      depth: next.depth,
    });

    for (const link of rendered.links) enqueue(link, next.depth + 1);
  }

  return {
    startUrl: start.toString(),
    host,
    pages,
    errors,
    visited: visited.size,
    elapsedMs: Date.now() - started,
  };
}

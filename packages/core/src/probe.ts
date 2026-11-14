import type { HttpProbe, ResourceProbe, SiteProbe } from './types.js';
import { assertSafeUrl, normalizeUrl, type UrlGuardOptions } from './url.js';

const USER_AGENT = 'seo-audit/0.1 (auditoría SEO local)';
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 20_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ProbeOptions extends UrlGuardOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

interface GuardedFetchResult {
  response: Response;
  chain: string[];
  finalUrl: URL;
}

async function fetchGuarded(
  target: URL,
  options: ProbeOptions,
  accept: string,
): Promise<GuardedFetchResult> {
  let current = target;
  const chain: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafeUrl(current, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept,
        },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        if (response.body) await response.body.cancel().catch(() => undefined);
        if (!location) return { response, chain, finalUrl: current };

        chain.push(current.toString());
        current = new URL(location, current);
        continue;
      }

      return { response, chain, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Demasiadas redirecciones (máximo ${MAX_REDIRECTS}).`);
}

async function readTextLimited(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean; bytes: number }> {
  if (!response.body) return { text: '', truncated: false, bytes: 0 };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    bytes += value.byteLength;

    if (bytes > maxBytes) {
      const keep = value.byteLength - (bytes - maxBytes);
      if (keep > 0) chunks.push(value.subarray(0, keep));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }

    chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder('utf-8', { fatal: false }).decode(merged),
    truncated,
    bytes,
  };
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function probeUrl(
  rawUrl: string | URL,
  options: ProbeOptions = {},
): Promise<HttpProbe> {
  const url = rawUrl instanceof URL ? rawUrl : normalizeUrl(rawUrl);
  const started = Date.now();

  try {
    const { response, chain, finalUrl } = await fetchGuarded(
      url,
      options,
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    );

    const contentType = response.headers.get('content-type');
    const isTextual = !contentType || /text\/|html|xml|json/i.test(contentType);
    const body = isTextual
      ? await readTextLimited(response, options.maxBytes ?? MAX_HTML_BYTES)
      : { text: '', truncated: false, bytes: 0 };

    return {
      url: url.toString(),
      finalUrl: finalUrl.toString(),
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      setCookies: getSetCookieHeaders(response),
      contentType,
      html: body.text,
      htmlBytes: body.bytes,
      truncated: body.truncated,
      redirectChain: chain,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      url: url.toString(),
      finalUrl: url.toString(),
      status: 0,
      headers: {},
      setCookies: [],
      contentType: null,
      html: '',
      htmlBytes: 0,
      truncated: false,
      redirectChain: [],
      elapsedMs: Date.now() - started,
      error: messageOf(error),
    };
  }
}

function countLocs(text: string): number {
  return (text.match(/<loc>/gi) ?? []).length;
}

function extractSitemapUrls(robotsText: string): string[] {
  const urls: string[] = [];
  for (const match of robotsText.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)) {
    const value = match[1];
    if (value) urls.push(value);
  }
  return urls;
}

async function probeTextResource(url: URL, options: ProbeOptions): Promise<ResourceProbe> {
  try {
    const { response, finalUrl } = await fetchGuarded(
      url,
      options,
      'text/plain,application/xml,text/xml,*/*;q=0.8',
    );
    const body = await readTextLimited(response, options.maxBytes ?? MAX_TEXT_BYTES);

    return {
      url: url.toString(),
      finalUrl: finalUrl.toString(),
      status: response.status,
      found: response.ok,
      contentType: response.headers.get('content-type'),
      bytes: body.bytes,
      text: body.text,
      urlsCount: countLocs(body.text),
    };
  } catch (error) {
    return {
      url: url.toString(),
      finalUrl: url.toString(),
      status: 0,
      found: false,
      contentType: null,
      bytes: 0,
      text: '',
      urlsCount: 0,
      error: messageOf(error),
    };
  }
}

export async function probeSite(url: URL, options: ProbeOptions = {}): Promise<SiteProbe> {
  const origin = new URL(url.origin);
  const robots = await probeTextResource(new URL('/robots.txt', origin), options);
  const declared = extractSitemapUrls(robots.text);

  const candidates: URL[] = [];
  const addCandidate = (candidate: URL): void => {
    if (!candidates.some((existing) => existing.href === candidate.href)) {
      candidates.push(candidate);
    }
  };

  for (const declaredUrl of declared) {
    try {
      addCandidate(new URL(declaredUrl, origin));
    } catch {
      // Directiva Sitemap inválida en robots.txt: se ignora.
    }
  }
  addCandidate(new URL('/sitemap.xml', origin));
  addCandidate(new URL('/sitemap_index.xml', origin));

  let sitemap: ResourceProbe | null = null;
  for (const candidate of candidates) {
    const probe = await probeTextResource(candidate, options);
    sitemap = sitemap ?? probe;
    if (probe.found && /<(urlset|sitemapindex)\b/i.test(probe.text)) {
      sitemap = probe;
      break;
    }
  }
  if (!sitemap) {
    sitemap = await probeTextResource(new URL('/sitemap.xml', origin), options);
  }

  return { robots, sitemap, sitemapsDeclared: declared };
}

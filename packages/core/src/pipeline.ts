import { crawlSite, type CrawlProgress, type CrawlResult, type CrawledPage } from './crawl.js';
import { detectStack, type StackReport } from './detect/stack.js';
import {
  analyzeKeywords,
  loadKeywordProviders,
  readKeywordConfig,
  type KeywordOptions,
  type KeywordReport,
} from './keywords/index.js';
import { runLighthouse, type LighthouseResult } from './perf/lighthouse.js';
import { probeSite, probeUrl, type ProbeOptions } from './probe.js';
import { launchBrowser, renderPage } from './render.js';
import { analyzeSeo, type SiteSeoResult } from './seo/index.js';
import type { HttpProbe, RenderedPage, SiteProbe } from './types.js';
import { assertSafeUrl, normalizeUrl, type UrlGuardOptions } from './url.js';

export interface InspectOptions extends UrlGuardOptions {
  timeoutMs?: number;
  maxHtmlBytes?: number;
  maxPages?: number;
  lighthouse?: boolean;
  chromePath?: string;
  keywords?: boolean | KeywordOptions;
  onPage?: (page: CrawledPage, progress: CrawlProgress) => void;
}

export interface InspectResult {
  probe: HttpProbe;
  site: SiteProbe;
  page: RenderedPage;
  stack: StackReport;
  crawl: CrawlResult;
  seo: SiteSeoResult;
  lighthouse?: LighthouseResult;
  keywords?: KeywordReport | null;
}

interface RenderedInspection {
  page: RenderedPage;
  stack: StackReport;
  crawl: CrawlResult;
}

function cookieNamesFromSetCookie(entries: string[]): string[] {
  return entries
    .map((entry) => entry.split(';')[0]?.split('=')[0]?.trim() ?? '')
    .filter((name) => name.length > 0);
}

async function inspectWithBrowser(
  url: URL,
  probe: HttpProbe,
  options: InspectOptions,
): Promise<RenderedInspection> {
  const browser = await launchBrowser();

  try {
    const page = await renderPage(browser, url.toString(), { timeoutMs: options.timeoutMs });

    const stack = detectStack({
      headers: { ...probe.headers, ...page.headers },
      html: page.html || probe.html,
      cookieNames: [
        ...new Set([...cookieNamesFromSetCookie(probe.setCookies), ...page.cookieNames]),
      ],
      dom: page.dom,
      resources: page.resources,
    });

    const crawl = await crawlSite(url.toString(), {
      maxPages: options.maxPages,
      initialPage: page,
      onPage: options.onPage,
      render: (target) => renderPage(browser, target, { timeoutMs: options.timeoutMs }),
    });

    return { page, stack, crawl };
  } finally {
    await browser.close();
  }
}

export async function inspectSite(
  input: string,
  options: InspectOptions = {},
): Promise<InspectResult> {
  const url = normalizeUrl(input);
  await assertSafeUrl(url, options);

  const probeOptions: ProbeOptions = {
    allowPrivateHosts: options.allowPrivateHosts,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxHtmlBytes,
  };

  const probe = await probeUrl(url, probeOptions);
  const site = await probeSite(url, {
    allowPrivateHosts: options.allowPrivateHosts,
    timeoutMs: options.timeoutMs,
  });

  const { page, stack, crawl } = await inspectWithBrowser(url, probe, options);

  const seo = analyzeSeo({
    pages: crawl.pages,
    probe,
    site,
    stack,
    crawlErrors: crawl.errors.length,
  });

  const lighthouse =
    options.lighthouse === false
      ? undefined
      : await runLighthouse(url.toString(), {
          chromePath: options.chromePath,
          timeoutMs: options.timeoutMs,
        });

  let keywords: KeywordReport | null = null;

  if (options.keywords !== false) {
    try {
      const keywordOptions = options.keywords === true || options.keywords === undefined
        ? {}
        : options.keywords;
      const config = readKeywordConfig(keywordOptions);
      const host = new URL(probe.finalUrl).host;
      const now = new Date();
      const providerResults = await loadKeywordProviders(config, {
        host,
        finalUrl: probe.finalUrl,
        locale: config.locale,
        country: config.country,
        now,
        refresh: config.refresh,
        cacheDir: config.cacheDir,
        timeoutMs: config.timeoutMs,
        fetchImpl: fetch,
      });

      keywords = analyzeKeywords({
        pages: crawl.pages,
        host,
        locale: config.locale,
        country: config.country,
        negativeTerms: config.negativeTerms,
        now,
        providerResults,
      });
    } catch {
      keywords = null;
    }
  }

  return { probe, site, page, stack, crawl, seo, lighthouse, keywords };
}

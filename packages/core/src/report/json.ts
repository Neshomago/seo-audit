import type { CrawlError } from '../crawl.js';
import type { StackReport } from '../detect/stack.js';
import type { KeywordReport } from '../keywords/types.js';
import type { LighthouseResult } from '../perf/lighthouse.js';
import type { InspectResult } from '../pipeline.js';
import type { SiteSeoResult } from '../seo/types.js';

export interface AuditPageSummary {
  url: string;
  finalUrl: string;
  status: number | null;
  depth: number;
  title: string;
}

export interface AuditData {
  url: string;
  generatedAt: string;
  status: number;
  redirects: string[];
  stack: StackReport;
  seo: SiteSeoResult;
  lighthouse: LighthouseResult | null;
  keywords: KeywordReport | null;
  crawl: {
    host: string;
    elapsedMs: number;
    pages: AuditPageSummary[];
    errors: CrawlError[];
  };
  heaviest: Array<{ url: string; bytes: number }>;
}

export function toAuditData(result: InspectResult, generatedAt: Date = new Date()): AuditData {
  const heaviest = [...result.page.resources]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 10)
    .map((resource) => ({ url: resource.name, bytes: resource.transferSize }));

  return {
    url: result.probe.finalUrl,
    generatedAt: generatedAt.toISOString(),
    status: result.probe.status,
    redirects: result.probe.redirectChain,
    stack: result.stack,
    seo: result.seo,
    lighthouse: result.lighthouse ?? null,
    keywords: result.keywords ?? null,
    crawl: {
      host: result.crawl.host,
      elapsedMs: result.crawl.elapsedMs,
      pages: result.crawl.pages.map((page) => ({
        url: page.url,
        finalUrl: page.finalUrl,
        status: page.status,
        depth: page.depth,
        title: page.title,
      })),
      errors: result.crawl.errors,
    },
    heaviest,
  };
}

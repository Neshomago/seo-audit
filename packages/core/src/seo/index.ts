import type { CrawledPage } from '../crawl.js';
import type { StackReport } from '../detect/stack.js';
import { buildPageChecks } from './page-checks.js';
import { buildSiteChecks } from './site-checks.js';
import { buildStackContext } from './fixes.js';
import { parsePageSeo } from './parse.js';
import type { HttpProbe, SiteProbe } from '../types.js';
import type { PageSeoResult, SeoCheck, SeoSummary, SiteSeoResult } from './types.js';

export interface AnalyzeSeoInput {
  pages: CrawledPage[];
  probe: HttpProbe;
  site: SiteProbe;
  stack?: StackReport;
  crawlErrors?: number;
}

function summarize(checks: SeoCheck[]): SeoSummary {
  return checks.reduce<SeoSummary>(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
}

export function analyzeSeo(input: AnalyzeSeoInput): SiteSeoResult {
  const context = buildStackContext(input.stack);

  const pages: PageSeoResult[] = input.pages.map((page) => {
    const data = parsePageSeo(page.html, page.finalUrl, page.status, page.headers);
    return { url: page.finalUrl, data, checks: buildPageChecks(data, context) };
  });

  const siteChecks = buildSiteChecks({
    probe: input.probe,
    site: input.site,
    pages,
    crawlPages: input.pages,
    crawlErrors: input.crawlErrors,
    context,
  });

  const checks = [...siteChecks, ...pages.flatMap((page) => page.checks)];

  return { checks, pages, summary: summarize(checks) };
}

export * from './types.js';
export { parsePageSeo } from './parse.js';
export { buildPageChecks } from './page-checks.js';
export { buildSiteChecks, type SiteChecksInput } from './site-checks.js';
export { buildStackContext, fixFor, type FixTopic, type StackContext } from './fixes.js';

import { inspectSite } from './pipeline.js';

const target = process.argv[2];

function readMaxPages(): number {
  const index = process.argv.indexOf('--max-pages');
  if (index === -1) return 10;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value < 1) return 10;
  return Math.floor(value);
}

if (!target) {
  console.error('Uso: npm run smoke -- <url> [--max-pages N] [--allow-private] [--no-lighthouse]');
  process.exit(1);
}

try {
  const result = await inspectSite(target, {
    allowPrivateHosts: process.argv.includes('--allow-private'),
    maxPages: readMaxPages(),
    lighthouse: !process.argv.includes('--no-lighthouse'),
  });

  const heaviest = [...result.page.resources]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 5)
    .map((resource) => ({
      url: resource.name,
      kb: Math.round(resource.transferSize / 1024),
    }));

  console.log(
    JSON.stringify(
      {
        url: result.probe.finalUrl,
        status: result.probe.status,
        redirects: result.probe.redirectChain,
        html: {
          bytes: result.probe.htmlBytes,
          truncated: result.probe.truncated,
        },
        robots: {
          status: result.site.robots.status,
          found: result.site.robots.found,
        },
        sitemap: {
          url: result.site.sitemap.url,
          status: result.site.sitemap.status,
          found: result.site.sitemap.found,
          urls: result.site.sitemap.urlsCount,
        },
        render: {
          finalUrl: result.page.finalUrl,
          status: result.page.status,
          title: result.page.title,
          links: result.page.links.length,
          resources: result.page.resources.length,
          consoleErrors: result.page.consoleErrors.length,
          error: result.page.error,
        },
        crawl: {
          host: result.crawl.host,
          pages: result.crawl.pages.map((page) => ({
            url: page.url,
            finalUrl: page.finalUrl,
            status: page.status,
            depth: page.depth,
            title: page.title,
            links: page.links.length,
          })),
          errors: result.crawl.errors,
          visited: result.crawl.visited,
          elapsedMs: result.crawl.elapsedMs,
        },
        stack: result.stack,
        seo: {
          summary: result.seo.summary,
          checks: result.seo.checks.map((check) => ({
            id: check.id,
            status: check.status,
            severity: check.severity,
            title: check.title,
            pageUrl: check.pageUrl,
          })),
        },
        lighthouse: result.lighthouse
          ? {
              error: result.lighthouse.error,
              scores: result.lighthouse.scores,
              metrics: result.lighthouse.metrics,
              failingAudits: result.lighthouse.failingAudits.slice(0, 12).map((audit) => ({
                id: audit.id,
                category: audit.category,
                severity: audit.severity,
                score: audit.score,
                title: audit.title,
                displayValue: audit.displayValue,
              })),
              elapsedMs: result.lighthouse.elapsedMs,
            }
          : null,
        heaviest,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

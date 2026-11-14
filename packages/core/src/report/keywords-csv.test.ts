import { describe, expect, it } from 'vitest';
import type { CrawledPage } from '../crawl.js';
import { createEmptyDom } from '../dom.js';
import { analyzeKeywords } from '../keywords/analyze.js';
import { toNegativeKeywordsCsv, toPositiveKeywordsCsv } from './keywords-csv.js';

function page(): CrawledPage {
  const url = 'https://example.com/auditoria-seo';
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {},
    html: `<html><head><title>Auditoría SEO</title></head><body><h1>Auditoría SEO</h1><p>Informe de auditoría SEO.</p></body></html>`,
    title: '',
    cookieNames: [],
    resources: [],
    links: [],
    consoleErrors: [],
    dom: createEmptyDom(),
    elapsedMs: 0,
    depth: 0,
  };
}

describe('keywords CSV', () => {
  it('exporta positivas con BOM y métricas separadas', () => {
    const report = analyzeKeywords({ pages: [page()], host: 'example.com' });
    const csv = toPositiveKeywordsCsv(report);

    expect(csv.startsWith('\uFEFFkeyword,intent')).toBe(true);
    expect(csv).toContain('auditoría seo');
    expect(csv).toContain('recommended_page');
    expect(csv).toContain('\r\n');
  });

  it('protege las celdas contra fórmulas de Excel', () => {
    const report = analyzeKeywords({
      pages: [page()],
      host: 'example.com',
      negativeTerms: ['=SUM(A1)'],
    });
    const csv = toNegativeKeywordsCsv(report);

    expect(csv).toContain("'=SUM(A1)");
  });
});

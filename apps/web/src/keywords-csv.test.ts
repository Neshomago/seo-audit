import { describe, expect, it } from 'vitest';
import type { KeywordReport } from '@seo-audit/core';
import { toNegativeKeywordsCsv, toPositiveKeywordsCsv } from './keywords-csv.js';

const report: KeywordReport = {
  version: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  locale: 'es-ES',
  country: 'ES',
  period: null,
  providers: [],
  positives: [
    {
      keyword: 'auditoría seo',
      normalized: 'auditoria seo',
      intent: 'informacional',
      score: 80,
      confidence: 'alta',
      sources: ['on-page'],
      onPage: {
        occurrences: 5,
        pages: 1,
        title: 1,
        headings: 1,
        meta: 0,
        url: 1,
        alt: 0,
        anchors: 0,
        body: 2,
      },
      recommendedPage: 'https://example.com/',
      action: 'Ampliar contenido relacionado',
      cluster: 'auditoria',
      cannibalization: [],
    },
  ],
  negatives: [
    {
      keyword: '=SUM(A1)',
      normalized: 'sum a1',
      reason: 'Definido manualmente',
      confidence: 'alta',
      matchType: 'phrase',
      sources: ['on-page'],
    },
  ],
  clusters: [],
  summary: {
    positives: 1,
    negatives: 1,
    highConfidence: 1,
    clusters: 0,
    externalSources: 0,
  },
  limitations: [],
};

describe('web keywords CSV', () => {
  it('exporta positivas con BOM y acentos', () => {
    const csv = toPositiveKeywordsCsv(report);
    expect(csv.startsWith('\uFEFFkeyword')).toBe(true);
    expect(csv).toContain('auditoría seo');
  });

  it('protege las fórmulas en negativas', () => {
    expect(toNegativeKeywordsCsv(report)).toContain("'=SUM(A1)");
  });
});

import type { KeywordReport } from '@seo-audit/core';

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export function toPositiveKeywordsCsv(report: KeywordReport): string {
  return csv([
    [
      'keyword',
      'intent',
      'score',
      'confidence',
      'sources',
      'gsc_impressions',
      'gsc_clicks',
      'gsc_position',
      'bing_impressions',
      'bing_clicks',
      'bing_position',
      'recommended_page',
      'action',
      'cluster',
      'cannibalization',
    ],
    ...report.positives.map((candidate) => [
      candidate.keyword,
      candidate.intent,
      candidate.score,
      candidate.confidence,
      candidate.sources.join('|'),
      candidate.gsc?.impressions ?? '',
      candidate.gsc?.clicks ?? '',
      candidate.gsc?.position ?? '',
      candidate.bing?.impressions ?? '',
      candidate.bing?.clicks ?? '',
      candidate.bing?.position ?? '',
      candidate.recommendedPage ?? '',
      candidate.action,
      candidate.cluster ?? '',
      candidate.cannibalization.join('|'),
    ]),
  ]);
}

export function toNegativeKeywordsCsv(report: KeywordReport): string {
  return csv([
    ['keyword', 'match_type', 'reason', 'confidence', 'sources'],
    ...report.negatives.map((negative) => [
      negative.keyword,
      negative.matchType,
      negative.reason,
      negative.confidence,
      negative.sources.join('|'),
    ]),
  ]);
}

import type { KeywordCandidate, KeywordReport } from '@seo-audit/core';

export interface KeywordFilters {
  query: string;
  intent: string;
  source: string;
}

export function filterKeywords(
  report: KeywordReport,
  filters: KeywordFilters,
): KeywordCandidate[] {
  const query = filters.query.trim().toLowerCase();
  return report.positives.filter((candidate) => {
    const matchesQuery =
      query.length === 0 ||
      candidate.keyword.toLowerCase().includes(query) ||
      candidate.normalized.includes(query);
    const matchesIntent = filters.intent === 'todas' || candidate.intent === filters.intent;
    const matchesSource =
      filters.source === 'todas' ||
      candidate.sources.includes(filters.source as KeywordCandidate['sources'][number]);
    return matchesQuery && matchesIntent && matchesSource;
  });
}

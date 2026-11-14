import type { CrawledPage } from '../crawl.js';
import type { Confidence } from '../types.js';
import { detectIntent } from './intent.js';
import { extractPageSignals, ngrams, type KeywordField } from './extract.js';
import { isStopword, normalizeKeyword, tokenize } from './normalize.js';
import type {
  KeywordCandidate,
  KeywordCluster,
  KeywordMetrics,
  KeywordOnPageSignals,
  KeywordProviderResult,
  KeywordReport,
  KeywordSource,
  NegativeKeyword,
} from './types.js';

const FIELD_WEIGHTS: Record<KeywordField, number> = {
  title: 6,
  h1: 5,
  h2: 3,
  h3: 2,
  meta: 2,
  url: 2,
  alt: 1.5,
  anchor: 1,
  body: 0.15,
};

const MAX_POSITIVES = 50;
const MAX_NEGATIVES = 30;

interface Accumulator {
  keyword: string;
  normalized: string;
  counts: Record<KeywordField, number>;
  pages: Set<string>;
  pageScores: Map<string, number>;
  titlePages: Set<string>;
  h1Pages: Set<string>;
  externalPages: Set<string>;
  sources: Set<KeywordSource>;
  gsc?: KeywordMetrics;
  bing?: KeywordMetrics;
}

export interface AnalyzeKeywordsInput {
  pages: CrawledPage[];
  host: string;
  locale?: string;
  country?: string;
  negativeTerms?: string[];
  now?: Date;
  period?: { start: string; end: string } | null;
  providerResults?: KeywordProviderResult[];
}

function emptyCounts(): Record<KeywordField, number> {
  return { title: 0, h1: 0, h2: 0, h3: 0, meta: 0, url: 0, alt: 0, anchor: 0, body: 0 };
}

function accumulatorFor(
  items: Map<string, Accumulator>,
  keyword: string,
  normalized: string,
): Accumulator {
  const existing = items.get(normalized);
  if (existing) return existing;

  const created: Accumulator = {
    keyword,
    normalized,
    counts: emptyCounts(),
    pages: new Set(),
    pageScores: new Map(),
    titlePages: new Set(),
    h1Pages: new Set(),
    externalPages: new Set(),
    sources: new Set(['on-page']),
  };
  items.set(normalized, created);
  return created;
}

function collectOnPage(pages: CrawledPage[], locale: string): Map<string, Accumulator> {
  const items = new Map<string, Accumulator>();

  for (const page of pages) {
    const signals = extractPageSignals(page);

    for (const field of signals.fields) {
      const phrases = ngrams(field.text, 3, locale);

      for (const phrase of phrases) {
        const normalized = normalizeKeyword(phrase);
        if (!normalized) continue;

        const item = accumulatorFor(items, phrase, normalized);
        item.counts[field.kind] += 1;
        item.pages.add(page.finalUrl);
        item.pageScores.set(
          page.finalUrl,
          (item.pageScores.get(page.finalUrl) ?? 0) + FIELD_WEIGHTS[field.kind],
        );
        if (field.kind === 'title') item.titlePages.add(page.finalUrl);
        if (field.kind === 'h1') item.h1Pages.add(page.finalUrl);
        item.sources.add('on-page');
      }
    }
  }

  return items;
}

function onPageSignals(item: Accumulator): KeywordOnPageSignals {
  return {
    occurrences: Object.values(item.counts).reduce((total, count) => total + count, 0),
    pages: item.pages.size,
    title: item.counts.title,
    headings: item.counts.h1 + item.counts.h2 + item.counts.h3,
    meta: item.counts.meta,
    url: item.counts.url,
    alt: item.counts.alt,
    anchors: item.counts.anchor,
    body: item.counts.body,
  };
}

function onPageRawScore(item: Accumulator): number {
  return (
    item.counts.title * FIELD_WEIGHTS.title +
    item.counts.h1 * FIELD_WEIGHTS.h1 +
    item.counts.h2 * FIELD_WEIGHTS.h2 +
    item.counts.h3 * FIELD_WEIGHTS.h3 +
    item.counts.meta * FIELD_WEIGHTS.meta +
    item.counts.url * FIELD_WEIGHTS.url +
    item.counts.alt * FIELD_WEIGHTS.alt +
    item.counts.anchor * FIELD_WEIGHTS.anchor +
    item.counts.body * FIELD_WEIGHTS.body +
    item.pages.size * 2
  );
}

function mergeProviderRows(
  items: Map<string, Accumulator>,
  providerResults: KeywordProviderResult[],
): void {
  for (const result of providerResults) {
    for (const row of result.rows) {
      const normalized = normalizeKeyword(row.keyword);
      if (!normalized) continue;

      const item = accumulatorFor(items, row.keyword, normalized);
      item.sources.add(result.status.provider);

      if (result.status.provider === 'gsc') item.gsc = row.metrics;
      else item.bing = row.metrics;

      for (const page of row.pages ?? []) item.externalPages.add(page);
    }
  }
}

function topPage(item: Accumulator): string | null {
  let best: string | null = null;
  let bestScore = -1;

  for (const [page, score] of item.pageScores) {
    if (score > bestScore) {
      best = page;
      bestScore = score;
    }
  }

  return best ?? item.externalPages.values().next().value ?? null;
}

function confidenceFor(item: Accumulator, impressions: number): Confidence {
  const signals = onPageSignals(item);
  if (impressions >= 100 || signals.title > 0 || signals.headings > 0 || signals.pages >= 3) {
    return 'alta';
  }
  if (impressions > 0 || signals.meta > 0 || signals.anchors > 0 || signals.pages >= 2) {
    return 'media';
  }
  return 'baja';
}

function actionFor(item: Accumulator): string {
  const metrics = item.gsc ?? item.bing;
  if (metrics && metrics.position > 0) {
    if (metrics.position <= 3) return 'Defender y ampliar';
    if (metrics.position <= 20) return 'Optimizar página existente';
    return 'Crear contenido específico';
  }
  if (item.counts.title === 0 && item.counts.h1 === 0) return 'Incluir en título y H1';
  if (item.pages.size >= 2) return 'Reforzar y evitar canibalización';
  return 'Ampliar contenido relacionado';
}

function clusterFor(normalized: string, locale: string): string {
  const tokens = tokenize(normalized);
  return tokens.find((token) => !isStopword(token, locale)) ?? 'otros';
}

function cannibalizationFor(item: Accumulator): string[] {
  return [...new Set([...item.titlePages, ...item.h1Pages, ...item.externalPages])]
    .filter((page) => item.pages.has(page) || item.externalPages.has(page))
    .slice(0, 5);
}

function demandOf(item: Accumulator): number {
  return Math.max(item.gsc?.impressions ?? 0, item.bing?.impressions ?? 0);
}

const NEGATIVE_RULES: Array<{ terms: string[]; reason: string }> = [
  {
    terms: ['empleo', 'trabajo', 'trabajar', 'vacante', 'vacantes', 'curriculum', 'sueldo', 'salario', 'practicas'],
    reason: 'Intención de empleo o candidatura',
  },
  {
    terms: ['soporte', 'ayuda', 'telefono', 'contacto', 'incidencia', 'error', 'problema'],
    reason: 'Intención de soporte o contacto',
  },
  {
    terms: ['gratis', 'descargar', 'descarga'],
    reason: 'Intención gratuita o descarga',
  },
  {
    terms: ['segunda mano', 'usado', 'usada', 'ocasion'],
    reason: 'Producto de segunda mano',
  },
  {
    terms: ['login', 'iniciar sesion', 'acceder', 'area privada'],
    reason: 'Intención de acceso a cuenta',
  },
  {
    terms: ['aviso legal', 'politica de privacidad', 'cookies'],
    reason: 'Página legal o administrativa',
  },
];

function hasPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(text);
}

function negativeFor(
  items: Map<string, Accumulator>,
  manualTerms: string[],
  locale: string,
): NegativeKeyword[] {
  const negatives = new Map<string, NegativeKeyword>();

  for (const item of items.values()) {
    for (const rule of NEGATIVE_RULES) {
      if (!rule.terms.some((term) => hasPhrase(item.normalized, term))) continue;
      negatives.set(item.normalized, {
        keyword: item.keyword,
        normalized: item.normalized,
        reason: rule.reason,
        confidence: 'media',
        matchType: tokenize(item.keyword).length > 1 ? 'phrase' : 'exact',
        sources: [...item.sources],
      });
      break;
    }
  }

  for (const raw of manualTerms) {
    const keyword = raw.replace(/\s+/g, ' ').trim();
    const normalized = normalizeKeyword(keyword);
    if (!normalized) continue;
    negatives.set(normalized, {
      keyword,
      normalized,
      reason: 'Definido manualmente',
      confidence: 'alta',
      matchType: tokenize(keyword).length > 1 ? 'phrase' : 'exact',
      sources: ['on-page'],
    });
  }

  return [...negatives.values()]
    .sort((a, b) => {
      const confidence = { alta: 0, media: 1, baja: 2 };
      return confidence[a.confidence] - confidence[b.confidence] || a.keyword.localeCompare(b.keyword, locale);
    })
    .slice(0, MAX_NEGATIVES);
}

function buildClusters(candidates: KeywordCandidate[]): KeywordCluster[] {
  const grouped = new Map<string, KeywordCandidate[]>();

  for (const candidate of candidates) {
    const label = candidate.cluster ?? 'otros';
    const list = grouped.get(label);
    if (list) list.push(candidate);
    else grouped.set(label, [candidate]);
  }

  return [...grouped.entries()]
    .map(([label, list]) => ({
      label,
      keywords: list.slice(0, 10).map((candidate) => candidate.keyword),
      score: list[0]?.score ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export function analyzeKeywords(input: AnalyzeKeywordsInput): KeywordReport {
  const locale = input.locale ?? 'es-ES';
  const country = input.country ?? 'ES';
  const now = input.now ?? new Date();
  const providerResults = input.providerResults ?? [];
  const period = input.period ?? providerResults.find((result) => result.period)?.period ?? null;
  const items = collectOnPage(input.pages, locale);
  mergeProviderRows(items, providerResults);

  const rawScores = new Map<string, number>();
  let maxRaw = 0;
  let maxDemand = 0;

  for (const item of items.values()) {
    const raw = onPageRawScore(item);
    rawScores.set(item.normalized, raw);
    maxRaw = Math.max(maxRaw, raw);
    maxDemand = Math.max(maxDemand, demandOf(item));
  }

  const candidates: KeywordCandidate[] = [];

  for (const item of items.values()) {
    const raw = rawScores.get(item.normalized) ?? 0;
    const demand = demandOf(item);
    if (raw <= 0 && demand <= 0) continue;

    const onPageScore = maxRaw > 0 ? 60 * (Math.log1p(raw) / Math.log1p(maxRaw)) : 0;
    const demandScore = maxDemand > 0 ? 40 * (Math.log1p(demand) / Math.log1p(maxDemand)) : 0;
    const score = Math.max(1, Math.round(onPageScore + demandScore));
    const signals = onPageSignals(item);
    const cannibalization = cannibalizationFor(item);

    candidates.push({
      keyword: item.keyword,
      normalized: item.normalized,
      intent: detectIntent(item.normalized, input.host),
      score,
      confidence: confidenceFor(item, demand),
      sources: [...item.sources].sort(),
      onPage: signals,
      gsc: item.gsc,
      bing: item.bing,
      recommendedPage: topPage(item),
      action: actionFor(item),
      cluster: clusterFor(item.normalized, locale),
      cannibalization,
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.gsc?.impressions ?? b.bing?.impressions ?? 0) -
        (a.gsc?.impressions ?? a.bing?.impressions ?? 0) ||
      a.keyword.localeCompare(b.keyword, locale),
  );

  const positives = candidates.slice(0, MAX_POSITIVES);
  const negatives = negativeFor(items, input.negativeTerms ?? [], locale);
  const clusters = buildClusters(positives);
  const externalSources = providerResults.filter(
    (result) => result.status.status === 'ok' || result.status.status === 'partial',
  ).length;

  return {
    version: 1,
    generatedAt: now.toISOString(),
    locale,
    country,
    period,
    providers: providerResults.map((result) => result.status),
    positives,
    negatives,
    clusters,
    summary: {
      positives: positives.length,
      negatives: negatives.length,
      highConfidence: positives.filter((candidate) => candidate.confidence === 'alta').length,
      clusters: clusters.length,
      externalSources,
    },
    limitations: [
      'Las keywords on-page son heurísticas y requieren revisión humana.',
      'Los datos de GSC y Bing no son volúmenes de búsqueda ni se suman entre sí.',
      'La posición media no equivale al ranking actual de una consulta concreta.',
      ...(externalSources === 0
        ? ['Sin datos de GSC/Bing: el informe contiene solo señales on-page.']
        : []),
    ],
  };
}

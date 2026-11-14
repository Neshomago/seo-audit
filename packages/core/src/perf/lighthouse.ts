import { existsSync } from 'node:fs';
import { launch, type LaunchedChrome } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { resolveChromePath } from '../chrome.js';

export type LighthouseCategoryKey = 'performance' | 'accessibility' | 'best-practices' | 'seo';

export type LighthouseSeverity = 'alto' | 'medio' | 'bajo';

export interface LighthouseScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface LighthouseMetric {
  id: string;
  label: string;
  value: number | null;
  displayValue: string | null;
  unit: 'ms' | 'unitless';
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description: string;
  category: LighthouseCategoryKey;
  score: number;
  displayValue: string | null;
  weight: number;
  severity: LighthouseSeverity;
}

export interface LighthouseResult {
  url: string;
  finalUrl: string | null;
  scores: LighthouseScores;
  metrics: LighthouseMetric[];
  failingAudits: LighthouseAudit[];
  elapsedMs: number;
  error?: string;
}

export interface RunLighthouseOptions {
  chromePath?: string;
  timeoutMs?: number;
  categories?: LighthouseCategoryKey[];
}

interface CategoryLike {
  score: number | null;
  auditRefs: Array<{ id: string; weight: number }>;
}

interface AuditLike {
  score: number | null;
  scoreDisplayMode: string;
  title: string;
  description?: string;
  displayValue?: string | null;
  numericValue?: number;
}

export interface LighthouseReportLike {
  requestedUrl?: string;
  finalUrl?: string;
  finalDisplayedUrl?: string;
  categories: Record<string, CategoryLike | undefined>;
  audits: Record<string, AuditLike | undefined>;
}

const DEFAULT_CATEGORIES: LighthouseCategoryKey[] = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
];

const METRICS: Array<{ id: string; label: string; unit: LighthouseMetric['unit'] }> = [
  { id: 'first-contentful-paint', label: 'First Contentful Paint', unit: 'ms' },
  { id: 'largest-contentful-paint', label: 'Largest Contentful Paint', unit: 'ms' },
  { id: 'total-blocking-time', label: 'Total Blocking Time', unit: 'ms' },
  { id: 'cumulative-layout-shift', label: 'Cumulative Layout Shift', unit: 'unitless' },
  { id: 'speed-index', label: 'Speed Index', unit: 'ms' },
  { id: 'interactive', label: 'Time to Interactive', unit: 'ms' },
];

function severityFor(weight: number, score: number): LighthouseSeverity {
  if (weight >= 10) return 'alto';
  if (weight >= 3) return score === 0 ? 'alto' : 'medio';
  return score === 0 ? 'medio' : 'bajo';
}

function categoryScore(
  categories: Record<string, CategoryLike | undefined>,
  key: LighthouseCategoryKey,
): number | null {
  return categories[key]?.score ?? null;
}

export function summarizeLighthouse(
  report: LighthouseReportLike,
  elapsedMs = 0,
): LighthouseResult {
  const metrics: LighthouseMetric[] = METRICS.map((metric) => {
    const audit = report.audits[metric.id];
    return {
      id: metric.id,
      label: metric.label,
      value: typeof audit?.numericValue === 'number' ? audit.numericValue : null,
      displayValue: audit?.displayValue ?? null,
      unit: metric.unit,
    };
  });

  const failingAudits: LighthouseAudit[] = [];
  const seen = new Set<string>();

  for (const category of DEFAULT_CATEGORIES) {
    const result = report.categories[category];
    if (!result) continue;

    for (const ref of result.auditRefs) {
      if (seen.has(ref.id)) continue;
      const audit = report.audits[ref.id];
      if (!audit) continue;
      if (audit.score === null || audit.score >= 1) continue;
      if (['notApplicable', 'informative', 'manual'].includes(audit.scoreDisplayMode)) continue;

      seen.add(ref.id);
      failingAudits.push({
        id: ref.id,
        title: audit.title,
        description: audit.description ?? '',
        category,
        score: audit.score,
        displayValue: audit.displayValue ?? null,
        weight: ref.weight,
        severity: severityFor(ref.weight, audit.score),
      });
    }
  }

  failingAudits.sort((a, b) => b.weight - a.weight || a.score - b.score);

  return {
    url: report.requestedUrl ?? report.finalUrl ?? report.finalDisplayedUrl ?? '',
    finalUrl: report.finalUrl ?? report.finalDisplayedUrl ?? null,
    scores: {
      performance: categoryScore(report.categories, 'performance'),
      accessibility: categoryScore(report.categories, 'accessibility'),
      bestPractices: categoryScore(report.categories, 'best-practices'),
      seo: categoryScore(report.categories, 'seo'),
    },
    metrics,
    failingAudits,
    elapsedMs,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runLighthouse(
  url: string,
  options: RunLighthouseOptions = {},
): Promise<LighthouseResult> {
  const started = Date.now();
  const categories = options.categories ?? DEFAULT_CATEGORIES;
  let chrome: LaunchedChrome | null = null;

  try {
    const chromePath = options.chromePath ?? resolveChromePath();
    if (!existsSync(chromePath)) {
      throw new Error(
        `No se encontró el ejecutable de Chrome en "${chromePath}". Instala Chrome o define CHROME_PATH.`,
      );
    }
    chrome = await launch({
      chromePath,
      chromeFlags: [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      logLevel: 'silent',
    });

    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: categories,
      maxWaitForLoad: Math.max(10_000, options.timeoutMs ?? 45_000),
    });

    if (!result) {
      return {
        url,
        finalUrl: null,
        scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
        metrics: [],
        failingAudits: [],
        elapsedMs: Date.now() - started,
        error: 'Lighthouse no devolvió resultados.',
      };
    }

    return summarizeLighthouse(result.lhr, Date.now() - started);
  } catch (error) {
    return {
      url,
      finalUrl: null,
      scores: { performance: null, accessibility: null, bestPractices: null, seo: null },
      metrics: [],
      failingAudits: [],
      elapsedMs: Date.now() - started,
      error: messageOf(error),
    };
  } finally {
    chrome?.kill();
  }
}

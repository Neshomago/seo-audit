import type {
  CheckStatus,
  LighthouseAudit,
  LighthouseMetric,
  Severity,
} from '@seo-audit/core';

export const severityOrder: Severity[] = ['critico', 'alto', 'medio', 'bajo'];

export const severityLabel: Record<Severity, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
};

export const severityPlural: Record<Severity, string> = {
  critico: 'Críticos',
  alto: 'Altos',
  medio: 'Medios',
  bajo: 'Bajos',
};

export const severityClasses: Record<Severity, string> = {
  critico: 'bg-rose-100 text-rose-800 ring-rose-200',
  alto: 'bg-orange-100 text-orange-800 ring-orange-200',
  medio: 'bg-amber-100 text-amber-800 ring-amber-200',
  bajo: 'bg-sky-100 text-sky-800 ring-sky-200',
};

export const statusLabel: Record<CheckStatus, string> = {
  pass: 'Correcto',
  warn: 'Aviso',
  fail: 'Fallo',
};

export const statusClasses: Record<CheckStatus, string> = {
  pass: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-100 text-amber-800 ring-amber-200',
  fail: 'bg-rose-100 text-rose-800 ring-rose-200',
};

const scoreBars = {
  good: 'bg-emerald-500',
  fair: 'bg-amber-500',
  poor: 'bg-rose-500',
  none: 'bg-slate-300',
} as const;

const scoreTexts = {
  good: 'text-emerald-700',
  fair: 'text-amber-700',
  poor: 'text-rose-700',
  none: 'text-slate-500',
} as const;

export function scoreTone(score: number | null): { bar: string; text: string } {
  if (score === null) return { bar: scoreBars.none, text: scoreTexts.none };
  if (score >= 0.9) return { bar: scoreBars.good, text: scoreTexts.good };
  if (score >= 0.5) return { bar: scoreBars.fair, text: scoreTexts.fair };
  return { bar: scoreBars.poor, text: scoreTexts.poor };
}

export function percent(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : `${Math.round(score * 100)}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function formatMetric(metric: LighthouseMetric): string {
  if (metric.value === null) return 'Sin datos';
  if (metric.unit === 'unitless') return metric.value.toFixed(2).replace('.', ',');
  if (metric.value < 1000) return `${Math.round(metric.value)} ms`;
  return `${(metric.value / 1000).toFixed(1).replace('.', ',')} s`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const auditTitles: Record<string, string> = {
  'landmark-one-main': 'Falta un landmark principal (main)',
  'image-alt': 'Imágenes sin texto alternativo',
  'color-contrast': 'Contraste de color insuficiente',
  'link-text': 'Enlaces con texto poco descriptivo',
  'meta-description': 'Falta la meta description',
  'document-title': 'Falta el título del documento',
  'html-has-lang': 'Falta el atributo lang en html',
  'html-lang-valid': 'Idioma del documento no válido',
  'tap-targets': 'Objetivos táctiles demasiado pequeños',
  'network-dependency-tree-insight': 'Árbol de dependencias de red',
  'cache-insight': 'Cache poco eficiente',
  'render-blocking-resources': 'Recursos que bloquean el renderizado',
  'unused-javascript': 'JavaScript sin usar',
  'unused-css-rules': 'CSS sin usar',
  'uses-responsive-images': 'Imágenes no adaptadas al viewport',
  'font-display': 'Fuentes sin font-display',
  'third-party-summary': 'Impacto de recursos de terceros',
};

export function auditTitle(audit: LighthouseAudit): string {
  return auditTitles[audit.id] ?? audit.title;
}

export function auditCategoryLabel(audit: LighthouseAudit): string {
  switch (audit.category) {
    case 'performance':
      return 'Rendimiento';
    case 'accessibility':
      return 'Accesibilidad';
    case 'best-practices':
      return 'Buenas prácticas';
    case 'seo':
      return 'SEO';
    default:
      return audit.category;
  }
}

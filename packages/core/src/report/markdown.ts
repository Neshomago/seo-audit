import type { InspectResult } from '../pipeline.js';
import type { LighthouseAudit, LighthouseMetric } from '../perf/lighthouse.js';
import type { CheckStatus, SeoCheck, Severity } from '../seo/types.js';

export interface ReportOptions {
  generatedAt?: Date | string;
  includeEvidence?: boolean;
  maxIssues?: number;
}

const SEVERITY_ORDER: Severity[] = ['critico', 'alto', 'medio', 'bajo'];

const SEVERITY_SINGULAR: Record<Severity, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
};

const SEVERITY_PLURAL: Record<Severity, string> = {
  critico: 'Críticos',
  alto: 'Altos',
  medio: 'Medios',
  bajo: 'Bajos',
};

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'Correcto',
  warn: 'Aviso',
  fail: 'Fallo',
};

interface GroupedCheck {
  check: SeoCheck;
  urls: Set<string>;
}

function inline(value: string, max = 300): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}

function code(value: string, max = 160): string {
  return `\`${inline(value, max).replace(/`/g, "'")}\``;
}

function cell(value: string, max = 60): string {
  return inline(value, max).replace(/\|/g, '\\|');
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function scorePercent(score: number | null): string {
  return score === null ? '—' : `${Math.round(score * 100)}/100`;
}

function scoreVerdict(score: number | null): string {
  if (score === null) return 'Sin datos';
  if (score >= 0.9) return 'Bueno';
  if (score >= 0.5) return 'Mejorable';
  return 'Deficiente';
}

function formatDate(value: Date | string | undefined): string {
  const date = value === undefined ? new Date() : new Date(value);
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function groupChecks(checks: SeoCheck[]): GroupedCheck[] {
  const groups = new Map<string, GroupedCheck>();

  for (const check of checks) {
    const key = `${check.id}:${check.status}`;
    const existing = groups.get(key);
    if (existing) {
      if (check.pageUrl) existing.urls.add(check.pageUrl);
      continue;
    }
    groups.set(key, { check, urls: new Set(check.pageUrl ? [check.pageUrl] : []) });
  }

  return [...groups.values()];
}

function formatMetric(metric: LighthouseMetric): string {
  if (metric.value === null) return 'Sin datos';
  if (metric.unit === 'unitless') return metric.value.toFixed(2).replace('.', ',');
  if (metric.value < 1000) return `${Math.round(metric.value)} ms`;
  return `${(metric.value / 1000).toFixed(1).replace('.', ',')} s`;
}

function auditDetail(audit: LighthouseAudit): string {
  return inline(audit.displayValue ?? audit.description, 120);
}

function renderIssue(group: GroupedCheck, includeEvidence: boolean): string[] {
  const { check } = group;
  const lines = [
    `- **[${SEVERITY_SINGULAR[check.severity]}] ${check.title}** (${STATUS_LABEL[check.status]}) — ${inline(check.detail)}`,
  ];

  if (group.urls.size > 0) {
    const urls = [...group.urls];
    const shown = urls.slice(0, 5).map((url) => code(url, 90)).join(', ');
    const extra = urls.length > 5 ? ` y ${urls.length - 5} más` : '';
    lines.push(`  - Páginas afectadas: ${shown}${extra}`);
  }

  if (includeEvidence && check.evidence) {
    lines.push(`  - Evidencia: ${code(check.evidence)}`);
  }

  if (check.fix) {
    lines.push(`  - Cómo mejorar: ${check.fix}`);
  }

  return lines;
}

function renderLighthouseSection(result: InspectResult): string[] {
  const lighthouse = result.lighthouse;
  const lines = ['## Rendimiento y calidad (Lighthouse)', ''];

  if (!lighthouse) {
    lines.push('No se ejecutó Lighthouse en esta auditoría.');
    return lines;
  }

  if (lighthouse.error) {
    lines.push(`Lighthouse no pudo completarse: ${inline(lighthouse.error)}`);
    return lines;
  }

  lines.push(
    '| Categoría | Puntuación | Valoración |',
    '| --- | --- | --- |',
    `| Rendimiento | ${scorePercent(lighthouse.scores.performance)} | ${scoreVerdict(lighthouse.scores.performance)} |`,
    `| Accesibilidad | ${scorePercent(lighthouse.scores.accessibility)} | ${scoreVerdict(lighthouse.scores.accessibility)} |`,
    `| Buenas prácticas | ${scorePercent(lighthouse.scores.bestPractices)} | ${scoreVerdict(lighthouse.scores.bestPractices)} |`,
    `| SEO | ${scorePercent(lighthouse.scores.seo)} | ${scoreVerdict(lighthouse.scores.seo)} |`,
    '',
    '### Métricas principales',
    '',
    '| Métrica | Valor |',
    '| --- | --- |',
    ...lighthouse.metrics.map((metric) => `| ${metric.label} | ${formatMetric(metric)} |`),
  );

  const performance = lighthouse.failingAudits.filter((audit) => audit.category === 'performance');
  lines.push('', '### Oportunidades de rendimiento', '');
  if (performance.length === 0) {
    lines.push('Lighthouse no detectó oportunidades de rendimiento relevantes.');
  } else {
    lines.push('| Auditoría | Impacto | Detalle |', '| --- | --- | --- |');
    for (const audit of performance) {
      lines.push(
        `| ${cell(audit.title, 70)} | ${SEVERITY_SINGULAR[audit.severity]} | ${cell(auditDetail(audit), 90)} |`,
      );
    }
  }

  return lines;
}

function renderQualitySection(result: InspectResult): string[] {
  const lighthouse = result.lighthouse;
  const lines = ['## Accesibilidad y buenas prácticas', ''];

  if (!lighthouse || lighthouse.error) {
    lines.push('Sin datos de Lighthouse para accesibilidad y buenas prácticas.');
    return lines;
  }

  const audits = lighthouse.failingAudits.filter(
    (audit) => audit.category === 'accessibility' || audit.category === 'best-practices',
  );

  if (audits.length === 0) {
    lines.push('Lighthouse no detectó fallos de accesibilidad ni de buenas prácticas.');
    return lines;
  }

  lines.push('| Auditoría | Categoría | Impacto | Detalle |', '| --- | --- | --- | --- |');
  for (const audit of audits) {
    const category = audit.category === 'accessibility' ? 'Accesibilidad' : 'Buenas prácticas';
    lines.push(
      `| ${cell(audit.title, 60)} | ${category} | ${SEVERITY_SINGULAR[audit.severity]} | ${cell(auditDetail(audit), 80)} |`,
    );
  }

  return lines;
}

function renderPagesSection(result: InspectResult): string[] {
  const lines = [
    '## Páginas analizadas',
    '',
    '| URL | Estado | Title | H1 | Palabras | Fallos | Avisos |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const page of result.seo.pages) {
    const fails = page.checks.filter((check) => check.status === 'fail').length;
    const warns = page.checks.filter((check) => check.status === 'warn').length;
    lines.push(
      `| ${cell(page.url, 55)} | ${page.data.status ?? '—'} | ${cell(page.data.title ?? '—', 40)} | ${page.data.h1Count} | ${page.data.wordCount} | ${fails} | ${warns} |`,
    );
  }

  if (result.seo.pages.length === 0) {
    lines.push('| — | — | — | — | — | — | — |');
  }

  return lines;
}

function renderAnnex(result: InspectResult): string[] {
  const { probe, site } = result;
  const redirects =
    probe.redirectChain.length > 1
      ? probe.redirectChain.map((url) => code(url, 90)).join(' → ')
      : 'Sin redirecciones.';

  const headers = ['strict-transport-security', 'content-security-policy', 'x-content-type-options', 'referrer-policy', 'x-frame-options']
    .map((name) => {
      const present = Object.keys(probe.headers).some((key) => key.toLowerCase() === name);
      return `${name}: ${present ? 'sí' : 'no'}`;
    })
    .join(' · ');

  const heaviest = [...result.page.resources]
    .sort((a, b) => b.transferSize - a.transferSize)
    .slice(0, 5)
    .map((resource) => `  - ${Math.round(resource.transferSize / 1024)} KB — ${code(resource.name, 110)}`);

  return [
    '## Anexo técnico',
    '',
    `- **Redirecciones:** ${redirects}`,
    `- **robots.txt:** ${site.robots.found ? `accesible (${site.robots.status})` : 'no encontrado'}`,
    `- **Sitemap:** ${site.sitemap.found ? `${site.sitemap.urlsCount} URLs (${site.sitemap.status})` : 'no encontrado'}`,
    `- **Cabeceras de seguridad:** ${headers}`,
    `- **Rastreo:** ${plural(result.crawl.pages.length, 'página', 'páginas')}, ${plural(result.crawl.errors.length, 'error', 'errores')}.`,
    '- **Recursos más pesados:**',
    ...(heaviest.length > 0 ? heaviest : ['  - Sin recursos registrados.']),
  ];
}

export function renderMarkdownReport(
  result: InspectResult,
  options: ReportOptions = {},
): string {
  const includeEvidence = options.includeEvidence ?? true;
  const maxIssues = options.maxIssues ?? 40;
  const grouped = groupChecks(result.seo.checks);
  const passes = grouped.filter((group) => group.check.status === 'pass');
  const issues = grouped
    .filter((group) => group.check.status !== 'pass')
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.check.severity) - SEVERITY_ORDER.indexOf(b.check.severity) ||
        a.check.title.localeCompare(b.check.title, 'es'),
    );
  const fails = issues.filter((group) => group.check.status === 'fail');

  const lines: string[] = [
    `# Auditoría SEO — ${hostOf(result.probe.finalUrl || result.probe.url)}`,
    '',
    `**URL analizada:** ${result.probe.finalUrl || result.probe.url}  `,
    `**Fecha:** ${formatDate(options.generatedAt)}  `,
  ];

  const technologies = result.stack.technologies.map(
    (technology) => `${technology.name} (${technology.category}, confianza ${technology.confidence})`,
  );
  lines.push(
    `**Stack detectado:** ${technologies.length > 0 ? technologies.join(', ') : 'no identificado'}`,
    '',
    '## Resumen ejecutivo',
    '',
    `- Comprobaciones automáticas: ${result.seo.summary.pass + result.seo.summary.warn + result.seo.summary.fail} en total — ${plural(result.seo.summary.pass, 'correcta', 'correctas')}, ${plural(result.seo.summary.warn, 'aviso', 'avisos')} y ${plural(result.seo.summary.fail, 'fallo', 'fallos')}.`,
  );

  if (result.lighthouse && !result.lighthouse.error) {
    const { scores } = result.lighthouse;
    lines.push(
      `- Lighthouse: Rendimiento ${scorePercent(scores.performance)} · Accesibilidad ${scorePercent(scores.accessibility)} · Buenas prácticas ${scorePercent(scores.bestPractices)} · SEO ${scorePercent(scores.seo)}.`,
    );
  } else if (result.lighthouse?.error) {
    lines.push(`- Lighthouse: no se pudo completar (${inline(result.lighthouse.error)}).`);
  }

  lines.push('', '### Hallazgos prioritarios', '');
  if (fails.length === 0) {
    lines.push('No se encontraron fallos bloqueantes en las comprobaciones automáticas.');
  } else {
    fails.slice(0, 5).forEach((group, index) => {
      lines.push(
        `${index + 1}. **[${SEVERITY_SINGULAR[group.check.severity]}] ${group.check.title}** — ${inline(group.check.detail)}`,
      );
    });
  }

  lines.push(
    '',
    '## Stack tecnológico',
    '',
    ...(technologies.length > 0
      ? [
          ...result.stack.technologies.map(
            (technology) =>
              `- **${technology.name}** — ${technology.category}, confianza ${technology.confidence}. ${technology.evidence.map((item) => inline(item.detail, 90)).join('; ')}`,
          ),
          '',
          `Stack principal: ${result.stack.primaryStack.join(', ') || 'no determinado'}.`,
        ]
      : ['No se detectaron tecnologías con señales suficientes.']),
  );

  lines.push('', '## Lo que ya funciona', '');
  if (passes.length === 0) {
    lines.push('No hay comprobaciones superadas.');
  } else {
    passes.slice(0, 20).forEach((group) => {
      const pages = group.urls.size > 1 ? ` (${group.urls.size} páginas)` : '';
      lines.push(`- **${group.check.title}** — ${inline(group.check.detail)}${pages}`);
    });
    if (passes.length > 20) lines.push(`- y ${passes.length - 20} comprobaciones más.`);
  }

  lines.push('', '## Problemas encontrados', '');
  if (issues.length === 0) {
    lines.push('No se detectaron problemas en las comprobaciones automáticas.');
  } else {
    for (const severity of SEVERITY_ORDER) {
      const bucket = issues.filter((group) => group.check.severity === severity);
      if (bucket.length === 0) continue;
      lines.push(`### ${SEVERITY_PLURAL[severity]}`, '');
      for (const group of bucket.slice(0, maxIssues)) {
        lines.push(...renderIssue(group, includeEvidence));
      }
      if (bucket.length > maxIssues) lines.push(`- y ${bucket.length - maxIssues} problemas más.`);
      lines.push('');
    }
  }

  lines.push(...renderLighthouseSection(result), '');
  lines.push(...renderQualitySection(result), '');
  lines.push(...renderPagesSection(result), '');

  lines.push('## Plan de acción priorizado', '');
  if (issues.length === 0) {
    lines.push('Mantén el sitio y vuelve a auditar tras cambios importantes.');
  } else {
    issues.slice(0, 12).forEach((group, index) => {
      lines.push(
        `${index + 1}. **[${SEVERITY_SINGULAR[group.check.severity]}] ${group.check.title}** — ${group.check.fix ?? 'Revisa este punto y aplica la corrección recomendada.'}`,
      );
    });
    if (issues.length > 12) {
      lines.push(`- y ${issues.length - 12} acciones más en la sección de problemas.`);
    }
  }

  lines.push('', ...renderAnnex(result), '');

  lines.push(
    '## Limitaciones',
    '',
    '- La detección de stack es heurística y se basa en señales públicas; puede haber falsos positivos o negativos.',
    '- Lighthouse se ejecuta en local con emulación móvil y red simulada; los valores pueden variar entre ejecuciones.',
    '- Las comprobaciones automáticas no sustituyen una revisión manual de contenido, intención de búsqueda ni estrategia editorial.',
  );

  return `${lines.join('\n').trimEnd()}\n`;
}

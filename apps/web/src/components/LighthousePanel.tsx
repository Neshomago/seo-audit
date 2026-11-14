import type { AuditData } from '../api';
import {
  auditCategoryLabel,
  auditTitle,
  formatMetric,
  percent,
  scoreTone,
  severityClasses,
  severityLabel,
} from '../format';

interface LighthousePanelProps {
  lighthouse: AuditData['lighthouse'];
}

export function LighthousePanel({ lighthouse }: LighthousePanelProps) {
  if (!lighthouse) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Rendimiento y calidad</h2>
        <p className="mt-2 text-sm text-slate-600">Lighthouse no se ejecutó en esta auditoría.</p>
      </section>
    );
  }

  if (lighthouse.error) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Rendimiento y calidad</h2>
        <p className="mt-2 text-sm text-rose-700">
          Lighthouse no pudo completarse: {lighthouse.error}
        </p>
      </section>
    );
  }

  const categories = [
    { label: 'Rendimiento', score: lighthouse.scores.performance },
    { label: 'Accesibilidad', score: lighthouse.scores.accessibility },
    { label: 'Buenas prácticas', score: lighthouse.scores.bestPractices },
    { label: 'SEO', score: lighthouse.scores.seo },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Rendimiento y calidad</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          Lighthouse
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {categories.map((category) => {
          const tone = scoreTone(category.score);
          return (
            <div key={category.label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">{category.label}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone.text}`}>
                {percent(category.score)}
                <span className="text-sm text-slate-400">/100</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${tone.bar}`}
                  style={{ width: `${percent(category.score)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">Métricas</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {lighthouse.metrics.map((metric) => (
          <div key={metric.id} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-slate-500">{metric.label}</dt>
            <dd className="text-sm font-medium tabular-nums text-slate-800">{formatMetric(metric)}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">Oportunidades de mejora</h3>
      {lighthouse.failingAudits.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">Sin hallazgos relevantes.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {lighthouse.failingAudits.slice(0, 8).map((audit) => (
            <li key={audit.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${severityClasses[audit.severity]}`}
                >
                  {severityLabel[audit.severity]}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {auditCategoryLabel(audit)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800">{auditTitle(audit)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {audit.displayValue ?? audit.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

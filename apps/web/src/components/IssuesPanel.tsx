import { useState } from 'react';
import type { SeoCheck } from '@seo-audit/core';
import {
  severityClasses,
  severityLabel,
  severityOrder,
  severityPlural,
  statusClasses,
  statusLabel,
} from '../format';

type Filter = 'all' | 'fail' | 'warn';

interface IssuesPanelProps {
  checks: SeoCheck[];
}

export function IssuesPanel({ checks }: IssuesPanelProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const issues = checks.filter((check) => check.status !== 'pass');
  const failCount = issues.filter((check) => check.status === 'fail').length;
  const warnCount = issues.filter((check) => check.status === 'warn').length;

  const filtered = issues
    .filter((check) => filter === 'all' || check.status === filter)
    .sort(
      (a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) ||
        a.title.localeCompare(b.title, 'es'),
    );

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'Todos', count: issues.length },
    { key: 'fail', label: 'Fallos', count: failCount },
    { key: 'warn', label: 'Avisos', count: warnCount },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Problemas encontrados</h2>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === item.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No hay problemas para este filtro.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {severityOrder.map((severity) => {
            const bucket = filtered.filter((check) => check.severity === severity);
            if (bucket.length === 0) return null;

            return (
              <div key={severity}>
                <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {severityPlural[severity]} ({bucket.length})
                </h3>
                <div className="space-y-2">
                  {bucket.map((check, index) => (
                    <details
                      key={`${check.id}-${check.pageUrl ?? 'sitio'}-${index}`}
                      className="group rounded-xl border border-slate-200 bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                        <div className="flex shrink-0 flex-col gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusClasses[check.status]}`}
                          >
                            {statusLabel[check.status]}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${severityClasses[check.severity]}`}
                          >
                            {severityLabel[check.severity]}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-slate-900">{check.title}</h4>
                          <p className="mt-1 text-sm text-slate-600">{check.detail}</p>
                        </div>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                          className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180"
                        >
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </summary>
                      <div className="space-y-3 border-t border-slate-100 px-4 py-4 text-sm">
                        {check.pageUrl ? (
                          <p className="break-all text-slate-600">
                            Página:{' '}
                            <a
                              href={check.pageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-indigo-600 hover:text-indigo-500"
                            >
                              {check.pageUrl}
                            </a>
                          </p>
                        ) : null}
                        {check.evidence ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Evidencia
                            </p>
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                              {check.evidence}
                            </pre>
                          </div>
                        ) : null}
                        {check.fix ? (
                          <div className="rounded-lg bg-indigo-50 p-3 text-indigo-950">
                            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                              Cómo mejorar
                            </p>
                            <p className="mt-1 leading-relaxed">{check.fix}</p>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

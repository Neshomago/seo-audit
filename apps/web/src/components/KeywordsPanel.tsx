import { useMemo, useState } from 'react';
import type {
  KeywordCandidate,
  KeywordMetrics,
  KeywordProviderState,
  KeywordReport,
} from '@seo-audit/core';
import { hostOf } from '../format';
import { toNegativeKeywordsCsv, toPositiveKeywordsCsv } from '../keywords-csv';
import { filterKeywords } from '../keywords-filter';

type Tab = 'oportunidades' | 'negativas' | 'fuentes';

const providerClasses: Record<KeywordProviderState, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  'no-config': 'bg-slate-100 text-slate-600 ring-slate-200',
  'no-property': 'bg-slate-100 text-slate-600 ring-slate-200',
  error: 'bg-rose-50 text-rose-700 ring-rose-200',
  skipped: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const confidenceClasses: Record<string, string> = {
  alta: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  media: 'bg-amber-50 text-amber-700 ring-amber-200',
  baja: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function metricsLabel(metrics: KeywordMetrics | undefined): string {
  if (!metrics) return '—';
  return `${Math.round(metrics.impressions)} imp. · ${metrics.position.toFixed(1).replace('.', ',')} pos.`;
}

function downloadFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

function sourceLabel(source: string): string {
  if (source === 'gsc') return 'GSC';
  if (source === 'bing') return 'Bing';
  return 'On-page';
}

function Score({ value }: { value: number }) {
  const classes =
    value >= 70
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : value >= 40
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${classes}`}>
      {value}
    </span>
  );
}

function KeywordRow({ candidate }: { candidate: KeywordCandidate }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-3 py-3">
        <p className="font-medium text-slate-900">{candidate.keyword}</p>
        <p className="mt-0.5 text-xs text-slate-500">{candidate.cluster}</p>
      </td>
      <td className="px-3 py-3 text-sm text-slate-600">{candidate.intent}</td>
      <td className="px-3 py-3">
        <Score value={candidate.score} />
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${confidenceClasses[candidate.confidence] ?? confidenceClasses.baja}`}
        >
          {candidate.confidence}
        </span>
      </td>
      <td className="px-3 py-3 text-xs text-slate-600">
        {candidate.sources.map(sourceLabel).join(' · ')}
      </td>
      <td className="px-3 py-3 text-xs text-slate-600">{metricsLabel(candidate.gsc)}</td>
      <td className="px-3 py-3 text-xs text-slate-600">{metricsLabel(candidate.bing)}</td>
      <td className="max-w-64 px-3 py-3 text-xs text-slate-600">
        <span className="block truncate" title={candidate.recommendedPage ?? ''}>
          {candidate.recommendedPage ?? '—'}
        </span>
        {candidate.cannibalization.length > 1 ? (
          <span className="mt-1 block text-amber-700">
            Posible canibalización ({candidate.cannibalization.length} páginas)
          </span>
        ) : null}
      </td>
      <td className="px-3 py-3 text-sm text-slate-700">{candidate.action}</td>
    </tr>
  );
}

export function KeywordsPanel({ keywords, url }: { keywords: KeywordReport | null; url: string }) {
  const [tab, setTab] = useState<Tab>('oportunidades');
  const [query, setQuery] = useState('');
  const [intent, setIntent] = useState('todas');
  const [source, setSource] = useState('todas');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => (keywords ? filterKeywords(keywords, { query, intent, source }) : []),
    [intent, keywords, query, source],
  );

  if (!keywords) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Palabras clave</h2>
        <p className="mt-2 text-sm text-slate-600">
          El análisis de palabras clave está desactivado o no pudo completarse.
        </p>
      </section>
    );
  }

  const visible = showAll ? filtered : filtered.slice(0, 20);
  const baseName = `seo-audit-${hostOf(url).replace(/[^a-z0-9.-]+/gi, '-')}`;
  const intents = [...new Set(keywords.positives.map((candidate) => candidate.intent))].sort();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Palabras clave</h2>
          <p className="mt-1 text-sm text-slate-500">
            {keywords.locale} / {keywords.country}
            {keywords.period ? ` · ${keywords.period.start} a ${keywords.period.end}` : ' · solo on-page'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.providers.map((provider) => (
            <span
              key={provider.provider}
              title={provider.message}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${providerClasses[provider.status]}`}
            >
              {provider.provider.toUpperCase()}: {provider.status}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Oportunidades', String(keywords.summary.positives)],
          ['Alta confianza', String(keywords.summary.highConfidence)],
          ['Negativas', String(keywords.summary.negatives)],
          ['Fuentes externas', String(keywords.summary.externalSources)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex gap-1 rounded-xl bg-slate-100 p-1">
        {[
          ['oportunidades', 'Oportunidades'],
          ['negativas', 'Negativas'],
          ['fuentes', 'Fuentes y límites'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value as Tab)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'oportunidades' ? (
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar keyword"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:max-w-xs"
            />
            <select
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="todas">Todas las intenciones</option>
              {intents.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="todas">Todas las fuentes</option>
              <option value="on-page">On-page</option>
              <option value="gsc">GSC</option>
              <option value="bing">Bing</option>
            </select>
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `${baseName}-keywords.csv`,
                  toPositiveKeywordsCsv({ ...keywords, positives: filtered }),
                )
              }
              className="ml-auto rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Descargar CSV
            </button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[980px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Keyword</th>
                  <th className="px-3 py-2 font-medium">Intención</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Confianza</th>
                  <th className="px-3 py-2 font-medium">Fuentes</th>
                  <th className="px-3 py-2 font-medium">GSC</th>
                  <th className="px-3 py-2 font-medium">Bing</th>
                  <th className="px-3 py-2 font-medium">Página recomendada</th>
                  <th className="px-3 py-2 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((candidate) => (
                  <KeywordRow key={candidate.normalized} candidate={candidate} />
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No hay keywords que coincidan con los filtros.</p>
          ) : null}
          {filtered.length > visible.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Ver las {filtered.length} keywords
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'negativas' ? (
        <div className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Sugerencias para contenido y campañas. Revísalas antes de aplicarlas.
            </p>
            <button
              type="button"
              onClick={() =>
                downloadFile(`${baseName}-negative-keywords.csv`, toNegativeKeywordsCsv(keywords))
              }
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Descargar CSV
            </button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[620px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Negativa</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium">Confianza</th>
                  <th className="px-3 py-2 font-medium">Coincidencia</th>
                </tr>
              </thead>
              <tbody>
                {keywords.negatives.map((negative) => (
                  <tr key={negative.normalized} className="border-t border-slate-100">
                    <td className="px-3 py-3 text-sm font-medium text-slate-900">{negative.keyword}</td>
                    <td className="px-3 py-3 text-sm text-slate-600">{negative.reason}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${confidenceClasses[negative.confidence] ?? confidenceClasses.baja}`}
                      >
                        {negative.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600">{negative.matchType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {keywords.negatives.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No se detectaron negativas con las reglas actuales.</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'fuentes' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Proveedores</h3>
            <div className="mt-2 space-y-2">
              {keywords.providers.length === 0 ? (
                <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  Sin proveedores externos configurados. El análisis usa solo señales on-page.
                </p>
              ) : null}
              {keywords.providers.map((provider) => (
                <div key={provider.provider} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold uppercase text-slate-800">{provider.provider}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${providerClasses[provider.status]}`}
                    >
                      {provider.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{provider.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {provider.property ?? 'Sin propiedad'} · {provider.rows} filas
                    {provider.cached ? ' · caché' : ''}
                    {provider.truncated ? ' · truncado' : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Clusters</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {keywords.clusters.map((cluster) => (
                <span
                  key={cluster.label}
                  className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  title={cluster.keywords.join(', ')}
                >
                  {cluster.label}{' '}
                  <span className="text-xs text-slate-500">({cluster.keywords.length})</span>
                </span>
              ))}
              {keywords.clusters.length === 0 ? (
                <p className="text-sm text-slate-600">Sin clusters suficientes.</p>
              ) : null}
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-900">Limitaciones</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {keywords.limitations.map((limitation) => (
                <li key={limitation}>- {limitation}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}

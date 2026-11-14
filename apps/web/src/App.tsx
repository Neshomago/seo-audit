import { useState } from 'react';
import type { AuditData, AuditRequest } from './api';
import { runAudit } from './api';
import { formatDate, hostOf } from './format';
import { AuditForm } from './components/AuditForm';
import { Summary } from './components/Summary';
import { LighthousePanel } from './components/LighthousePanel';
import { IssuesPanel } from './components/IssuesPanel';
import { PagesTable } from './components/PagesTable';

interface AuditResult {
  data: AuditData;
  markdown: string;
}

export function App() {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAudit = async (request: AuditRequest): Promise<void> => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      setResult(await runAudit(request));
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const downloadMarkdown = (): void => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `seo-audit-${hostOf(result.data.url)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  };

  const copyMarkdown = async (): Promise<void> => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const data = result?.data ?? null;
  const passed = data ? data.seo.checks.filter((check) => check.status === 'pass') : [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
              SEO
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">SEO Audit</h1>
              <p className="text-xs text-slate-500">
                Crawl, Lighthouse e informe accionable en local
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Local · sin servicios externos
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <AuditForm loading={loading} onSubmit={handleAudit} />

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-slate-700">
              Analizando el sitio con Chrome local. Puede tardar entre 10 y 60 segundos.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-sm font-medium text-rose-800">No se pudo completar la auditoría</p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>
        ) : null}

        {!data && !loading && !error ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Cómo funciona</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                ['Introduce la URL', 'Se audita la home y hasta 30 páginas internas del mismo dominio.'],
                ['Rastreamos y medimos', 'Chrome renderiza cada página; Lighthouse mide rendimiento y calidad.'],
                ['Descarga el informe', 'Obtén un Markdown con lo que funciona, los problemas y cómo mejorarlos.'],
              ].map(([title, description], index) => (
                <li key={title} className="rounded-xl bg-slate-50 p-4">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
                  <p className="mt-1 text-sm text-slate-600">{description}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-500">
              Protección SSRF activa: los hosts privados y localhost están bloqueados salvo que lo
              habilites en opciones avanzadas.
            </p>
          </section>
        ) : null}

        {data ? (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Resultado
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900" title={data.url}>
                  {data.url}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(data.generatedAt)} · {data.crawl.pages.length}{' '}
                  {data.crawl.pages.length === 1 ? 'página' : 'páginas'} ·{' '}
                  {(data.crawl.elapsedMs / 1000).toFixed(1).replace('.', ',')} s de rastreo
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void copyMarkdown()}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {copied ? 'Copiado' : 'Copiar Markdown'}
                </button>
                <button
                  type="button"
                  onClick={downloadMarkdown}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
                >
                  Descargar .md
                </button>
              </div>
            </section>

            <Summary data={data} />

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <LighthousePanel lighthouse={data.lighthouse} />
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">Stack detectado</h2>
                {data.stack.technologies.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    No se detectaron tecnologías con señales suficientes.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {data.stack.technologies.map((technology) => (
                      <li
                        key={technology.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                        title={technology.evidence
                          .map((evidence) => evidence.detail)
                          .join(' · ')}
                      >
                        <p className="text-sm font-medium text-slate-800">{technology.name}</p>
                        <p className="text-xs text-slate-500">
                          {technology.category} · confianza {technology.confidence}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  {data.stack.notes[0] ??
                    'La detección se basa en señales públicas del sitio y puede contener falsos positivos.'}
                </p>
              </section>
            </div>

            <IssuesPanel checks={data.seo.checks} />

            <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <h2 className="font-semibold text-slate-900">
                  Lo que ya funciona ({passed.length})
                </h2>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180"
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {passed.map((check, index) => (
                  <li
                    key={`${check.id}-${check.pageUrl ?? 'sitio'}-${index}`}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-emerald-900">{check.title}</p>
                    <p className="text-xs text-emerald-800">{check.detail}</p>
                  </li>
                ))}
              </ul>
            </details>

            <PagesTable pages={data.seo.pages} />
          </>
        ) : null}

        <footer className="pb-4 text-center text-xs text-slate-500">
          Auditoría local con tu propia instalación de Chrome. No se envían datos a terceros.
        </footer>
      </main>
    </div>
  );
}

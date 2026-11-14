import type { AuditData } from '../api';

interface PagesTableProps {
  pages: AuditData['seo']['pages'];
}

function statusClasses(status: number | null): string {
  if (status === null) return 'bg-slate-100 text-slate-700';
  if (status >= 200 && status < 300) return 'bg-emerald-100 text-emerald-800';
  if (status >= 300 && status < 400) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

export function PagesTable({ pages }: PagesTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">Páginas analizadas</h2>
      {pages.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No se rastreó ninguna página.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 text-center font-medium">H1</th>
                <th className="px-3 py-2 text-right font-medium">Palabras</th>
                <th className="px-3 py-2 text-right font-medium">Fallos</th>
                <th className="px-3 py-2 text-right font-medium">Avisos</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const fails = page.checks.filter((check) => check.status === 'fail').length;
                const warns = page.checks.filter((check) => check.status === 'warn').length;
                return (
                  <tr key={page.url} className="border-b border-slate-100 last:border-0">
                    <td className="max-w-[280px] py-3 pr-4">
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium text-indigo-600 hover:text-indigo-500"
                        title={page.url}
                      >
                        {page.url}
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(page.data.status)}`}
                      >
                        {page.data.status ?? '—'}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <span className="block truncate text-slate-700" title={page.data.title ?? ''}>
                        {page.data.title ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-slate-700">
                      {page.data.h1Count}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {page.data.wordCount}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-rose-600">
                      {fails}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-amber-600">
                      {warns}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

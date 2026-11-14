import { useState, type FormEvent } from 'react';
import type { AuditRequest } from '../api';

interface AuditFormProps {
  loading: boolean;
  onSubmit: (request: AuditRequest) => void;
}

export function AuditForm({ loading, onSubmit }: AuditFormProps) {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(10);
  const [lighthouse, setLighthouse] = useState(true);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [keywords, setKeywords] = useState(true);
  const [keywordLocale, setKeywordLocale] = useState('es-ES');
  const [negativeTerms, setNegativeTerms] = useState('');
  const [advanced, setAdvanced] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = url.trim();
    if (!target) return;
    onSubmit({
      url: target,
      maxPages,
      lighthouse,
      allowPrivate,
      keywords,
      keywordLocale,
      negativeTerms: negativeTerms
        .split(/[\n,]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <label htmlFor="url" className="text-sm font-medium text-slate-700">
        URL del sitio
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="url"
          name="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://ejemplo.com"
          autoComplete="url"
          spellCheck={false}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
        />
        <button
          type="submit"
          disabled={loading || url.trim().length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {loading ? 'Auditando…' : 'Auditar'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          Páginas internas
          <input
            type="number"
            min={1}
            max={30}
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value))}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={lighthouse}
            onChange={(event) => setLighthouse(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Medir con Lighthouse
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={keywords}
            onChange={(event) => setKeywords(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Analizar keywords
        </label>
        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          {advanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
        </button>
      </div>

      {advanced ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allowPrivate}
              onChange={(event) => setAllowPrivate(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              Permitir hosts privados y localhost.
              <span className="block text-xs text-slate-500">
                Solo para desarrollo local: desactiva la protección SSRF del auditor.
              </span>
            </span>
          </label>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              Idioma de keywords
              <select
                value={keywordLocale}
                onChange={(event) => setKeywordLocale(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="es-ES">Español (España)</option>
                <option value="en-US">Inglés (EE. UU.)</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Negativas manuales
              <textarea
                value={negativeTerms}
                onChange={(event) => setNegativeTerms(event.target.value)}
                rows={2}
                placeholder="empleo, gratis"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Se analiza la home y hasta {maxPages} páginas internas renderizadas con tu Chrome local.
        El informe incluye SEO on-page, técnico, accesibilidad, rendimiento y palabras clave.
        GSC y Bing solo se consultan si el dominio está verificado.
      </p>
    </form>
  );
}

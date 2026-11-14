import type { AuditData } from '../api';
import { percent, scoreTone } from '../format';

interface SummaryProps {
  data: AuditData;
}

export function Summary({ data }: SummaryProps) {
  const { pass, warn, fail } = data.seo.summary;
  const performance = data.lighthouse?.scores.performance ?? null;
  const tone = scoreTone(performance);

  const cards = [
    { label: 'Fallos', value: String(fail), classes: fail > 0 ? 'text-rose-600' : 'text-slate-900' },
    {
      label: 'Avisos',
      value: String(warn),
      classes: warn > 0 ? 'text-amber-600' : 'text-slate-900',
    },
    { label: 'Comprobaciones correctas', value: String(pass), classes: 'text-emerald-600' },
    { label: 'Rendimiento', value: percent(performance), classes: tone.text },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className={`mt-2 text-3xl font-semibold tabular-nums ${card.classes}`}>
            {card.value}
            {card.label === 'Rendimiento' ? <span className="text-lg text-slate-400">/100</span> : null}
          </p>
        </div>
      ))}
      <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
        <p className="text-sm text-slate-700">
          {fail > 0
            ? `Hay ${fail} ${fail === 1 ? 'fallo' : 'fallos'} que requieren atención prioritaria.`
            : warn > 0
              ? `Sin fallos bloqueantes, pero quedan ${warn} ${warn === 1 ? 'aviso' : 'avisos'} por revisar.`
              : 'Todas las comprobaciones automáticas han pasado correctamente.'}
        </p>
      </div>
    </section>
  );
}

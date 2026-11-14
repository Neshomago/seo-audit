import { describe, expect, it } from 'vitest';
import { parseArgs, reportFileName, resolveReportPath, UsageError } from './args.js';

describe('parseArgs', () => {
  it('aplica valores por defecto', () => {
    const options = parseArgs(['https://example.com']);
    expect(options).toEqual({
      url: 'https://example.com',
      maxPages: 10,
      lighthouse: true,
      allowPrivate: false,
      json: false,
      help: false,
    });
  });

  it('lee flags con valor separado y con =', () => {
    const options = parseArgs([
      'https://example.com',
      '--max-pages',
      '5',
      '--out=informes',
      '--timeout=30000',
      '--no-lighthouse',
      '--allow-private',
      '--json',
    ]);

    expect(options.maxPages).toBe(5);
    expect(options.output).toBe('informes');
    expect(options.timeoutMs).toBe(30000);
    expect(options.lighthouse).toBe(false);
    expect(options.allowPrivate).toBe(true);
    expect(options.json).toBe(true);
  });

  it('rechaza URL ausente, opciones desconocidas y valores inválidos', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--desconocida'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--max-pages', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--out'])).toThrow(UsageError);
    expect(() => parseArgs(['https://a.com', 'https://b.com'])).toThrow(UsageError);
  });
});

describe('reportFileName', () => {
  it('genera un nombre estable y seguro por host y fecha', () => {
    expect(reportFileName('https://www.Example.com/ruta', new Date('2026-11-13T12:00:00Z'))).toBe(
      'seo-audit-www.example.com-2026-11-13.md',
    );
  });
});

describe('resolveReportPath', () => {
  it('usa reports/ por defecto y acepta carpeta o archivo', () => {
    const file = 'seo-audit-example.com-2026-11-13.md';
    expect(resolveReportPath(undefined, file)).toBe(`reports/${file}`);
    expect(resolveReportPath('informes', file)).toBe(`informes/${file}`);
    expect(resolveReportPath('informes/', file)).toBe(`informes/${file}`);
    expect(resolveReportPath('mi-informe.md', file)).toBe('mi-informe.md');
  });
});

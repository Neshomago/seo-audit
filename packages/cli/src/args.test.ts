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
      keywords: true,
      refreshKeywords: false,
      csv: false,
      negativeTerms: [],
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
      '--no-keywords',
      '--locale=en-US',
      '--country=us',
      '--refresh-keywords',
      '--csv',
      '--negative',
      'curso gratis',
      '--negative=empleo',
    ]);

    expect(options.maxPages).toBe(5);
    expect(options.output).toBe('informes');
    expect(options.timeoutMs).toBe(30000);
    expect(options.lighthouse).toBe(false);
    expect(options.allowPrivate).toBe(true);
    expect(options.json).toBe(true);
    expect(options.keywords).toBe(false);
    expect(options.locale).toBe('en-US');
    expect(options.country).toBe('US');
    expect(options.refreshKeywords).toBe(true);
    expect(options.csv).toBe(true);
    expect(options.negativeTerms).toEqual(['curso gratis', 'empleo']);
  });

  it('rechaza URL ausente, opciones desconocidas y valores inválidos', () => {
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--desconocida'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--max-pages', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--out'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--locale'])).toThrow(UsageError);
    expect(() => parseArgs(['https://example.com', '--negative'])).toThrow(UsageError);
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

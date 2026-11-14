import { describe, expect, it } from 'vitest';
import { MAX_NEGATIVE_TERMS, parseAuditPayload } from './audit-request.js';

describe('parseAuditPayload', () => {
  it('aplica valores por defecto a un cuerpo inválido', () => {
    const payload = parseAuditPayload(null);

    expect(payload).toEqual({
      url: '',
      maxPages: 10,
      lighthouse: true,
      allowPrivate: false,
      keywords: true,
      keywordLocale: 'es-ES',
      negativeTerms: [],
    });
  });

  it('normaliza URL, límites y booleanos', () => {
    const payload = parseAuditPayload({
      url: '  https://example.com  ',
      maxPages: 99,
      lighthouse: false,
      allowPrivate: true,
      keywords: false,
      keywordLocale: 'en-US',
    });

    expect(payload.url).toBe('https://example.com');
    expect(payload.maxPages).toBe(30);
    expect(payload.lighthouse).toBe(false);
    expect(payload.allowPrivate).toBe(true);
    expect(payload.keywords).toBe(false);
    expect(payload.keywordLocale).toBe('en-US');
  });

  it('limita maxPages por abajo y usa el fallback si no es numérico', () => {
    expect(parseAuditPayload({ maxPages: 0 }).maxPages).toBe(1);
    expect(parseAuditPayload({ maxPages: '20' }).maxPages).toBe(10);
  });

  it('rechaza locales desconocidos', () => {
    expect(parseAuditPayload({ keywordLocale: 'fr-FR' }).keywordLocale).toBe('es-ES');
  });

  it('normaliza negativas y descarta valores no válidos', () => {
    const payload = parseAuditPayload({
      negativeTerms: ['  curso   gratis  ', '', 42, ' empleo '],
    });

    expect(payload.negativeTerms).toEqual(['curso gratis', 'empleo']);
  });

  it('trunca negativas largas y limita la cantidad', () => {
    const terms = Array.from({ length: MAX_NEGATIVE_TERMS + 10 }, (_, index) => `termino-${index}`);
    const payload = parseAuditPayload({
      negativeTerms: [...terms, 'x'.repeat(120)],
    });

    expect(payload.negativeTerms).toHaveLength(MAX_NEGATIVE_TERMS);
    expect(parseAuditPayload({ negativeTerms: ['x'.repeat(120)] }).negativeTerms[0]).toHaveLength(
      80,
    );
  });
});

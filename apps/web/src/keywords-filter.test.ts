import { describe, expect, it } from 'vitest';
import { filterKeywords } from './keywords-filter.js';
import { makeKeywordReport } from './test/keywords-fixture.js';

const report = makeKeywordReport();

describe('filterKeywords', () => {
  it('devuelve todas las positivas sin filtros', () => {
    expect(filterKeywords(report, { query: '', intent: 'todas', source: 'todas' })).toHaveLength(
      3,
    );
  });

  it('busca por keyword normalizada sin exigir acentos', () => {
    const result = filterKeywords(report, {
      query: 'auditoria',
      intent: 'todas',
      source: 'todas',
    });

    expect(result.map((candidate) => candidate.keyword)).toEqual(['auditoría seo']);
  });

  it('filtra por intención y fuente', () => {
    const result = filterKeywords(report, {
      query: '',
      intent: 'comercial',
      source: 'gsc',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.keyword).toBe('comprar seo');
  });

  it('devuelve vacío cuando no hay coincidencias', () => {
    expect(
      filterKeywords(report, { query: 'no existe', intent: 'todas', source: 'todas' }),
    ).toEqual([]);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KeywordsPanel } from './KeywordsPanel.js';
import { makeKeywordReport } from '../test/keywords-fixture.js';

describe('KeywordsPanel', () => {
  it('muestra oportunidades, proveedores y acciones', () => {
    const html = renderToStaticMarkup(
      <KeywordsPanel keywords={makeKeywordReport()} url="https://example.com" />,
    );

    expect(html).toContain('Palabras clave');
    expect(html).toContain('auditoría seo');
    expect(html).toContain('GSC: no-property');
    expect(html).toContain('Descargar CSV');
    expect(html).toContain('Posible canibalización');
  });

  it('explica cuando el análisis está desactivado', () => {
    const html = renderToStaticMarkup(
      <KeywordsPanel keywords={null} url="https://example.com" />,
    );

    expect(html).toContain('desactivado o no pudo completarse');
  });
});

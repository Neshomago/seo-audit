import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuditForm } from './AuditForm.js';

describe('AuditForm', () => {
  it('muestra las opciones de keywords y la nota de proveedores', () => {
    const html = renderToStaticMarkup(<AuditForm loading={false} onSubmit={() => undefined} />);

    expect(html).toContain('Analizar keywords');
    expect(html).toContain('Opciones avanzadas');
    expect(html).toContain('GSC y Bing solo se consultan si el dominio está verificado');
  });

  it('deshabilita el botón mientras se audita', () => {
    const html = renderToStaticMarkup(<AuditForm loading onSubmit={() => undefined} />);

    expect(html).toContain('Auditando');
    expect(html).toContain('disabled');
  });
});

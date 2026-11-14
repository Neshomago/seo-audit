import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAudit, type AuditRequest } from './api.js';

const request: AuditRequest = {
  url: 'https://example.com',
  maxPages: 10,
  lighthouse: true,
  allowPrivate: false,
  keywords: true,
  keywordLocale: 'es-ES',
  negativeTerms: ['empleo'],
};

function response(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAudit', () => {
  it('envía la petición y devuelve la respuesta', async () => {
    const fetchMock = vi.fn(async () => response({ data: {}, markdown: '# Informe' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runAudit(request)).resolves.toEqual({ data: {}, markdown: '# Informe' });
    expect(fetchMock).toHaveBeenCalledWith('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  });

  it('usa el mensaje de error del servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'URL insegura' }, false, 400)));

    await expect(runAudit(request)).rejects.toThrow('URL insegura');
  });

  it('genera un mensaje genérico si la respuesta no es JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('no json');
        },
      })),
    );

    await expect(runAudit(request)).rejects.toThrow('La auditoría falló (500).');
  });
});

import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { UnsafeUrlError } from '@seo-audit/core';
import { handleAudit, type AuditApiDeps } from './audit-api.js';

function makeRequest(body: string, method = 'POST'): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]);
  return Object.assign(stream, { method, url: '/api/audit' }) as unknown as IncomingMessage;
}

function makeResponse() {
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string | number | readonly string[]>,
    body: '',
  };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      state.headers[name] = value;
    },
    end(chunk?: unknown) {
      state.body = chunk === undefined ? '' : String(chunk);
    },
  };
  return { res: res as unknown as ServerResponse, state };
}

function json(body: string): unknown {
  return JSON.parse(body) as unknown;
}

function inspectThatThrows(error: Error): NonNullable<AuditApiDeps['inspect']> {
  return vi.fn(async () => {
    throw error;
  }) as unknown as NonNullable<AuditApiDeps['inspect']>;
}

describe('handleAudit', () => {
  it('rechaza métodos distintos de POST', async () => {
    const { res, state } = makeResponse();
    const inspect = vi.fn() as unknown as NonNullable<AuditApiDeps['inspect']>;

    await handleAudit(makeRequest('', 'GET'), res, { inspect });

    expect(state.statusCode).toBe(405);
    expect(json(state.body)).toEqual({ error: 'Método no permitido.' });
    expect(inspect).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo sin URL', async () => {
    const { res, state } = makeResponse();

    await handleAudit(makeRequest(JSON.stringify({ maxPages: 5 })), res);

    expect(state.statusCode).toBe(400);
    expect(json(state.body)).toEqual({ error: 'Falta la URL a auditar.' });
  });

  it('rechaza JSON inválido con 400', async () => {
    const { res, state } = makeResponse();

    await handleAudit(makeRequest('{nope'), res);

    expect(state.statusCode).toBe(400);
    expect(json(state.body)).toEqual({ error: 'El cuerpo debe ser JSON válido.' });
  });

  it('rechaza cuerpos mayores de 16 KiB con 413', async () => {
    const { res, state } = makeResponse();
    const inspect = vi.fn() as unknown as NonNullable<AuditApiDeps['inspect']>;

    await handleAudit(makeRequest(JSON.stringify({ url: 'https://example.com', x: 'x'.repeat(17_000) })), res, {
      inspect,
    });

    expect(state.statusCode).toBe(413);
    expect(json(state.body)).toEqual({ error: 'La petición es demasiado grande.' });
    expect(inspect).not.toHaveBeenCalled();
  });

  it('pasa opciones normalizadas al motor', async () => {
    const { res, state } = makeResponse();
    const inspect = inspectThatThrows(new Error('stop'));

    await handleAudit(
      makeRequest(
        JSON.stringify({
          url: ' https://example.com ',
          maxPages: 99,
          lighthouse: false,
          allowPrivate: true,
          keywords: true,
          keywordLocale: 'en-US',
          negativeTerms: ['  curso   gratis  ', 'empleo'],
        }),
      ),
      res,
      { inspect },
    );

    expect(inspect).toHaveBeenCalledWith('https://example.com', {
      maxPages: 30,
      lighthouse: false,
      allowPrivateHosts: true,
      keywords: {
        locale: 'en-US',
        negativeTerms: ['curso gratis', 'empleo'],
      },
    });
    expect(state.statusCode).toBe(500);
    expect(json(state.body)).toEqual({ error: 'stop' });
  });

  it('desactiva keywords cuando el cliente lo pide', async () => {
    const { res } = makeResponse();
    const inspect = inspectThatThrows(new Error('stop'));

    await handleAudit(
      makeRequest(JSON.stringify({ url: 'https://example.com', keywords: false })),
      res,
      { inspect },
    );

    expect(inspect).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ keywords: false }),
    );
  });

  it('mapea UnsafeUrlError a 400', async () => {
    const { res, state } = makeResponse();
    const inspect = inspectThatThrows(new UnsafeUrlError('Host privado bloqueado.'));

    await handleAudit(makeRequest(JSON.stringify({ url: 'http://localhost' })), res, { inspect });

    expect(state.statusCode).toBe(400);
    expect(json(state.body)).toEqual({ error: 'Host privado bloqueado.' });
  });

  it('mapea errores inesperados a 500', async () => {
    const { res, state } = makeResponse();
    const inspect = inspectThatThrows(new Error('fallo interno'));

    await handleAudit(makeRequest(JSON.stringify({ url: 'https://example.com' })), res, { inspect });

    expect(state.statusCode).toBe(500);
    expect(json(state.body)).toEqual({ error: 'fallo interno' });
  });
});

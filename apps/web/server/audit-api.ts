import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  inspectSite,
  renderMarkdownReport,
  toAuditData,
  UnsafeUrlError,
} from '../../../packages/core/src/index.js';
import { parseAuditPayload } from './audit-request.js';

const MAX_BODY_BYTES = 16_384;

class BodyTooLargeError extends Error {
  constructor() {
    super('La petición es demasiado grande.');
    this.name = 'BodyTooLargeError';
  }
}

export interface AuditApiDeps {
  inspect?: typeof inspectSite;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function statusForError(error: unknown): number {
  if (error instanceof BodyTooLargeError) return 413;
  if (error instanceof UnsafeUrlError || error instanceof SyntaxError) return 400;
  return 500;
}

export async function handleAudit(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AuditApiDeps = {},
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Método no permitido.' });
    return;
  }

  try {
    const payload = parseAuditPayload(JSON.parse(await readBody(req)));
    if (!payload.url) {
      sendJson(res, 400, { error: 'Falta la URL a auditar.' });
      return;
    }

    const inspect = deps.inspect ?? inspectSite;
    const result = await inspect(payload.url, {
      maxPages: payload.maxPages,
      lighthouse: payload.lighthouse,
      allowPrivateHosts: payload.allowPrivate,
      keywords: payload.keywords
        ? {
            locale: payload.keywordLocale,
            negativeTerms: payload.negativeTerms,
          }
        : false,
    });

    sendJson(res, 200, {
      data: toAuditData(result),
      markdown: renderMarkdownReport(result),
    });
  } catch (error) {
    const status = statusForError(error);
    const message =
      error instanceof SyntaxError ? 'El cuerpo debe ser JSON válido.' : messageOf(error);
    sendJson(res, status, { error: message });
  }
}

function middleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!req.url?.startsWith('/api/audit')) {
    next();
    return;
  }
  void handleAudit(req, res);
}

export function auditApi(): Plugin {
  return {
    name: 'seo-audit-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

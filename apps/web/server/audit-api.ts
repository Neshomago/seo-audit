import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  inspectSite,
  renderMarkdownReport,
  toAuditData,
  UnsafeUrlError,
} from '../../../packages/core/src/index.js';

const MAX_BODY_BYTES = 16_384;

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
        reject(new Error('La petición es demasiado grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

async function handleAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Método no permitido.' });
    return;
  }

  try {
    const payload = JSON.parse(await readBody(req)) as Record<string, unknown>;
    const url = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!url) {
      sendJson(res, 400, { error: 'Falta la URL a auditar.' });
      return;
    }

    const result = await inspectSite(url, {
      maxPages: clampInt(payload.maxPages, 10, 1, 30),
      lighthouse: payload.lighthouse !== false,
      allowPrivateHosts: payload.allowPrivate === true,
    });

    sendJson(res, 200, {
      data: toAuditData(result),
      markdown: renderMarkdownReport(result),
    });
  } catch (error) {
    const status = error instanceof UnsafeUrlError ? 400 : 500;
    sendJson(res, status, { error: messageOf(error) });
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

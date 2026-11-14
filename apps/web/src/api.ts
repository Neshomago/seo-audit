import type { AuditData } from '@seo-audit/core';

export type { AuditData };

export interface AuditRequest {
  url: string;
  maxPages: number;
  lighthouse: boolean;
  allowPrivate: boolean;
}

export interface AuditResponse {
  data: AuditData;
  markdown: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function runAudit(request: AuditRequest): Promise<AuditResponse> {
  const response = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `La auditoría falló (${response.status}).`;
    throw new Error(message);
  }

  return payload as AuditResponse;
}

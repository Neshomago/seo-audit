import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface UrlGuardOptions {
  allowPrivateHosts?: boolean;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function normalizeUrl(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new UnsafeUrlError('La URL está vacía.');

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw);
  const candidate = hasScheme ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new UnsafeUrlError(`URL inválida: ${input}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Protocolo no permitido (${url.protocol}). Solo http/https.`);
  }
  if (!url.hostname) throw new UnsafeUrlError('La URL no tiene host.');

  url.hash = '';
  return url;
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function rangeContains(start: string, prefix: number, value: number): boolean {
  const startValue = ipv4ToNumber(start);
  if (startValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((value & mask) >>> 0) === ((startValue & mask) >>> 0);
}

export function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  if (value === null) return true;
  return BLOCKED_IPV4_RANGES.some(([start, prefix]) => rangeContains(start, prefix, value));
}

export function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/%.+$/, '');
  if (normalized === '::' || normalized === '::1') return true;

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isBlockedIpv4(mapped);
  }

  const firstGroup = normalized.split(':')[0] ?? '';
  if (firstGroup.length >= 2) {
    const firstByte = Number.parseInt(firstGroup.slice(0, 2), 16);
    if ((firstByte & 0xfe) === 0xfc) return true;
    if (firstByte === 0xfe) {
      const secondByte = Number.parseInt(firstGroup.slice(2, 4) || '0', 16);
      if ((secondByte & 0xc0) === 0x80) return true;
    }
    if (firstByte === 0xff) return true;
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;

  const version = isIP(normalized);
  if (version === 4) return isBlockedIpv4(normalized);
  if (version === 6) return isBlockedIpv6(normalized);
  return false;
}

export async function assertSafeUrl(url: URL, options: UrlGuardOptions = {}): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Solo se permiten URLs http/https.');
  }
  if (options.allowPrivateHosts) return;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError(`Host bloqueado por seguridad (SSRF): ${hostname}`);
  }
  if (isIP(hostname)) return;

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    for (const { address } of addresses) {
      if (isBlockedHostname(address)) {
        throw new UnsafeUrlError(
          `El dominio ${hostname} resuelve a una IP bloqueada (${address}).`,
        );
      }
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    return;
  }
}

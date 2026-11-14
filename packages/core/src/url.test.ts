import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isBlockedHostname, normalizeUrl, UnsafeUrlError } from './url.js';

describe('normalizeUrl', () => {
  it('agrega https cuando falta el esquema', () => {
    expect(normalizeUrl('example.com/blog').toString()).toBe('https://example.com/blog');
  });

  it('elimina el hash de la URL', () => {
    expect(normalizeUrl('https://example.com/#seccion').toString()).toBe('https://example.com/');
  });

  it('rechaza protocolos que no sean http/https', () => {
    expect(() => normalizeUrl('ftp://example.com')).toThrow(UnsafeUrlError);
    expect(() => normalizeUrl('file:///C:/Windows')).toThrow(UnsafeUrlError);
  });

  it('rechaza URLs vacías', () => {
    expect(() => normalizeUrl('   ')).toThrow(UnsafeUrlError);
  });
});

describe('isBlockedHostname', () => {
  it.each([
    'localhost',
    'foo.localhost',
    'app.local',
    'metadata.google.internal',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '[::1]',
    '::1',
    '[fc00::1]',
    '[fd12:3456::1]',
    '[fe80::1]',
    '::ffff:127.0.0.1',
  ])('bloquea %s', (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(true);
  });

  it.each([
    'example.com',
    'sub.example.org',
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '2606:4700:4700::1111',
  ])('permite %s', (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  it('rechaza IPs privadas literales', async () => {
    await expect(assertSafeUrl(new URL('http://10.0.0.5'))).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl(new URL('http://169.254.169.254'))).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it('rechaza localhost sin hacer DNS', async () => {
    await expect(assertSafeUrl(new URL('http://localhost:3000'))).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it('permite hosts privados si se habilita explícitamente', async () => {
    await expect(
      assertSafeUrl(new URL('http://127.0.0.1:5173'), { allowPrivateHosts: true }),
    ).resolves.toBeUndefined();
  });
});

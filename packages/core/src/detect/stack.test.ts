import { describe, expect, it } from 'vitest';
import { detectStack, type DetectedTechnology, type StackReport } from './stack.js';

function find(report: StackReport, id: string): DetectedTechnology | undefined {
  return report.technologies.find((technology) => technology.id === id);
}

describe('detectStack', () => {
  it('detecta WordPress y PHP con evidencia suficiente', () => {
    const report = detectStack({
      headers: { 'X-Powered-By': 'PHP/8.2.1' },
      html: `
        <html>
          <head>
            <meta name="generator" content="WordPress 6.5.2">
            <link rel="stylesheet" href="https://example.com/wp-content/themes/demo/style.css">
          </head>
          <body></body>
        </html>`,
    });

    expect(find(report, 'wordpress')?.confidence).toBe('alta');
    expect(find(report, 'php')?.confidence).toBe('alta');
  });

  it('detecta Joomla por meta generator y rutas del sistema', () => {
    const report = detectStack({
      headers: {},
      html: `
        <html>
          <head><meta name="generator" content="Joomla! 5.1"></head>
          <body><script src="/media/system/js/core.min.js"></script></body>
        </html>`,
    });

    expect(find(report, 'joomla')?.confidence).toBe('alta');
  });

  it('detecta Next.js, Vercel y deriva React sin inferir MERN', () => {
    const report = detectStack({
      headers: { 'x-vercel-id': 'iad1::abc123' },
      html: `<html><body><div id="__next"></div><script src="/_next/static/chunks/main-app.js"></script></body></html>`,
      dom: { nextData: true, hasNextRoot: true },
    });

    expect(find(report, 'next')?.confidence).toBe('alta');
    expect(find(report, 'vercel')?.confidence).toBe('alta');
    expect(find(report, 'react')?.confidence).toBe('alta');
    expect(find(report, 'mern')).toBeUndefined();
  });

  it('infiere MERN con React + Express', () => {
    const report = detectStack({
      headers: { 'x-powered-by': 'Express' },
      html: `
        <html>
          <body>
            <div id="root" data-reactroot=""></div>
            <script src="/static/js/main.abc123.js"></script>
          </body>
        </html>`,
      dom: { react: true, hasRoot: true },
    });

    expect(find(report, 'react')).toBeDefined();
    expect(find(report, 'express')?.confidence).toBe('alta');
    expect(find(report, 'mern')?.confidence).toBe('media');
    expect(report.notes.join(' ')).toMatch(/MongoDB/);
  });

  it('infiere MEAN con Angular + Express', () => {
    const report = detectStack({
      headers: { 'x-powered-by': 'Express' },
      html: `<html><body><app-root ng-version="17.3.0"></app-root></body></html>`,
      dom: { angular: true, ngVersion: '17.3.0' },
    });

    expect(find(report, 'angular')?.confidence).toBe('alta');
    expect(find(report, 'mean')?.confidence).toBe('media');
  });

  it('detecta Shopify por headers y CDN', () => {
    const report = detectStack({
      headers: { 'x-shopify-stage': 'production' },
      html: `<html><head><script src="https://cdn.shopify.com/s/files/theme.js"></script></head></html>`,
    });

    expect(find(report, 'shopify')?.confidence).toBe('alta');
  });

  it('no reporta tecnologías en HTML plano', () => {
    const report = detectStack({
      headers: {},
      html: `<html><head><title>Hola</title></head><body><h1>Hola</h1><p>Texto normal.</p></body></html>`,
    });

    expect(report.technologies).toEqual([]);
  });

  it('no confunde menciones de texto con tecnologías reales', () => {
    const report = detectStack({
      headers: {},
      html: `<html><body><p>Somos expertos en WordPress y Joomla. También usamos Next.js.</p></body></html>`,
    });

    expect(find(report, 'wordpress')).toBeUndefined();
    expect(find(report, 'joomla')).toBeUndefined();
    expect(find(report, 'next')).toBeUndefined();
  });
});

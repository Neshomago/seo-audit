import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  kill: vi.fn(),
  lighthouse: vi.fn(),
}));

vi.mock('chrome-launcher', () => ({ launch: mocks.launch }));
vi.mock('lighthouse', () => ({ default: mocks.lighthouse }));

import {
  runLighthouse,
  summarizeLighthouse,
  type LighthouseReportLike,
} from './lighthouse.js';

const REPORT: LighthouseReportLike = {
  requestedUrl: 'https://example.com/',
  finalUrl: 'https://example.com/',
  categories: {
    performance: {
      score: 0.72,
      auditRefs: [
        { id: 'largest-contentful-paint', weight: 25 },
        { id: 'total-blocking-time', weight: 30 },
        { id: 'unused-css', weight: 0 },
      ],
    },
    accessibility: {
      score: 0.9,
      auditRefs: [
        { id: 'image-alt', weight: 10 },
        { id: 'color-contrast', weight: 7 },
      ],
    },
    'best-practices': { score: 1, auditRefs: [{ id: 'is-on-https', weight: 1 }] },
    seo: { score: 0.8, auditRefs: [{ id: 'meta-description', weight: 1 }] },
  },
  audits: {
    'largest-contentful-paint': {
      score: 0.5,
      scoreDisplayMode: 'numeric',
      title: 'Largest Contentful Paint',
      description: 'LCP',
      displayValue: '4.2 s',
      numericValue: 4200,
    },
    'total-blocking-time': {
      score: 0.3,
      scoreDisplayMode: 'numeric',
      title: 'Total Blocking Time',
      description: 'TBT',
      displayValue: '800 ms',
      numericValue: 800,
    },
    'cumulative-layout-shift': {
      score: 1,
      scoreDisplayMode: 'numeric',
      title: 'Cumulative Layout Shift',
      description: 'CLS',
      displayValue: '0.02',
      numericValue: 0.02,
    },
    'unused-css': {
      score: 0,
      scoreDisplayMode: 'informative',
      title: 'Unused CSS',
      description: 'CSS sin usar',
    },
    'image-alt': {
      score: 0,
      scoreDisplayMode: 'binary',
      title: 'Image elements do not have [alt] attributes',
      description: 'Faltan atributos alt.',
    },
    'meta-description': {
      score: 0,
      scoreDisplayMode: 'binary',
      title: 'Document does not have a meta description',
      description: 'Falta la meta description.',
    },
    'is-on-https': {
      score: 1,
      scoreDisplayMode: 'binary',
      title: 'Uses HTTPS',
      description: 'HTTPS',
    },
  },
};

describe('summarizeLighthouse', () => {
  it('mapea puntuaciones, métricas y auditorías fallidas', () => {
    const result = summarizeLighthouse(REPORT, 1234);

    expect(result.scores).toEqual({
      performance: 0.72,
      accessibility: 0.9,
      bestPractices: 1,
      seo: 0.8,
    });
    expect(result.finalUrl).toBe('https://example.com/');
    expect(result.elapsedMs).toBe(1234);

    const fcp = result.metrics.find((metric) => metric.id === 'first-contentful-paint');
    expect(fcp?.value).toBeNull();

    const lcp = result.metrics.find((metric) => metric.id === 'largest-contentful-paint');
    expect(lcp?.value).toBe(4200);
    expect(lcp?.unit).toBe('ms');

    const cls = result.metrics.find((metric) => metric.id === 'cumulative-layout-shift');
    expect(cls?.value).toBe(0.02);
    expect(cls?.unit).toBe('unitless');

    expect(result.failingAudits.map((audit) => audit.id)).toEqual([
      'total-blocking-time',
      'largest-contentful-paint',
      'image-alt',
      'meta-description',
    ]);
    expect(result.failingAudits[0]?.severity).toBe('alto');
    expect(result.failingAudits[3]?.severity).toBe('medio');
  });

  it('devuelve null en puntuaciones ausentes', () => {
    const result = summarizeLighthouse({ categories: {}, audits: {} });
    expect(result.scores).toEqual({
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    });
    expect(result.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(result.failingAudits).toEqual([]);
  });
});

describe('runLighthouse', () => {
  beforeEach(() => {
    mocks.launch.mockReset();
    mocks.kill.mockReset();
    mocks.lighthouse.mockReset();
  });

  it('ejecuta Lighthouse con Chrome y cierra el proceso', async () => {
    mocks.launch.mockResolvedValue({ port: 9333, kill: mocks.kill });
    mocks.lighthouse.mockResolvedValue({ lhr: REPORT });

    const result = await runLighthouse('https://example.com/', { chromePath: process.execPath });

    expect(result.scores.performance).toBe(0.72);
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ chromePath: process.execPath }),
    );
    expect(mocks.lighthouse).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({
        port: 9333,
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      }),
    );
    expect(mocks.kill).toHaveBeenCalled();
  });

  it('devuelve un error controlado si el lanzamiento falla', async () => {
    mocks.launch.mockRejectedValue(new Error('sin Chrome'));

    const result = await runLighthouse('https://example.com/', { chromePath: process.execPath });

    expect(result.error).toBe('sin Chrome');
    expect(result.scores.performance).toBeNull();
    expect(result.failingAudits).toEqual([]);
  });

  it('devuelve un error controlado si el ejecutable no existe', async () => {
    const result = await runLighthouse('https://example.com/', {
      chromePath: 'C:/ruta/inexistente/chrome.exe',
    });

    expect(result.error).toContain('No se encontró el ejecutable de Chrome');
    expect(mocks.launch).not.toHaveBeenCalled();
  });
});

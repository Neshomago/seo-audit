import { describe, expect, it, vi } from 'vitest';
import { crawlSite } from './crawl.js';
import { createEmptyDom } from './dom.js';
import type { RenderedPage } from './types.js';

function makePage(
  url: string,
  links: string[] = [],
  overrides: Partial<RenderedPage> = {},
): RenderedPage {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {},
    html: '',
    title: url,
    cookieNames: [],
    resources: [],
    links,
    consoleErrors: [],
    dom: createEmptyDom(),
    elapsedMs: 0,
    ...overrides,
  };
}

describe('crawlSite', () => {
  it('hace BFS same-host, deduplica y respeta maxPages', async () => {
    const home = makePage('https://example.com/', [
      'https://example.com/a',
      'https://example.com/a?utm_source=news',
      'https://example.com/a#seccion',
      'https://example.com/a/',
      'https://example.com/blog?page=2',
      'https://external.com/x',
      'https://example.com/file.pdf',
      'mailto:hola@example.com',
    ]);

    const fixtures = new Map([
      [
        'https://example.com/a',
        makePage('https://example.com/a', [
          'https://example.com/b',
          'https://example.com/a',
        ]),
      ],
      ['https://example.com/blog?page=2', makePage('https://example.com/blog?page=2')],
      ['https://example.com/b', makePage('https://example.com/b')],
    ]);

    const render = vi.fn(async (url: string) => {
      const page = fixtures.get(url);
      if (!page) throw new Error(`Sin fixture para ${url}`);
      return page;
    });

    const result = await crawlSite('https://example.com/', {
      maxPages: 4,
      initialPage: home,
      render,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      'https://example.com/',
      'https://example.com/a',
      'https://example.com/blog?page=2',
      'https://example.com/b',
    ]);
    expect(result.pages.map((page) => page.depth)).toEqual([0, 1, 1, 2]);
    expect(render).toHaveBeenCalledTimes(3);
    expect(render).toHaveBeenNthCalledWith(1, 'https://example.com/a');
    expect(render).toHaveBeenNthCalledWith(2, 'https://example.com/blog?page=2');
    expect(render).toHaveBeenNthCalledWith(3, 'https://example.com/b');
    expect(result.errors).toEqual([]);
  });

  it('elimina solo parámetros de tracking y conserva la paginación', async () => {
    const home = makePage('https://example.com/', [
      'https://example.com/blog?page=2&utm_source=news',
      'https://example.com/blog?utm_campaign=promo',
    ]);
    const render = vi.fn(async (url: string) => makePage(url));

    const result = await crawlSite('https://example.com/', {
      maxPages: 2,
      initialPage: home,
      render,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith('https://example.com/blog?page=2');
    expect(result.pages.map((page) => page.url)).toEqual([
      'https://example.com/',
      'https://example.com/blog?page=2',
    ]);
  });

  it('no renderiza más páginas cuando maxPages es 1', async () => {
    const home = makePage('https://example.com/', ['https://example.com/a']);
    const render = vi.fn(async (url: string) => makePage(url));

    const result = await crawlSite('https://example.com/', {
      maxPages: 1,
      initialPage: home,
      render,
    });

    expect(result.pages).toHaveLength(1);
    expect(render).not.toHaveBeenCalled();
  });

  it('usa el host final de la home para decidir qué es interno', async () => {
    const home = makePage(
      'https://example.com/',
      ['https://www.example.com/a', 'https://example.com/b'],
      { finalUrl: 'https://www.example.com/' },
    );
    const render = vi.fn(async (url: string) => makePage(url));

    const result = await crawlSite('https://example.com/', {
      maxPages: 5,
      initialPage: home,
      render,
    });

    expect(result.host).toBe('www.example.com');
    expect(result.pages.map((page) => page.url)).toEqual([
      'https://example.com/',
      'https://www.example.com/a',
    ]);
  });

  it('registra errores de render y continúa con la cola', async () => {
    const home = makePage('https://example.com/', [
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    const render = vi.fn(async (url: string) => {
      if (url.endsWith('/a')) throw new Error('fallo de red');
      return makePage(url);
    });

    const result = await crawlSite('https://example.com/', {
      maxPages: 10,
      initialPage: home,
      render,
    });

    expect(result.pages.map((page) => page.url)).toEqual([
      'https://example.com/',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    expect(result.errors).toEqual([
      { url: 'https://example.com/a', depth: 1, message: 'fallo de red' },
    ]);
  });

  it('renderiza la URL inicial cuando no se pasa initialPage', async () => {
    const render = vi.fn(async (url: string) =>
      makePage(url, ['https://example.com/next']),
    );

    const result = await crawlSite('https://example.com/', { maxPages: 2, render });

    expect(render).toHaveBeenCalledTimes(2);
    expect(result.pages.map((page) => page.depth)).toEqual([0, 1]);
  });
});

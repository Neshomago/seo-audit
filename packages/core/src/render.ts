import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { resolveChromePath } from './chrome.js';
import { createEmptyDom } from './dom.js';
import type { DomSignals, RenderedPage, ResourceEntry } from './types.js';

export interface RenderOptions {
  timeoutMs?: number;
}

interface PageSnapshot {
  html: string;
  title: string;
  dom: DomSignals;
  resources: ResourceEntry[];
  links: string[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || /timeout/i.test(error.message));
}

function pushLimited(list: string[], value: string, max = 50): void {
  if (list.length < max) list.push(value.slice(0, 500));
}

function safePageUrl(page: Page, fallback: string): string {
  try {
    return page.url() || fallback;
  } catch {
    return fallback;
  }
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: resolveChromePath(),
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage'],
    protocolTimeout: 60_000,
  });
}

export async function renderPage(
  browser: Browser,
  url: string,
  options: RenderOptions = {},
): Promise<RenderedPage> {
  const started = Date.now();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];

  let status: number | null = null;
  let headers: Record<string, string> = {};
  let navigationError: string | null = null;
  let cookieNames: string[] = [];
  let snapshot: PageSnapshot | null = null;

  try {
    await page.setViewport({ width: 1366, height: 900 });

    page.on('pageerror', (error) => {
      pushLimited(consoleErrors, `pageerror: ${messageOf(error)}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') pushLimited(consoleErrors, `console: ${message.text()}`);
    });

    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeoutMs ?? 45_000,
      });
      if (response) {
        status = response.status();
        headers = response.headers();
      }
    } catch (error) {
      navigationError = messageOf(error);
      if (!isTimeoutError(error)) {
        // Se continúa con lo que Chrome haya podido cargar (página de error).
      }
    }

    try {
      snapshot = await page.evaluate((): PageSnapshot => {
        const globals = window as unknown as Record<string, unknown>;
        const resources: ResourceEntry[] = performance
          .getEntriesByType('resource')
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            return {
              name: resource.name,
              initiatorType: resource.initiatorType,
              transferSize: resource.transferSize,
              encodedBodySize: resource.encodedBodySize,
              decodedBodySize: resource.decodedBodySize,
              duration: resource.duration,
            };
          });

        return {
          html: document.documentElement.outerHTML,
          title: document.title,
          dom: {
            nextData: Boolean(globals.__NEXT_DATA__),
            nuxt: Boolean(globals.__NUXT__),
            vue: Boolean(globals.Vue),
            angular: Boolean(globals.angular),
            react: Boolean(globals.React),
            sveltekit: Boolean(globals.__sveltekit ?? globals.__SVELTEKIT__),
            remix: Boolean(globals.__remixContext),
            firebase: Boolean(globals.firebase),
            jquery: Boolean(globals.jQuery),
            gatsby: Boolean(globals.___gatsby),
            ngVersion: document.querySelector('[ng-version]')?.getAttribute('ng-version') ?? null,
            hasRoot: Boolean(document.getElementById('root')),
            hasNextRoot: Boolean(document.getElementById('__next')),
            hasApp: Boolean(document.getElementById('app')),
            metaGenerator:
              document.querySelector('meta[name="generator"]')?.getAttribute('content') ?? null,
            scriptSrcs: Array.from(document.scripts)
              .map((script) => script.src)
              .filter((src) => src.length > 0)
              .slice(0, 200),
            linkHrefs: Array.from(document.querySelectorAll('link[href]'))
              .map((link) => link.getAttribute('href') ?? '')
              .filter((href) => href.length > 0)
              .slice(0, 200),
          },
          resources,
          links: Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
            .map((anchor) => anchor.href)
            .filter((href) => href.startsWith('http'))
            .slice(0, 500),
        };
      });
    } catch (error) {
      navigationError = navigationError ?? `No se pudo leer el DOM: ${messageOf(error)}`;
    }

    try {
      const cookies = await page.cookies();
      cookieNames = cookies.map((cookie) => cookie.name);
    } catch {
      // Sin cookies accesibles; no es crítico para la detección.
    }

    return {
      url,
      finalUrl: safePageUrl(page, url),
      status,
      headers,
      html: snapshot?.html ?? '',
      title: snapshot?.title ?? '',
      cookieNames,
      resources: snapshot?.resources ?? [],
      links: snapshot?.links ?? [],
      consoleErrors,
      dom: snapshot?.dom ?? createEmptyDom(),
      elapsedMs: Date.now() - started,
      error: navigationError ?? undefined,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

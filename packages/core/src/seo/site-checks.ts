import type { CrawledPage } from '../crawl.js';
import type { HttpProbe, SiteProbe } from '../types.js';
import { fixFor, type StackContext } from './fixes.js';
import type { PageSeoResult, SeoCheck } from './types.js';

export interface SiteChecksInput {
  probe: HttpProbe;
  site: SiteProbe;
  pages: PageSeoResult[];
  crawlPages?: CrawledPage[];
  crawlErrors?: number;
  context: StackContext;
}

interface DuplicateGroup {
  value: string;
  urls: string[];
}

function header(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
}

function duplicatesBy(
  pages: PageSeoResult[],
  pick: (page: PageSeoResult) => string | null,
): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();

  for (const page of pages) {
    const raw = pick(page);
    if (!raw) continue;
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) continue;

    const key = value.toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.urls.push(page.url);
    else groups.set(key, { value, urls: [page.url] });
  }

  return [...groups.values()].filter((group) => group.urls.length > 1);
}

function describeDuplicates(groups: DuplicateGroup[]): string {
  const sample = groups
    .slice(0, 3)
    .map((group) => {
      const value =
        group.value.length > 60 ? `${group.value.slice(0, 57).trimEnd()}...` : group.value;
      return `"${value}" (${group.urls.length})`;
    })
    .join(', ');
  return `${groups.length} valor(es) repetidos en varias páginas: ${sample}.`;
}

export function buildSiteChecks(input: SiteChecksInput): SeoCheck[] {
  const { probe, site, pages, context } = input;
  const checks: SeoCheck[] = [];
  const add = (check: SeoCheck): void => {
    checks.push(check);
  };

  const effectiveUrl = probe.finalUrl || probe.url;
  const isHttps = effectiveUrl.startsWith('https://');
  add({
    id: 'https',
    category: 'tecnico',
    status: isHttps ? 'pass' : 'fail',
    severity: 'critico',
    title: 'HTTPS',
    detail: isHttps ? `El sitio se sirve por HTTPS (${effectiveUrl}).` : 'El sitio no usa HTTPS.',
    fix: 'Instala un certificado TLS y redirige todo http:// a https:// con 301.',
  });

  const hsts = header(probe.headers, 'strict-transport-security');
  if (isHttps) {
    add({
      id: 'hsts',
      category: 'tecnico',
      status: hsts ? 'pass' : 'warn',
      severity: 'medio',
      title: 'HSTS',
      detail: hsts
        ? `Strict-Transport-Security: ${hsts}`
        : 'Falta la cabecera Strict-Transport-Security.',
      fix: 'Añade Strict-Transport-Security: max-age=31536000; includeSubDomains.',
    });
  }

  const csp = header(probe.headers, 'content-security-policy');
  add({
    id: 'csp',
    category: 'tecnico',
    status: csp ? 'pass' : 'warn',
    severity: 'medio',
    title: 'Content Security Policy',
    detail: csp ? 'CSP presente.' : 'Falta la cabecera Content-Security-Policy.',
    fix: fixFor(
      'securityHeaders',
      context,
      'Define una CSP que limite scripts, estilos e imágenes a orígenes de confianza.',
    ),
  });

  const contentTypeOptions = header(probe.headers, 'x-content-type-options');
  add({
    id: 'x-content-type-options',
    category: 'tecnico',
    status: contentTypeOptions ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'X-Content-Type-Options',
    detail: contentTypeOptions
      ? 'X-Content-Type-Options presente.'
      : 'Falta la cabecera X-Content-Type-Options.',
    fix: 'Añade X-Content-Type-Options: nosniff.',
  });

  const referrerPolicy = header(probe.headers, 'referrer-policy');
  add({
    id: 'referrer-policy',
    category: 'tecnico',
    status: referrerPolicy ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'Referrer-Policy',
    detail: referrerPolicy
      ? 'Referrer-Policy presente.'
      : 'Falta la cabecera Referrer-Policy.',
    fix: 'Añade Referrer-Policy: strict-origin-when-cross-origin.',
  });

  const frameOptions = header(probe.headers, 'x-frame-options');
  const frameAncestors = csp?.toLowerCase().includes('frame-ancestors') ?? false;
  add({
    id: 'frame-options',
    category: 'tecnico',
    status: frameOptions || frameAncestors ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'Protección contra clickjacking',
    detail:
      frameOptions || frameAncestors
        ? 'X-Frame-Options o CSP frame-ancestors presente.'
        : 'Falta X-Frame-Options y CSP frame-ancestors.',
    fix: 'Añade X-Frame-Options: SAMEORIGIN o CSP con frame-ancestors.',
  });

  const redirects = Math.max(0, probe.redirectChain.length - 1);
  add({
    id: 'redirects',
    category: 'tecnico',
    status: redirects === 0 ? 'pass' : redirects <= 1 ? 'warn' : 'fail',
    severity: 'medio',
    title: 'Redirecciones',
    detail:
      redirects === 0
        ? 'La URL responde sin redirecciones.'
        : `La URL encadena ${redirects} redirección(es).`,
    evidence: probe.redirectChain.length > 1 ? probe.redirectChain.join(' -> ') : undefined,
    fix: 'Enlaza directamente a la URL final y usa una sola redirección 301 cuando sea necesario.',
  });

  const robotsDisallowAll = site.robots.found && /^\s*disallow:\s*\/\s*$/im.test(site.robots.text);
  add({
    id: 'robots',
    category: 'tecnico',
    status: !site.robots.found ? 'fail' : robotsDisallowAll ? 'fail' : 'pass',
    severity: 'alto',
    title: 'robots.txt',
    detail: !site.robots.found
      ? 'No se encontró /robots.txt accesible.'
      : robotsDisallowAll
        ? 'robots.txt bloquea todo el sitio con "Disallow: /".'
        : 'robots.txt accesible y sin bloqueo global.',
    evidence: site.robots.found ? site.robots.text.slice(0, 300) : undefined,
    fix: fixFor(
      'robots',
      context,
      'Publica /robots.txt y evita "Disallow: /"; declara el sitemap con la directiva Sitemap.',
    ),
  });

  add({
    id: 'sitemap',
    category: 'tecnico',
    status: site.sitemap.found && site.sitemap.urlsCount > 0 ? 'pass' : 'warn',
    severity: 'medio',
    title: 'Sitemap XML',
    detail: !site.sitemap.found
      ? 'No se encontró /sitemap.xml.'
      : site.sitemap.urlsCount === 0
        ? 'El sitemap existe pero no contiene URLs.'
        : `${site.sitemap.urlsCount} URLs en el sitemap (${site.sitemapsDeclared.length} sitemaps declarados).`,
    fix: fixFor(
      'sitemap',
      context,
      'Genera un sitemap XML actualizado y decláralo en robots.txt y en Search Console.',
    ),
  });

  const duplicateTitles = duplicatesBy(pages, (page) => page.data.title);
  add({
    id: 'duplicate-titles',
    category: 'on-page',
    status: duplicateTitles.length > 0 ? 'fail' : 'pass',
    severity: 'medio',
    title: 'Títulos duplicados',
    detail:
      duplicateTitles.length > 0
        ? describeDuplicates(duplicateTitles)
        : 'Cada página tiene un title distinto.',
    evidence:
      duplicateTitles.length > 0
        ? duplicateTitles.flatMap((group) => group.urls.slice(0, 3)).slice(0, 6).join(', ')
        : undefined,
    fix: 'Escribe un title único para cada página.',
  });

  const duplicateDescriptions = duplicatesBy(pages, (page) => page.data.metaDescription);
  add({
    id: 'duplicate-descriptions',
    category: 'on-page',
    status: duplicateDescriptions.length > 0 ? 'warn' : 'pass',
    severity: 'bajo',
    title: 'Meta descriptions duplicadas',
    detail:
      duplicateDescriptions.length > 0
        ? describeDuplicates(duplicateDescriptions)
        : 'Cada página tiene una meta description distinta.',
    evidence:
      duplicateDescriptions.length > 0
        ? duplicateDescriptions.flatMap((group) => group.urls.slice(0, 3)).slice(0, 6).join(', ')
        : undefined,
    fix: 'Escribe una meta description única para cada página.',
  });

  const crawlPages = input.crawlPages ?? [];
  const crawlErrors = input.crawlErrors ?? 0;
  if (crawlPages.length === 0) {
    add({
      id: 'crawl-status',
      category: 'tecnico',
      status: 'warn',
      severity: 'alto',
      title: 'Rastreo del sitio',
      detail: 'No se rastreó ninguna página.',
      fix: 'Revisa que el sitio sea accesible y que los enlaces internos funcionen.',
    });
  } else {
    const failing = crawlPages.filter((page) => page.status !== null && page.status >= 400);
    const hasErrors = failing.length > 0 || crawlErrors > 0;
    const parts: string[] = [
      `${crawlPages.length} ${crawlPages.length === 1 ? 'página rastreada' : 'páginas rastreadas'}`,
    ];
    if (failing.length > 0) parts.push(`${failing.length} con error HTTP`);
    if (crawlErrors > 0) {
      parts.push(`${crawlErrors} ${crawlErrors === 1 ? 'fallo de carga' : 'fallos de carga'}`);
    }
    add({
      id: 'crawl-status',
      category: 'tecnico',
      status: hasErrors ? 'warn' : 'pass',
      severity: 'alto',
      title: 'Rastreo del sitio',
      detail: `${parts.join(', ')}.`,
      evidence:
        failing.length > 0 ? failing.slice(0, 5).map((page) => page.finalUrl).join(', ') : undefined,
      fix: 'Corrige o elimina los enlaces internos que devuelven errores.',
    });
  }

  return checks;
}

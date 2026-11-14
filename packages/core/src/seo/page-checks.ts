import { fixFor, type StackContext } from './fixes.js';
import type { CheckStatus, HreflangEntry, PageSeoData, SeoCheck } from './types.js';

function isSelfCanonical(canonical: string, pageUrl: string): boolean {
  try {
    const canonicalUrl = new URL(canonical, pageUrl);
    const current = new URL(pageUrl);
    return (
      canonicalUrl.host === current.host &&
      canonicalUrl.pathname.replace(/\/+$/, '') === current.pathname.replace(/\/+$/, '')
    );
  } catch {
    return false;
  }
}

function urlStructureIssues(pageUrl: string): string[] {
  const issues: string[] = [];
  try {
    const url = new URL(pageUrl);
    if (url.pathname.length > 115) issues.push('ruta de más de 115 caracteres');
    if (/[A-Z]/.test(url.pathname)) issues.push('mayúsculas en la ruta');
    if (url.pathname.includes('_')) issues.push('guiones bajos en la ruta');
    if ([...url.searchParams.keys()].length > 2) issues.push('más de 2 parámetros en la URL');
  } catch {
    issues.push('URL no parseable');
  }
  return issues;
}

function hreflangIssues(entries: HreflangEntry[], pageUrl: string): string[] {
  const issues: string[] = [];
  const languages = new Set(entries.map((entry) => entry.hreflang.toLowerCase()));

  if (!languages.has('x-default')) issues.push('falta hreflang x-default');

  const hasSelfReference = entries.some((entry) => {
    try {
      const target = new URL(entry.href, pageUrl);
      const current = new URL(pageUrl);
      return (
        target.host === current.host &&
        target.pathname.replace(/\/+$/, '') === current.pathname.replace(/\/+$/, '')
      );
    } catch {
      return false;
    }
  });
  if (!hasSelfReference) issues.push('falta la auto-referencia hreflang');

  if (entries.some((entry) => !/^https?:\/\//i.test(entry.href))) {
    issues.push('hay hreflang con URL no absoluta');
  }

  return issues;
}

export function buildPageChecks(data: PageSeoData, context: StackContext): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const add = (check: Omit<SeoCheck, 'pageUrl'>): void => {
    checks.push({ ...check, pageUrl: data.url });
  };

  const statusCheck: CheckStatus =
    data.status === 200 ? 'pass' : data.status !== null && data.status < 400 ? 'warn' : 'fail';
  add({
    id: 'http-status',
    category: 'tecnico',
    status: statusCheck,
    severity: 'critico',
    title: 'Código de estado HTTP',
    detail:
      data.status === null
        ? 'La página no pudo cargarse en Chrome.'
        : `La página respondió ${data.status}.`,
    fix: 'Sirve la página con 200 OK o redirige con 301 a una URL válida.',
  });

  const titleLength = data.title?.length ?? 0;
  const titleStatus: CheckStatus = !data.title
    ? 'fail'
    : titleLength < 10 || titleLength > 60
      ? 'warn'
      : 'pass';
  add({
    id: 'title',
    category: 'on-page',
    status: titleStatus,
    severity: 'alto',
    title: 'Title de la página',
    detail: !data.title
      ? 'No se encontró <title>.'
      : `Title de ${titleLength} caracteres (recomendado 10-60).`,
    evidence: data.title ?? undefined,
    fix: fixFor(
      'title',
      context,
      'Define un <title> único de 10-60 caracteres con la keyword principal y la marca.',
    ),
  });

  const descriptionLength = data.metaDescription?.length ?? 0;
  const descriptionStatus: CheckStatus = !data.metaDescription
    ? 'fail'
    : descriptionLength < 50 || descriptionLength > 160
      ? 'warn'
      : 'pass';
  add({
    id: 'meta-description',
    category: 'on-page',
    status: descriptionStatus,
    severity: 'medio',
    title: 'Meta description',
    detail: !data.metaDescription
      ? 'No se encontró <meta name="description">.'
      : `Descripción de ${descriptionLength} caracteres (recomendado 50-160).`,
    evidence: data.metaDescription ?? undefined,
    fix: fixFor(
      'metaDescription',
      context,
      'Escribe una meta description única de 50-160 caracteres con valor y llamada a la acción.',
    ),
  });

  const h1Texts = data.headings
    .filter((heading) => heading.level === 1)
    .map((heading) => heading.text)
    .filter((text) => text.length > 0);
  add({
    id: 'h1',
    category: 'on-page',
    status: data.h1Count === 0 ? 'fail' : data.h1Count > 1 ? 'warn' : 'pass',
    severity: 'alto',
    title: 'Encabezado H1',
    detail:
      data.h1Count === 0
        ? 'No hay ningún H1 en la página.'
        : data.h1Count > 1
          ? `Hay ${data.h1Count} H1; debería haber uno solo.`
          : 'Un único H1 encontrado.',
    evidence: h1Texts.length > 0 ? h1Texts.join(' | ') : undefined,
    fix: fixFor('h1', context, 'Usa un único H1 por página que describa el tema principal.'),
  });

  let previousLevel: number | null = null;
  let hierarchyIssue: string | null = null;
  for (const heading of data.headings) {
    if (previousLevel !== null && heading.level - previousLevel > 1) {
      hierarchyIssue = `Salto de H${previousLevel} a H${heading.level} ("${heading.text}").`;
      break;
    }
    previousLevel = heading.level;
  }
  add({
    id: 'heading-hierarchy',
    category: 'on-page',
    status: hierarchyIssue ? 'warn' : 'pass',
    severity: 'bajo',
    title: 'Jerarquía de encabezados',
    detail: hierarchyIssue ?? 'Sin saltos de nivel detectados.',
    fix: 'Mantén una jerarquía H1 > H2 > H3 sin saltarte niveles.',
  });

  let canonicalStatus: CheckStatus = 'pass';
  let canonicalDetail = `Canonical: ${data.canonical}`;
  if (!data.canonical) {
    canonicalStatus = 'warn';
    canonicalDetail = 'No se encontró <link rel="canonical">.';
  } else if (!/^https?:\/\//i.test(data.canonical)) {
    canonicalStatus = 'warn';
    canonicalDetail = 'El canonical no es una URL absoluta.';
  } else if (!isSelfCanonical(data.canonical, data.url)) {
    canonicalStatus = 'warn';
    canonicalDetail = `El canonical apunta a ${data.canonical}, no a esta página.`;
  }
  add({
    id: 'canonical',
    category: 'tecnico',
    status: canonicalStatus,
    severity: 'medio',
    title: 'Canonical',
    detail: canonicalDetail,
    evidence: data.canonical ?? undefined,
    fix: fixFor(
      'canonical',
      context,
      'Declara un canonical absoluto y auto-referenciado en cada página indexable.',
    ),
  });

  add({
    id: 'lang',
    category: 'on-page',
    status: data.lang ? 'pass' : 'warn',
    severity: 'medio',
    title: 'Idioma del documento',
    detail: data.lang ? `lang="${data.lang}".` : 'Falta el atributo lang en <html>.',
    fix: 'Añade <html lang="es"> (o el idioma correspondiente).',
  });

  add({
    id: 'viewport',
    category: 'on-page',
    status: data.viewport ? 'pass' : 'fail',
    severity: 'alto',
    title: 'Viewport móvil',
    detail: data.viewport
      ? 'Meta viewport presente.'
      : 'Falta <meta name="viewport"> (la página no es responsive).',
    fix: 'Añade <meta name="viewport" content="width=device-width, initial-scale=1">.',
  });

  const missingOpenGraph = Object.entries(data.openGraph)
    .filter(([, present]) => !present)
    .map(([key]) => key);
  add({
    id: 'open-graph',
    category: 'on-page',
    status: missingOpenGraph.length === 0 ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'Open Graph',
    detail:
      missingOpenGraph.length === 0
        ? 'og:title, og:description y og:image presentes.'
        : `Faltan: ${missingOpenGraph.join(', ')}.`,
    fix: 'Añade og:title, og:description y og:image para mejorar las vistas previas al compartir.',
  });

  const missingTwitter = Object.entries(data.twitterCard)
    .filter(([, present]) => !present)
    .map(([key]) => key);
  add({
    id: 'twitter-card',
    category: 'on-page',
    status: missingTwitter.length === 0 ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'Twitter Card',
    detail:
      missingTwitter.length === 0
        ? 'twitter:card, twitter:title y twitter:description presentes.'
        : `Faltan: ${missingTwitter.join(', ')}.`,
    fix: 'Añade twitter:card, twitter:title y twitter:description para las tarjetas sociales.',
  });

  const jsonLdStatus: CheckStatus = !data.jsonLdValid
    ? 'fail'
    : data.jsonLdCount === 0
      ? 'warn'
      : 'pass';
  add({
    id: 'json-ld',
    category: 'on-page',
    status: jsonLdStatus,
    severity: jsonLdStatus === 'fail' ? 'medio' : 'bajo',
    title: 'Datos estructurados (JSON-LD)',
    detail: !data.jsonLdValid
      ? 'Hay bloques JSON-LD con JSON inválido.'
      : data.jsonLdCount === 0
        ? 'No se encontró JSON-LD.'
        : `${data.jsonLdCount} bloque(s) válidos. Tipos: ${data.jsonLdTypes.join(', ') || 'sin @type'}.`,
    fix: fixFor(
      'structuredData',
      context,
      'Añade JSON-LD válido (Organization, WebSite, BreadcrumbList, Article/Product según el tipo de página).',
    ),
  });

  const imagesStatus: CheckStatus =
    data.imagesWithoutAlt === 0
      ? 'pass'
      : data.imageCount > 0 && data.imagesWithoutAlt / data.imageCount > 0.5
        ? 'fail'
        : 'warn';
  add({
    id: 'image-alt',
    category: 'accesibilidad',
    status: imagesStatus,
    severity: 'medio',
    title: 'Texto alternativo de imágenes',
    detail:
      data.imageCount === 0
        ? 'No hay imágenes en la página.'
        : `${data.imagesWithoutAlt} de ${data.imageCount} imágenes sin atributo alt.`,
    fix: fixFor(
      'images',
      context,
      'Añade alt descriptivo a las imágenes informativas y alt="" a las decorativas.',
    ),
  });

  add({
    id: 'word-count',
    category: 'contenido',
    status: data.wordCount >= 300 ? 'pass' : 'warn',
    severity: 'bajo',
    title: 'Cantidad de contenido',
    detail: `${data.wordCount} palabras detectadas (referencia: 300+).`,
    fix: 'Amplía el contenido con información útil y específica para la intención de búsqueda.',
  });

  add({
    id: 'internal-links',
    category: 'contenido',
    status: data.internalLinks > 0 ? 'pass' : 'warn',
    severity: 'medio',
    title: 'Enlaces internos',
    detail: `${data.internalLinks} enlaces internos y ${data.externalLinks} externos.`,
    fix: 'Añade enlaces internos contextuales hacia páginas relacionadas.',
  });

  const robotsValue = `${data.metaRobots ?? ''} ${data.xRobotsTag ?? ''}`.toLowerCase();
  const isNoindex = /noindex|none/.test(robotsValue);
  add({
    id: 'meta-robots',
    category: 'tecnico',
    status: isNoindex ? 'fail' : 'pass',
    severity: 'critico',
    title: 'Indexabilidad (robots)',
    detail: isNoindex
      ? `La página está marcada como noindex (${robotsValue.trim()}).`
      : 'La página no tiene noindex en meta robots ni X-Robots-Tag.',
    fix: fixFor(
      'robots',
      context,
      'Elimina noindex/none de meta robots y X-Robots-Tag para permitir la indexación.',
    ),
  });

  const isHttps = data.url.startsWith('https://');
  const hasMixedContent = isHttps && data.mixedContentCount > 0;
  add({
    id: 'mixed-content',
    category: 'tecnico',
    status: hasMixedContent ? 'fail' : 'pass',
    severity: 'alto',
    title: 'Contenido mixto',
    detail: !isHttps
      ? 'La página no es HTTPS; se omite la comprobación de contenido mixto.'
      : hasMixedContent
        ? `${data.mixedContentCount} recursos http:// en una página https://.`
        : 'Sin recursos http:// en la página HTTPS.',
    fix: fixFor(
      'mixedContent',
      context,
      'Cambia todos los recursos http:// a https:// o a rutas relativas.',
    ),
  });

  const structureIssues = urlStructureIssues(data.url);
  add({
    id: 'url-structure',
    category: 'tecnico',
    status: structureIssues.length > 0 ? 'warn' : 'pass',
    severity: 'bajo',
    title: 'Estructura de la URL',
    detail: structureIssues.length > 0 ? structureIssues.join('; ') : 'URL limpia.',
    fix: 'Usa URLs cortas, en minúsculas, con guiones y con pocos parámetros.',
  });

  if (data.hreflangs.length > 0) {
    const issues = hreflangIssues(data.hreflangs, data.url);
    add({
      id: 'hreflang',
      category: 'tecnico',
      status: issues.length > 0 ? 'warn' : 'pass',
      severity: 'bajo',
      title: 'Hreflang',
      detail:
        issues.length > 0
          ? issues.join('; ')
          : `${data.hreflangs.length} alternativas de idioma declaradas.`,
      fix: 'Añade hreflang auto-referenciado, x-default y URLs absolutas.',
    });
  }

  return checks;
}

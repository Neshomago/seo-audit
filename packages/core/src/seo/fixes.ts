import type { StackReport } from '../detect/stack.js';

export interface StackContext {
  wordpress: boolean;
  joomla: boolean;
  drupal: boolean;
  shopify: boolean;
  next: boolean;
  nuxt: boolean;
  react: boolean;
  angular: boolean;
  vue: boolean;
  astro: boolean;
  express: boolean;
  php: boolean;
}

export type FixTopic =
  | 'title'
  | 'metaDescription'
  | 'h1'
  | 'canonical'
  | 'images'
  | 'structuredData'
  | 'robots'
  | 'sitemap'
  | 'securityHeaders'
  | 'mixedContent';

interface Hint {
  when: keyof StackContext;
  text: string;
}

const HINTS: Record<FixTopic, Hint[]> = {
  title: [
    {
      when: 'wordpress',
      text: 'En WordPress usa el título SEO de Yoast/RankMath o add_theme_support("title-tag").',
    },
    {
      when: 'joomla',
      text: 'En Joomla configúralo en el ítem de menú (Parámetros SEO) o con un plugin como 4SEF.',
    },
    {
      when: 'next',
      text: 'En Next.js usa el Metadata API (export const metadata) para el title.',
    },
    { when: 'nuxt', text: 'En Nuxt usa useSeoMeta() para definir el title.' },
    {
      when: 'angular',
      text: 'En Angular actualiza Title y Meta de @angular/platform-browser en cada ruta.',
    },
    {
      when: 'react',
      text: 'En React inyecta el title con react-helmet-async o con el head del framework.',
    },
  ],
  metaDescription: [
    {
      when: 'wordpress',
      text: 'En WordPress edita la meta description con Yoast SEO o RankMath.',
    },
    { when: 'joomla', text: 'En Joomla usa el campo Meta Descripción del ítem de menú.' },
    {
      when: 'next',
      text: 'En Next.js añade description en el Metadata API.',
    },
    { when: 'nuxt', text: 'En Nuxt añade description con useSeoMeta().' },
    {
      when: 'react',
      text: 'En React añade <meta name="description"> con react-helmet-async.',
    },
  ],
  h1: [
    { when: 'wordpress', text: 'En WordPress revisa la plantilla del tema y el editor de bloques.' },
    { when: 'joomla', text: 'En Joomla revisa la configuración de títulos del ítem de menú.' },
    { when: 'next', text: 'En Next.js controla el H1 en el componente de página.' },
    { when: 'react', text: 'En React asegura un solo H1 semántico por vista.' },
  ],
  canonical: [
    {
      when: 'wordpress',
      text: 'En WordPress Yoast/RankMath gestiona el canonical; revisa que no esté forzado a otra URL.',
    },
    { when: 'joomla', text: 'En Joomla revisa los parámetros SEO del menú y plugins SEF.' },
    { when: 'next', text: 'En Next.js define alternates.canonical en el Metadata API.' },
    { when: 'nuxt', text: 'En Nuxt usa useSeoMeta({ canonical }).' },
    { when: 'angular', text: 'En Angular actualiza el <link rel="canonical"> con el servicio Meta.' },
    { when: 'react', text: 'En React gestiona el canonical con react-helmet-async.' },
  ],
  images: [
    {
      when: 'wordpress',
      text: 'En WordPress el alt se edita en la biblioteca de medios; algunos plugins lo rellenan automáticamente.',
    },
    { when: 'next', text: 'En Next.js pasa alt en cada <Image>.' },
    { when: 'react', text: 'En React asegura alt descriptivo en cada <img>.' },
    { when: 'joomla', text: 'En Joomla edita el texto alternativo en el gestor de medios.' },
  ],
  structuredData: [
    {
      when: 'wordpress',
      text: 'En WordPress Yoast/RankMath generan schema; evita duplicarlo con plugins adicionales.',
    },
    {
      when: 'shopify',
      text: 'En Shopify usa metafields y JSON-LD en el tema para Product/BreadcrumbList.',
    },
    { when: 'next', text: 'En Next.js añade JSON-LD con <script type="application/ld+json">.' },
    { when: 'nuxt', text: 'En Nuxt usa useHead() para insertar JSON-LD.' },
    { when: 'react', text: 'En React inserta JSON-LD con react-helmet-async.' },
  ],
  robots: [
    {
      when: 'wordpress',
      text: 'En WordPress revisa Ajustes > Lectura y que Yoast/RankMath no marquen noindex.',
    },
    { when: 'next', text: 'En Next.js revisa robots y metadata en el layout raíz.' },
  ],
  sitemap: [
    {
      when: 'wordpress',
      text: 'En WordPress habilita el sitemap de Yoast/RankMath y decláralo en robots.txt.',
    },
    {
      when: 'joomla',
      text: 'En Joomla usa un plugin de sitemap (p. ej. OSMap) y decláralo en robots.txt.',
    },
    {
      when: 'shopify',
      text: 'En Shopify el sitemap se genera en /sitemap.xml; revisa su indexación.',
    },
    { when: 'next', text: 'En Next.js genera sitemap.xml con la Metadata API o next-sitemap.' },
  ],
  securityHeaders: [
    {
      when: 'express',
      text: 'En Express añade helmet() para HSTS, CSP y cabeceras de seguridad.',
    },
    { when: 'php', text: 'En PHP/Laravel define las cabeceras en el servidor o middleware.' },
    {
      when: 'next',
      text: 'En Next.js añade headers() en next.config para las cabeceras de seguridad.',
    },
  ],
  mixedContent: [
    {
      when: 'wordpress',
      text: 'En WordPress migra las URLs http:// con Better Search Replace y fuerza https en el panel.',
    },
    { when: 'next', text: 'En Next.js revisa rutas absolutas y variables de entorno que usen http://.' },
    { when: 'react', text: 'En React sustituye las URLs http:// por https:// en assets y API.' },
  ],
};

export function buildStackContext(stack?: StackReport): StackContext {
  const ids = new Set(stack?.technologies.map((technology) => technology.id) ?? []);
  return {
    wordpress: ids.has('wordpress'),
    joomla: ids.has('joomla'),
    drupal: ids.has('drupal'),
    shopify: ids.has('shopify'),
    next: ids.has('next'),
    nuxt: ids.has('nuxt'),
    react: ids.has('react'),
    angular: ids.has('angular'),
    vue: ids.has('vue'),
    astro: ids.has('astro'),
    express: ids.has('express'),
    php: ids.has('php'),
  };
}

export function fixFor(topic: FixTopic, context: StackContext, base: string): string {
  const hint = HINTS[topic].find((entry) => context[entry.when]);
  return hint ? `${base} ${hint.text}` : base;
}

import { createEmptyDom } from '../dom.js';
import type { Confidence, DomSignals, ResourceEntry, TechnologyCategory } from '../types.js';

export interface StackInput {
  headers: Record<string, string>;
  html: string;
  cookieNames?: string[];
  dom?: Partial<DomSignals>;
  resources?: Array<Pick<ResourceEntry, 'name' | 'initiatorType'>>;
}

export interface Evidence {
  signal: string;
  detail: string;
}

export interface DetectedTechnology {
  id: string;
  name: string;
  category: TechnologyCategory;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface StackReport {
  technologies: DetectedTechnology[];
  primaryStack: string[];
  notes: string[];
}

interface PreparedInput {
  headers: Record<string, string>;
  html: string;
  htmlLower: string;
  cookieNames: string[];
  dom: DomSignals;
  urls: string[];
}

interface Rule {
  id: string;
  name: string;
  category: TechnologyCategory;
  singleSignalConfidence?: Confidence;
  detect: (input: PreparedInput) => Evidence[];
}

const CONFIDENCE_RANK: Record<Confidence, number> = { alta: 0, media: 1, baja: 2 };

const CATEGORY_RANK: Record<TechnologyCategory, number> = {
  CMS: 0,
  'E-commerce': 1,
  Framework: 2,
  Librería: 3,
  Backend: 4,
  Runtime: 5,
  'Base de datos': 6,
  'Hosting/CDN': 7,
  Stack: 8,
};

function extractResourceUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  for (const match of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

function prepare(input: StackInput): PreparedInput {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.headers)) {
    headers[name.toLowerCase()] = value;
  }

  const urls = [
    ...extractResourceUrls(input.html),
    ...(input.dom?.scriptSrcs ?? []),
    ...(input.dom?.linkHrefs ?? []),
    ...(input.resources ?? []).map((resource) => resource.name),
  ];

  return {
    headers,
    html: input.html,
    htmlLower: input.html.toLowerCase(),
    cookieNames: (input.cookieNames ?? []).map((name) => name.toLowerCase()),
    dom: { ...createEmptyDom(), ...input.dom },
    urls: [...new Set(urls)],
  };
}

function header(input: PreparedInput, name: string): string | undefined {
  return input.headers[name];
}

function metaContent(input: PreparedInput, name: string): string | null {
  if (name === 'generator' && input.dom.metaGenerator) return input.dom.metaGenerator;

  const attrFirst = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`,
    'i',
  );
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*name=["']${name}["']`,
    'i',
  );
  return attrFirst.exec(input.html)?.[1] ?? contentFirst.exec(input.html)?.[1] ?? null;
}

function findUrl(input: PreparedInput, needles: string[]): string | undefined {
  return input.urls.find((url) => {
    const lower = url.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
  });
}

const RULES: Rule[] = [
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'CMS',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const generator = metaContent(input, 'generator');
      if (generator && /wordpress/i.test(generator)) {
        evidence.push({ signal: 'meta generator', detail: generator });
      }
      if (input.htmlLower.includes('/wp-content/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /wp-content/ en el HTML' });
      }
      if (input.htmlLower.includes('/wp-includes/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /wp-includes/ en el HTML' });
      }
      const wpJson = findUrl(input, ['/wp-json/']);
      if (wpJson) evidence.push({ signal: 'recurso', detail: wpJson });
      if (input.cookieNames.some((name) => name.startsWith('wordpress_'))) {
        evidence.push({ signal: 'cookie', detail: 'Cookie wordpress_*' });
      }
      return evidence;
    },
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    category: 'E-commerce',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.htmlLower.includes('/woocommerce/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /woocommerce/' });
      }
      if (input.htmlLower.includes('wc-block')) {
        evidence.push({ signal: 'html', detail: 'Markup de bloques WooCommerce (wc-block)' });
      }
      return evidence;
    },
  },
  {
    id: 'joomla',
    name: 'Joomla',
    category: 'CMS',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const generator = metaContent(input, 'generator');
      if (generator && /joomla/i.test(generator)) {
        evidence.push({ signal: 'meta generator', detail: generator });
      }
      if (input.htmlLower.includes('/media/system/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /media/system/' });
      }
      if (input.htmlLower.includes('/components/com_')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /components/com_' });
      }
      if (input.htmlLower.includes('/templates/system/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /templates/system/' });
      }
      if (input.htmlLower.includes('/administrator/')) {
        evidence.push({ signal: 'ruta', detail: 'Enlace a /administrator/' });
      }
      return evidence;
    },
  },
  {
    id: 'drupal',
    name: 'Drupal',
    category: 'CMS',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const generator = metaContent(input, 'generator');
      if (generator && /drupal/i.test(generator)) {
        evidence.push({ signal: 'meta generator', detail: generator });
      }
      if (input.htmlLower.includes('/sites/default/')) {
        evidence.push({ signal: 'ruta', detail: 'Referencia a /sites/default/' });
      }
      if (header(input, 'x-drupal-cache')) {
        evidence.push({ signal: 'header', detail: 'X-Drupal-Cache presente' });
      }
      const xGenerator = header(input, 'x-generator');
      if (xGenerator && /drupal/i.test(xGenerator)) {
        evidence.push({ signal: 'header', detail: `X-Generator: ${xGenerator}` });
      }
      return evidence;
    },
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'E-commerce',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (header(input, 'x-shopify-stage') || header(input, 'x-shopid')) {
        evidence.push({ signal: 'header', detail: 'Headers X-Shopify-* / X-ShopID' });
      }
      const cdn = findUrl(input, ['cdn.shopify.com']);
      if (cdn) evidence.push({ signal: 'recurso', detail: cdn });
      if (input.htmlLower.includes('shopify.theme')) {
        evidence.push({ signal: 'html', detail: 'Objeto Shopify.theme' });
      }
      return evidence;
    },
  },
  {
    id: 'next',
    name: 'Next.js',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.nextData || input.htmlLower.includes('__next_data__')) {
        evidence.push({ signal: 'dom', detail: 'Objeto __NEXT_DATA__' });
      }
      const asset = findUrl(input, ['/_next/static/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'react',
    name: 'React',
    category: 'Librería',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.react) evidence.push({ signal: 'dom', detail: 'window.React disponible' });
      if (input.htmlLower.includes('data-reactroot')) {
        evidence.push({ signal: 'dom', detail: 'Atributo data-reactroot' });
      }
      const asset = findUrl(input, [
        '/react-dom',
        'react.production',
        'react-dom.',
        '/react@',
        'react.development',
      ]);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'vue',
    name: 'Vue',
    category: 'Librería',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.vue) evidence.push({ signal: 'dom', detail: 'window.Vue disponible' });
      if (/\sdata-v-[0-9a-f]{8}/.test(input.htmlLower)) {
        evidence.push({ signal: 'dom', detail: 'Atributos scoped data-v-*' });
      }
      const asset = findUrl(input, ['/vue.js', '/vue.min.js', '/vue.runtime', '/@vue/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.nuxt || input.htmlLower.includes('__nuxt__')) {
        evidence.push({ signal: 'dom', detail: 'Objeto __NUXT__' });
      }
      const asset = findUrl(input, ['/_nuxt/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.angular) evidence.push({ signal: 'dom', detail: 'window.angular disponible' });
      if (input.dom.ngVersion) {
        evidence.push({ signal: 'dom', detail: `Atributo ng-version="${input.dom.ngVersion}"` });
      } else if (input.htmlLower.includes('ng-version=')) {
        evidence.push({ signal: 'dom', detail: 'Atributo ng-version' });
      }
      if (input.htmlLower.includes('ng-app=')) {
        evidence.push({ signal: 'dom', detail: 'Directiva ng-app' });
      }
      const asset = findUrl(input, ['/@angular/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'svelte',
    name: 'Svelte',
    category: 'Librería',
    singleSignalConfidence: 'baja',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.htmlLower.includes('data-svelte-h=')) {
        evidence.push({ signal: 'dom', detail: 'Atributo data-svelte-h' });
      }
      const asset = findUrl(input, ['/svelte']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.sveltekit || input.htmlLower.includes('__sveltekit')) {
        evidence.push({ signal: 'dom', detail: 'Objeto __sveltekit' });
      }
      const asset = findUrl(input, ['/_app/immutable/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'remix',
    name: 'Remix',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.remix || input.htmlLower.includes('__remixcontext')) {
        evidence.push({ signal: 'dom', detail: 'Objeto __remixContext' });
      }
      return evidence;
    },
  },
  {
    id: 'gatsby',
    name: 'Gatsby',
    category: 'Framework',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.gatsby || input.htmlLower.includes('___gatsby')) {
        evidence.push({ signal: 'dom', detail: 'Marcador ___gatsby' });
      }
      const asset = findUrl(input, ['/page-data/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'Framework',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.htmlLower.includes('astro-island')) {
        evidence.push({ signal: 'dom', detail: 'Elemento astro-island' });
      }
      const asset = findUrl(input, ['/_astro/']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'express',
    name: 'Express',
    category: 'Backend',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const poweredBy = header(input, 'x-powered-by');
      if (poweredBy && /express/i.test(poweredBy)) {
        evidence.push({ signal: 'header', detail: `X-Powered-By: ${poweredBy}` });
      }
      if (input.cookieNames.includes('connect.sid')) {
        evidence.push({ signal: 'cookie', detail: 'Cookie connect.sid' });
      }
      return evidence;
    },
  },
  {
    id: 'node',
    name: 'Node.js',
    category: 'Runtime',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const poweredBy = header(input, 'x-powered-by');
      if (poweredBy && /express/i.test(poweredBy)) {
        evidence.push({ signal: 'header', detail: 'Express se ejecuta sobre Node.js' });
      }
      if (input.cookieNames.includes('connect.sid')) {
        evidence.push({ signal: 'cookie', detail: 'Cookie connect.sid (Express/Node)' });
      }
      return evidence;
    },
  },
  {
    id: 'php',
    name: 'PHP',
    category: 'Runtime',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const poweredBy = header(input, 'x-powered-by');
      if (poweredBy && /php/i.test(poweredBy)) {
        evidence.push({ signal: 'header', detail: `X-Powered-By: ${poweredBy}` });
      }
      if (input.cookieNames.includes('phpsessid')) {
        evidence.push({ signal: 'cookie', detail: 'Cookie PHPSESSID' });
      }
      return evidence;
    },
  },
  {
    id: 'laravel',
    name: 'Laravel',
    category: 'Backend',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.cookieNames.includes('laravel_session')) {
        evidence.push({ signal: 'cookie', detail: 'Cookie laravel_session' });
      }
      return evidence;
    },
  },
  {
    id: 'aspnet',
    name: 'ASP.NET',
    category: 'Backend',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const poweredBy = header(input, 'x-powered-by');
      if (poweredBy && /asp\.net/i.test(poweredBy)) {
        evidence.push({ signal: 'header', detail: `X-Powered-By: ${poweredBy}` });
      }
      if (header(input, 'x-aspnet-version')) {
        evidence.push({ signal: 'header', detail: 'Header X-AspNet-Version' });
      }
      if (input.cookieNames.includes('asp.net_sessionid')) {
        evidence.push({ signal: 'cookie', detail: 'Cookie ASP.NET_SessionId' });
      }
      return evidence;
    },
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    category: 'Hosting/CDN',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const server = header(input, 'server');
      if (server && /cloudflare/i.test(server)) {
        evidence.push({ signal: 'header', detail: `Server: ${server}` });
      }
      if (header(input, 'cf-ray')) evidence.push({ signal: 'header', detail: 'Header CF-Ray' });
      return evidence;
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'Hosting/CDN',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (header(input, 'x-vercel-id')) {
        evidence.push({ signal: 'header', detail: 'Header X-Vercel-Id' });
      }
      const server = header(input, 'server');
      if (server && /vercel/i.test(server)) {
        evidence.push({ signal: 'header', detail: `Server: ${server}` });
      }
      return evidence;
    },
  },
  {
    id: 'netlify',
    name: 'Netlify',
    category: 'Hosting/CDN',
    singleSignalConfidence: 'alta',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (header(input, 'x-nf-request-id')) {
        evidence.push({ signal: 'header', detail: 'Header X-NF-Request-Id' });
      }
      const server = header(input, 'server');
      if (server && /netlify/i.test(server)) {
        evidence.push({ signal: 'header', detail: `Server: ${server}` });
      }
      return evidence;
    },
  },
  {
    id: 'firebase',
    name: 'Firebase',
    category: 'Backend',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.firebase) evidence.push({ signal: 'dom', detail: 'window.firebase disponible' });
      const sdk = findUrl(input, ['__/firebase/init.js', 'firebase-app.js', 'firebase.js']);
      if (sdk) evidence.push({ signal: 'recurso', detail: sdk });
      if (input.htmlLower.includes('firebaseapp.com')) {
        evidence.push({ signal: 'html', detail: 'Dominio firebaseapp.com' });
      }
      return evidence;
    },
  },
  {
    id: 'jquery',
    name: 'jQuery',
    category: 'Librería',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      if (input.dom.jquery) evidence.push({ signal: 'dom', detail: 'window.jQuery disponible' });
      const asset = findUrl(input, ['/jquery', 'jquery.min.js', 'jquery-']);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap',
    category: 'Librería',
    singleSignalConfidence: 'media',
    detect: (input) => {
      const evidence: Evidence[] = [];
      const asset = findUrl(input, [
        'bootstrap.min.css',
        'bootstrap.css',
        'bootstrap.bundle',
        'bootstrap.min.js',
      ]);
      if (asset) evidence.push({ signal: 'recurso', detail: asset });
      return evidence;
    },
  },
];

function confidenceFor(rule: Rule, evidence: Evidence[]): Confidence {
  if (evidence.length >= 2) return 'alta';
  return rule.singleSignalConfidence ?? 'media';
}

function addDerivedFrameworks(technologies: DetectedTechnology[]): DetectedTechnology[] {
  const ids = new Set(technologies.map((technology) => technology.id));
  const derived: DetectedTechnology[] = [];

  const reactBased = (
    [
      ['next', 'Next.js'],
      ['remix', 'Remix'],
      ['gatsby', 'Gatsby'],
    ] as const
  ).find(([id]) => ids.has(id));

  if (reactBased && !ids.has('react')) {
    const [, name] = reactBased;
    derived.push({
      id: 'react',
      name: 'React',
      category: 'Librería',
      confidence: 'alta',
      evidence: [{ signal: 'framework', detail: `${name} está construido sobre React` }],
    });
    ids.add('react');
  }

  if (ids.has('nuxt') && !ids.has('vue')) {
    derived.push({
      id: 'vue',
      name: 'Vue',
      category: 'Librería',
      confidence: 'alta',
      evidence: [{ signal: 'framework', detail: 'Nuxt está construido sobre Vue' }],
    });
  }

  if (ids.has('sveltekit') && !ids.has('svelte')) {
    derived.push({
      id: 'svelte',
      name: 'Svelte',
      category: 'Librería',
      confidence: 'alta',
      evidence: [{ signal: 'framework', detail: 'SvelteKit está construido sobre Svelte' }],
    });
  }

  return [...technologies, ...derived];
}

function addInferredStacks(technologies: DetectedTechnology[]): DetectedTechnology[] {
  const ids = new Set(technologies.map((technology) => technology.id));
  const fullstackFramework = ['next', 'remix', 'gatsby', 'nuxt', 'sveltekit', 'astro'].some((id) =>
    ids.has(id),
  );
  if (fullstackFramework) return technologies;

  const backend =
    technologies.find((technology) => technology.id === 'express') ??
    technologies.find((technology) => technology.id === 'node');
  if (!backend) return technologies;

  const inferred: DetectedTechnology[] = [];

  if (ids.has('react')) {
    inferred.push({
      id: 'mern',
      name: 'MERN (probable)',
      category: 'Stack',
      confidence: backend.id === 'express' ? 'media' : 'baja',
      evidence: [
        { signal: 'frontend', detail: 'React detectado' },
        {
          signal: 'backend',
          detail:
            backend.id === 'express'
              ? `Express detectado: ${backend.evidence[0]?.detail ?? 'X-Powered-By'}`
              : 'Node.js detectado',
        },
        { signal: 'limitación', detail: 'MongoDB no es detectable desde el cliente' },
      ],
    });
  }

  if (ids.has('angular')) {
    inferred.push({
      id: 'mean',
      name: 'MEAN (probable)',
      category: 'Stack',
      confidence: backend.id === 'express' ? 'media' : 'baja',
      evidence: [
        { signal: 'frontend', detail: 'Angular detectado' },
        {
          signal: 'backend',
          detail:
            backend.id === 'express'
              ? `Express detectado: ${backend.evidence[0]?.detail ?? 'X-Powered-By'}`
              : 'Node.js detectado',
        },
        { signal: 'limitación', detail: 'MongoDB no es detectable desde el cliente' },
      ],
    });
  }

  return [...technologies, ...inferred];
}

function compareTechnologies(a: DetectedTechnology, b: DetectedTechnology): number {
  return (
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
    a.name.localeCompare(b.name)
  );
}

export function detectStack(input: StackInput): StackReport {
  const prepared = prepare(input);
  const technologies: DetectedTechnology[] = [];

  for (const rule of RULES) {
    const evidence = rule.detect(prepared);
    if (evidence.length === 0) continue;

    technologies.push({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      confidence: confidenceFor(rule, evidence),
      evidence,
    });
  }

  const withInferred = addInferredStacks(addDerivedFrameworks(technologies));
  const sorted = [...withInferred].sort(compareTechnologies);

  const notes = [
    'La detección de tecnología es heurística y se basa en señales públicas del sitio; puede haber falsos positivos o negativos.',
  ];
  if (sorted.some((technology) => technology.id === 'mern' || technology.id === 'mean')) {
    notes.push(
      'MongoDB no es detectable desde el cliente: MERN/MEAN se infiere a partir de React/Angular + Node/Express.',
    );
  }
  if (sorted.some((technology) => technology.id === 'next' || technology.id === 'nuxt')) {
    notes.push(
      'El framework detectado es fullstack; no se infiere MERN/MEAN aunque use Node.js internamente.',
    );
  }

  return {
    technologies: sorted,
    primaryStack: sorted.map((technology) => technology.name),
    notes,
  };
}

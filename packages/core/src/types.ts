export type Confidence = 'alta' | 'media' | 'baja';

export type TechnologyCategory =
  | 'CMS'
  | 'Framework'
  | 'Librería'
  | 'Runtime'
  | 'Backend'
  | 'E-commerce'
  | 'Hosting/CDN'
  | 'Base de datos'
  | 'Stack';

export interface DomSignals {
  nextData: boolean;
  nuxt: boolean;
  vue: boolean;
  angular: boolean;
  react: boolean;
  sveltekit: boolean;
  remix: boolean;
  firebase: boolean;
  jquery: boolean;
  gatsby: boolean;
  ngVersion: string | null;
  hasRoot: boolean;
  hasNextRoot: boolean;
  hasApp: boolean;
  metaGenerator: string | null;
  scriptSrcs: string[];
  linkHrefs: string[];
}

export interface ResourceEntry {
  name: string;
  initiatorType: string;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  duration: number;
}

export interface HttpProbe {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  setCookies: string[];
  contentType: string | null;
  html: string;
  htmlBytes: number;
  truncated: boolean;
  redirectChain: string[];
  elapsedMs: number;
  error?: string;
}

export interface ResourceProbe {
  url: string;
  finalUrl: string;
  status: number;
  found: boolean;
  contentType: string | null;
  bytes: number;
  text: string;
  urlsCount: number;
  error?: string;
}

export interface SiteProbe {
  robots: ResourceProbe;
  sitemap: ResourceProbe;
  sitemapsDeclared: string[];
}

export interface RenderedPage {
  url: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  html: string;
  title: string;
  cookieNames: string[];
  resources: ResourceEntry[];
  links: string[];
  consoleErrors: string[];
  dom: DomSignals;
  elapsedMs: number;
  error?: string;
}

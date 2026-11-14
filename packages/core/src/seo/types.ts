export type CheckStatus = 'pass' | 'warn' | 'fail';

export type Severity = 'critico' | 'alto' | 'medio' | 'bajo';

export type SeoCategory = 'on-page' | 'tecnico' | 'contenido' | 'accesibilidad';

export interface SeoCheck {
  id: string;
  category: SeoCategory;
  status: CheckStatus;
  severity: Severity;
  title: string;
  detail: string;
  evidence?: string;
  fix?: string;
  pageUrl?: string;
}

export interface HreflangEntry {
  hreflang: string;
  href: string;
}

export interface PageSeoData {
  url: string;
  status: number | null;
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  canonical: string | null;
  lang: string | null;
  viewport: string | null;
  h1Count: number;
  headings: Array<{ level: number; text: string }>;
  imageCount: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  wordCount: number;
  openGraph: { title: boolean; description: boolean; image: boolean };
  twitterCard: { card: boolean; title: boolean; description: boolean };
  jsonLdCount: number;
  jsonLdValid: boolean;
  jsonLdTypes: string[];
  hreflangs: HreflangEntry[];
  mixedContentCount: number;
}

export interface PageSeoResult {
  url: string;
  data: PageSeoData;
  checks: SeoCheck[];
}

export interface SeoSummary {
  pass: number;
  warn: number;
  fail: number;
}

export interface SiteSeoResult {
  checks: SeoCheck[];
  pages: PageSeoResult[];
  summary: SeoSummary;
}

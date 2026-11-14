export const DEFAULT_MAX_PAGES = 10;

export class UsageError extends Error {}

export interface CliOptions {
  url: string;
  maxPages: number;
  output?: string;
  lighthouse: boolean;
  allowPrivate: boolean;
  timeoutMs?: number;
  json: boolean;
  keywords: boolean;
  locale?: string;
  country?: string;
  refreshKeywords: boolean;
  csv: boolean;
  negativeTerms: string[];
  help: boolean;
}

function readNumber(
  argv: string[],
  index: number,
  flag: string,
  inlineValue: string | undefined,
): { value: number; consumed: number } {
  const raw = inlineValue ?? argv[index + 1];
  if (raw === undefined) throw new UsageError(`Falta el valor de ${flag}.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`El valor de ${flag} debe ser un número positivo.`);
  }
  return { value, consumed: inlineValue === undefined ? 1 : 0 };
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    url: '',
    maxPages: DEFAULT_MAX_PAGES,
    lighthouse: true,
    allowPrivate: false,
    json: false,
    keywords: true,
    refreshKeywords: false,
    csv: false,
    negativeTerms: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (!arg.startsWith('-')) {
      if (options.url) throw new UsageError('Solo se admite una URL.');
      options.url = arg;
      continue;
    }

    const [flag, inlineValue] = arg.split(/=(.*)/s, 2);

    switch (flag) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--max-pages': {
        const { value, consumed } = readNumber(argv, index, '--max-pages', inlineValue);
        options.maxPages = Math.floor(value);
        index += consumed;
        break;
      }
      case '--timeout': {
        const { value, consumed } = readNumber(argv, index, '--timeout', inlineValue);
        options.timeoutMs = Math.floor(value);
        index += consumed;
        break;
      }
      case '--out':
      case '--output': {
        const value = inlineValue ?? argv[index + 1];
        if (!value) throw new UsageError('Falta el valor de --out.');
        options.output = value;
        if (inlineValue === undefined) index += 1;
        break;
      }
      case '--no-lighthouse':
        options.lighthouse = false;
        break;
      case '--allow-private':
        options.allowPrivate = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-keywords':
        options.keywords = false;
        break;
      case '--locale': {
        const value = inlineValue ?? argv[index + 1];
        if (!value) throw new UsageError('Falta el valor de --locale.');
        options.locale = value;
        if (inlineValue === undefined) index += 1;
        break;
      }
      case '--country': {
        const value = inlineValue ?? argv[index + 1];
        if (!value) throw new UsageError('Falta el valor de --country.');
        options.country = value.toUpperCase();
        if (inlineValue === undefined) index += 1;
        break;
      }
      case '--refresh-keywords':
        options.refreshKeywords = true;
        break;
      case '--csv':
        options.csv = true;
        break;
      case '--negative': {
        const value = inlineValue ?? argv[index + 1];
        if (!value) throw new UsageError('Falta el valor de --negative.');
        options.negativeTerms.push(
          ...value
            .split(',')
            .map((term) => term.trim())
            .filter(Boolean),
        );
        if (inlineValue === undefined) index += 1;
        break;
      }
      default:
        throw new UsageError(`Opción desconocida: ${flag}.`);
    }
  }

  if (!options.url && !options.help) throw new UsageError('Falta la URL a auditar.');

  return options;
}

export function reportFileName(url: string, date: Date): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = url;
  }
  const safeHost = host.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '') || 'sitio';
  const isoDate = date.toISOString().slice(0, 10);
  return `seo-audit-${safeHost}-${isoDate}.md`;
}

export function resolveReportPath(output: string | undefined, fileName: string): string {
  const path = output?.trim();
  if (!path) return `reports/${fileName}`;
  return path.toLowerCase().endsWith('.md') ? path : `${path.replace(/[\\/]+$/, '')}/${fileName}`;
}

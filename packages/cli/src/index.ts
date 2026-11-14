import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  inspectSite,
  renderMarkdownReport,
  toAuditData,
  type CrawlProgress,
  type CrawledPage,
  type InspectResult,
} from '@seo-audit/core';
import {
  parseArgs,
  reportFileName,
  resolveReportPath,
  UsageError,
  type CliOptions,
} from './args.js';

const HELP = `Uso: seo-audit <url> [opciones]

Opciones:
  --max-pages N       Páginas internas a rastrear (por defecto 10).
  --out RUTA          Archivo .md o carpeta de salida (por defecto reports/).
  --json              Escribe también un JSON con los datos de la auditoría.
  --no-lighthouse     Omite la medición de rendimiento con Lighthouse.
  --timeout MS        Tiempo máximo por petición y navegación (ms).
  --allow-private     Permite auditar hosts privados o locales (¡solo en desarrollo!).
  -h, --help          Muestra esta ayuda.

Ejemplos:
  npm run audit -- https://example.com
  npm run audit -- https://example.com --max-pages 5 --out informes/ejemplo.md`;

export interface RunCliDeps {
  inspect?: typeof inspectSite;
  now?: () => Date;
  log?: (message: string) => void;
  progress?: (message: string) => void;
  error?: (message: string) => void;
}

function scorePercent(score: number | null | undefined): string {
  return score === null || score === undefined ? '—' : `${Math.round(score * 100)}/100`;
}

async function writeReport(
  options: CliOptions,
  result: InspectResult,
  generatedAt: Date,
): Promise<{ reportPath: string; jsonPath: string | null }> {
  const fileName = reportFileName(result.probe.finalUrl || options.url, generatedAt);
  const reportPath = resolve(resolveReportPath(options.output, fileName));
  const markdown = renderMarkdownReport(result, { generatedAt });

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdown, 'utf8');

  if (!options.json) return { reportPath, jsonPath: null };

  const jsonPath = reportPath.toLowerCase().endsWith('.md')
    ? `${reportPath.slice(0, -3)}.json`
    : `${reportPath}.json`;
  const data = toAuditData(result, generatedAt);
  await writeFile(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { reportPath, jsonPath };
}

export async function runCli(argv: string[], deps: RunCliDeps = {}): Promise<number> {
  const log = deps.log ?? ((message: string) => console.log(message));
  const progress = deps.progress ?? ((message: string) => console.error(message));
  const error = deps.error ?? ((message: string) => console.error(message));
  const now = deps.now ?? (() => new Date());
  const inspect = deps.inspect ?? inspectSite;

  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (parseError) {
    if (parseError instanceof UsageError) {
      error(parseError.message);
      error('Usa --help para ver las opciones disponibles.');
      return 2;
    }
    throw parseError;
  }

  if (options.help) {
    log(HELP);
    return 0;
  }

  const started = Date.now();
  const onPage = (page: CrawledPage, crawlProgress: CrawlProgress): void => {
    progress(`[${crawlProgress.crawled}/${crawlProgress.maxPages}] ${page.finalUrl}`);
  };

  try {
    const result = await inspect(options.url, {
      maxPages: options.maxPages,
      allowPrivateHosts: options.allowPrivate,
      timeoutMs: options.timeoutMs,
      lighthouse: options.lighthouse,
      onPage,
    });

    const generatedAt = now();
    const { reportPath, jsonPath } = await writeReport(options, result, generatedAt);
    const seconds = ((Date.now() - started) / 1000).toFixed(1).replace('.', ',');
    const { pass, warn, fail } = result.seo.summary;

    log(`Auditoría completada en ${seconds} s.`);
    log(`Comprobaciones: ${pass} correctas, ${warn} avisos, ${fail} fallos.`);

    if (result.lighthouse && !result.lighthouse.error) {
      const { scores } = result.lighthouse;
      log(
        `Lighthouse: Rendimiento ${scorePercent(scores.performance)} · Accesibilidad ${scorePercent(scores.accessibility)} · Buenas prácticas ${scorePercent(scores.bestPractices)} · SEO ${scorePercent(scores.seo)}.`,
      );
    } else if (result.lighthouse?.error) {
      log(`Lighthouse no pudo completarse: ${result.lighthouse.error}`);
    }

    log(`Informe: ${reportPath}`);
    if (jsonPath) log(`JSON: ${jsonPath}`);
    return 0;
  } catch (runError) {
    error(runError instanceof Error ? runError.message : String(runError));
    return 1;
  }
}

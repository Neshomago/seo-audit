import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    : null,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((candidate): candidate is string => Boolean(candidate));

export function resolveChromePath(): string {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    'No se encontró Google Chrome. Instálalo o define la variable de entorno CHROME_PATH con la ruta al ejecutable.',
  );
}

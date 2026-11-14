import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

interface CacheEntry<T> {
  cachedAt: string;
  value: T;
}

function cachePath(cacheDir: string, key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return resolve(cacheDir, 'keywords', `${hash}.json`);
}

export async function readCache<T>(
  cacheDir: string,
  key: string,
  ttlMs: number,
  now: Date,
): Promise<{ value: T; cachedAt: Date } | null> {
  try {
    const raw = await readFile(cachePath(cacheDir, key), 'utf8');
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const cachedAt = new Date(entry.cachedAt);
    if (Number.isNaN(cachedAt.getTime()) || now.getTime() - cachedAt.getTime() > ttlMs) return null;
    return { value: entry.value, cachedAt };
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  cacheDir: string,
  key: string,
  value: T,
  now: Date,
): Promise<void> {
  try {
    const path = cachePath(cacheDir, key);
    await mkdir(dirname(path), { recursive: true });
    const entry: CacheEntry<T> = { cachedAt: now.toISOString(), value };
    await writeFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    return;
  }
}

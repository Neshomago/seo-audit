export interface JsonRequestOptions {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  init?: RequestInit;
  attempts?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(url: string, options: JsonRequestOptions): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await options.fetchImpl(url, {
        ...options.init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });

      if (response.ok) return (await response.json()) as T;

      lastError = new Error(`HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!/HTTP (429|5\d\d)/.test(lastError.message) && !/fetch failed/i.test(lastError.message)) {
        throw lastError;
      }
    }

    if (attempt < attempts) await wait(250 * attempt);
  }

  throw lastError ?? new Error('No se pudo completar la petición.');
}

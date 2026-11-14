import { describe, expect, it } from 'vitest';
import { runCli } from './index.js';

describe('runCli', () => {
  it('muestra la ayuda sin auditar', async () => {
    const logs: string[] = [];
    const code = await runCli(['--help'], { log: (message) => logs.push(message) });

    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('Uso: seo-audit <url>');
    expect(logs.join('\n')).toContain('--max-pages');
    expect(logs.join('\n')).toContain('--no-keywords');
  });

  it('devuelve código 2 si faltan argumentos', async () => {
    const errors: string[] = [];
    const code = await runCli([], { error: (message) => errors.push(message) });

    expect(code).toBe(2);
    expect(errors.join('\n')).toContain('Falta la URL');
  });
});

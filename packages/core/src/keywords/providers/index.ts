import type { KeywordConfig } from '../config.js';
import type {
  KeywordProvider,
  KeywordProviderInput,
  KeywordProviderResult,
} from '../types.js';
import { createBingProvider } from './bing.js';
import { createGscProvider } from './gsc.js';

export function createKeywordProviders(config: KeywordConfig): KeywordProvider[] {
  return [createGscProvider(config.gsc), createBingProvider(config.bing)];
}

export async function loadKeywordProviders(
  config: KeywordConfig,
  input: KeywordProviderInput,
): Promise<KeywordProviderResult[]> {
  const providers = createKeywordProviders(config);

  return Promise.all(
    providers.map(async (provider) => {
      try {
        return await provider.load(input);
      } catch (error) {
        return {
          status: {
            provider: provider.id,
            status: 'error',
            message: error instanceof Error ? error.message : 'Error inesperado.',
            property: null,
            fetchedAt: null,
            rows: 0,
            truncated: false,
            cached: false,
          },
          rows: [],
        };
      }
    }),
  );
}

export { createBingProvider, createGscProvider };

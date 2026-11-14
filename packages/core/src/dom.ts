import type { DomSignals } from './types.js';

export function createEmptyDom(): DomSignals {
  return {
    nextData: false,
    nuxt: false,
    vue: false,
    angular: false,
    react: false,
    sveltekit: false,
    remix: false,
    firebase: false,
    jquery: false,
    gatsby: false,
    ngVersion: null,
    hasRoot: false,
    hasNextRoot: false,
    hasApp: false,
    metaGenerator: null,
    scriptSrcs: [],
    linkHrefs: [],
  };
}

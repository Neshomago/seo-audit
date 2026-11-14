const SPANISH_STOPWORDS = new Set([
  'a',
  'al',
  'algo',
  'algunas',
  'algunos',
  'ante',
  'antes',
  'como',
  'con',
  'contra',
  'cual',
  'cuando',
  'de',
  'del',
  'desde',
  'donde',
  'durante',
  'e',
  'el',
  'ella',
  'ellas',
  'ellos',
  'en',
  'entre',
  'era',
  'eres',
  'es',
  'esa',
  'esas',
  'ese',
  'eso',
  'esos',
  'esta',
  'estas',
  'este',
  'esto',
  'estos',
  'fue',
  'fueron',
  'ha',
  'han',
  'hasta',
  'hay',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'mas',
  'me',
  'mi',
  'mis',
  'mucho',
  'muy',
  'nada',
  'ni',
  'no',
  'nos',
  'nosotros',
  'o',
  'os',
  'otra',
  'otras',
  'otro',
  'otros',
  'para',
  'pero',
  'poco',
  'por',
  'porque',
  'que',
  'quien',
  'se',
  'sea',
  'segun',
  'ser',
  'si',
  'sin',
  'sobre',
  'son',
  'su',
  'sus',
  'te',
  'tiene',
  'tu',
  'tus',
  'un',
  'una',
  'uno',
  'unos',
  'y',
  'ya',
  'tambien',
  'tras',
  'mediante',
  'puede',
  'pueden',
  'hacer',
  'hace',
  'todo',
  'toda',
  'todos',
  'todas',
  'como',
  'que',
  'cual',
  'donde',
  'cuando',
  'quien',
  'cuanto',
]);

const ENGLISH_STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'before',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'more',
  'most',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'other',
  'our',
  'over',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'these',
  'they',
  'this',
  'those',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

export function foldText(value: string): string {
  const prepared = value
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/ñ/g, '\u0001');
  return prepared
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0001/g, 'ñ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length > 1) ?? [];
}

export function isStopword(token: string, locale = 'es-ES'): boolean {
  const folded = foldText(token);
  if (locale.toLowerCase().startsWith('en')) return ENGLISH_STOPWORDS.has(folded);
  return SPANISH_STOPWORDS.has(folded) || ENGLISH_STOPWORDS.has(folded);
}

export function isUsefulPhrase(tokens: string[], locale = 'es-ES'): boolean {
  if (tokens.length === 0) return false;
  if (tokens.every((token) => isStopword(token, locale))) return false;
  return !isStopword(tokens[0] ?? '', locale) && !isStopword(tokens.at(-1) ?? '', locale);
}

export function normalizeKeyword(value: string): string {
  return foldText(value);
}

export function displayKeyword(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

import type { KeywordIntent } from './types.js';

const NAVIGATIONAL = ['login', 'iniciar sesion', 'log in', 'sign in', 'acceder', 'area privada'];
const LOCAL = [
  'cerca',
  'cerca de',
  'cerca de mi',
  'como llegar',
  'horario',
  'direccion',
  'telefono',
  'sucursal',
  'local',
  'a domicilio',
  'en mi ciudad',
];
const TRANSACTIONAL = [
  'comprar',
  'contratar',
  'reservar',
  'pedir',
  'presupuesto',
  'precio',
  'precios',
  'tarifa',
  'tarifas',
  'oferta',
  'ofertas',
  'descuento',
  'cuanto cuesta',
  'cuanto vale',
  'tienda online',
  'solicitar',
];
const COMMERCIAL = [
  'mejor',
  'mejores',
  'comparativa',
  'comparacion',
  'comparar',
  'opiniones',
  'resenas',
  'alternativas',
  'alternativa',
  'top',
  'versus',
  'vs',
  'analisis',
];
const INFORMATIONAL = [
  'que es',
  'como',
  'cuando',
  'donde',
  'por que',
  'guia',
  'tutorial',
  'ejemplos',
  'ejemplo',
  'significado',
  'diferencia',
  'diferencias',
  'funciona',
  'funcionamiento',
  'aprender',
  'pasos',
];

function hasPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(text);
}

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => hasPhrase(text, phrase));
}

function brandOf(host: string): string {
  return host
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')[0]
    ?.replace(/[^a-z0-9ñ-]/g, '') ?? '';
}

export function detectIntent(normalized: string, host: string): KeywordIntent {
  const brand = brandOf(host);

  if ((brand.length >= 3 && hasPhrase(normalized, brand)) || hasAny(normalized, NAVIGATIONAL)) {
    return 'navegacional';
  }
  if (hasAny(normalized, LOCAL)) return 'local';
  if (hasAny(normalized, TRANSACTIONAL)) return 'transaccional';
  if (hasAny(normalized, COMMERCIAL)) return 'comercial';
  if (hasAny(normalized, INFORMATIONAL)) return 'informacional';
  return 'desconocida';
}

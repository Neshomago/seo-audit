# Análisis de palabras clave

La auditoría genera oportunidades de palabras clave combinando señales on-page con datos de Google Search Console (GSC) y Bing Webmaster cuando están disponibles. No usa scraping ni proveedores SERP no oficiales.

## Qué genera

- **Positivas**: términos y frases detectados en title, headings, meta description, URL, alt, anchors y cuerpo, con intención, score, confianza, fuentes, página recomendada y acción editorial.
- **Negativas**: sugerencias para contenido y campañas (términos de empleo, gratis, descargas, etc.) y las que añadas manualmente. Nunca se aplican solas.
- **Clusters**: agrupaciones por término principal para orientar la arquitectura de contenido.
- **Canibalización**: keywords con presencia en varias páginas que conviene consolidar.
- **CSV**: exportación de positivas y negativas con BOM UTF-8 y protección contra fórmulas de Excel.

El análisis on-page se ejecuta siempre que `keywords` esté activo, aunque el dominio no esté verificado. GSC y Bing solo se consultan si el dominio está verificado y hay credenciales; si no, la auditoría continúa solo con on-page.

## Fuentes y requisitos

| Fuente | Datos | Requisito |
| --- | --- | --- |
| On-page | Términos, ubicación, intención, clusters, canibalización | Ninguno |
| Google Search Console | Impresiones, clics, CTR y posición media | Propiedad verificada + OAuth |
| Bing Webmaster | Impresiones, clics, CTR y posición media | Sitio verificado + API key |

GSC devuelve hasta 25.000 filas por petición y usa una ventana de 28 días con 3 días de retraso. Bing suele devolver menos filas y sus métricas no son comparables con las de GSC. Los volúmenes de búsqueda de Google Ads o Microsoft Ads no forman parte de esta versión.

## Configuración

La aplicación **no carga archivos `.env` automáticamente**. Define las variables en tu shell, en el servicio que ejecute la CLI o en tu gestor de secretos. No uses variables `VITE_*` para secretos: acabarían en el bundle del navegador.

| Variable | Uso |
| --- | --- |
| `SEO_AUDIT_GSC_CLIENT_ID` | Cliente OAuth de Google Cloud |
| `SEO_AUDIT_GSC_CLIENT_SECRET` | Secreto del cliente OAuth |
| `SEO_AUDIT_GSC_REFRESH_TOKEN` | Refresh token con acceso de lectura a GSC |
| `SEO_AUDIT_GSC_ACCESS_TOKEN` | Alternativa directa al refresh token (caduca) |
| `SEO_AUDIT_BING_API_KEY` | API key de Bing Webmaster |
| `SEO_AUDIT_KEYWORDS_LOCALE` | Locale por defecto (`es-ES`) |
| `SEO_AUDIT_KEYWORDS_COUNTRY` | País por defecto (`ES`) |
| `SEO_AUDIT_CACHE_DIR` | Carpeta de caché (`.cache/seo-audit`) |

### Google Search Console

1. Crea o reutiliza un proyecto en Google Cloud y habilita la Search Console API.
2. Configura una pantalla de consentimiento OAuth y un cliente de tipo aplicación de escritorio.
3. Obtén un refresh token con el scope `https://www.googleapis.com/auth/webmasters.readonly`.
4. Verifica la propiedad en GSC. La herramienta busca una propiedad de dominio (`sc-domain:ejemplo.com`) o de prefijo de URL que coincida con el host auditado.
5. Exporta `SEO_AUDIT_GSC_CLIENT_ID`, `SEO_AUDIT_GSC_CLIENT_SECRET` y `SEO_AUDIT_GSC_REFRESH_TOKEN`.

La herramienta no guarda tokens en los informes ni en la caché. El access token se obtiene en memoria y no se persiste.

### Bing Webmaster

1. Verifica el sitio en [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. Genera una API key en la configuración de la cuenta.
3. Exporta `SEO_AUDIT_BING_API_KEY`.

La integración usa la API REST/JSON de Bing Webmaster. Las APIs SOAP/POX heredadas se retiraron el 2026-08-31 y las Bing Search APIs se retiraron el 2025-08-11; no se usan.

## Uso

### CLI

```powershell
# Análisis on-page + GSC/Bing si hay credenciales
npm run audit -- https://example.com

# Desactivar keywords
npm run audit -- https://example.com --no-keywords

# Cambiar idioma y añadir negativas
npm run audit -- https://example.com --locale en-US --negative "empleo,gratis"

# Forzar consulta externa sin caché y exportar CSV
npm run audit -- https://example.com --refresh-keywords --csv
```

| Opción | Descripción |
| --- | --- |
| `--no-keywords` | Desactiva el análisis de keywords. |
| `--locale LOCALE` | Locale para stopwords e intención (`es-ES`, `en-US`). |
| `--country CC` | País para filtrar proveedores (por defecto `ES`). |
| `--refresh-keywords` | Ignora la caché de GSC/Bing. |
| `--csv` | Escribe CSV de positivas y negativas junto al informe. |
| `--negative TERMINO` | Añade una negativa manual; se puede repetir o separar por comas. |

Con `--csv` se generan `<informe>-keywords.csv` y `<informe>-negative-keywords.csv`.

### UI

El formulario permite activar o desactivar keywords, elegir idioma y añadir negativas manuales. El panel de resultados incluye filtros por texto, intención y fuente, tablas de positivas/negativas, estado de cada proveedor, clusters, limitaciones y descarga CSV.

## Caché

- Ubicación por defecto: `.cache/seo-audit` (ignorada por git).
- TTL: 24 horas.
- La clave incluye proveedor, propiedad, locale, país y ventana temporal.
- `--refresh-keywords` fuerza una consulta nueva.
- La caché no contiene tokens, secretos ni el HTML del sitio.

## Estados de proveedor

| Estado | Significado |
| --- | --- |
| `ok` | Datos obtenidos correctamente. |
| `partial` | Datos parciales o truncados. |
| `no-config` | Faltan credenciales. |
| `no-property` | El dominio no está verificado en el proveedor. |
| `error` | Error de red, autenticación o API; el resto de la auditoría continúa. |
| `skipped` | Proveedor omitido. |

## Límites

- No se prometen rankings ni volúmenes de búsqueda.
- Las métricas de GSC y Bing no son sumables ni directamente comparables.
- La intención y los clusters son heurísticos; requieren revisión editorial.
- Las negativas son sugerencias, no una lista definitiva para Ads.
- La caché local no sustituye un histórico ni una base de datos.
- El análisis no sustituye una investigación de palabras clave con datos de volumen de pago.

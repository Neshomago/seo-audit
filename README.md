# SEO Audit

Auditor SEO **local** con crawl renderizado en Chrome, medición con Lighthouse, análisis de palabras clave e informe accionable en Markdown. Incluye una CLI y una interfaz web que comparten el mismo motor.

El proyecto analiza una URL, detecta el stack tecnológico, rastrea páginas internas del mismo dominio y genera un informe en español con lo que funciona, los problemas encontrados por severidad, oportunidades de keywords y un plan de acción priorizado.

> Estado: MVP funcional. Sin base de datos. Todo se ejecuta en tu máquina con tu propia instalación de Chrome; GSC y Bing son opcionales y solo se consultan con credenciales y propiedades verificadas.

## Características

- **Crawl con navegador real**: Puppeteer + Chrome renderizan la home y hasta N páginas internas (10 por defecto, 30 en la UI).
- **Detección de stack**: 31 reglas de señal para identificar CMS, frameworks, e-commerce, backend, hosting/CDN y stacks compuestos (MERN/MEAN).
- **SEO on-page**: 18 comprobaciones por página (title, meta description, H1, canonical, idioma, viewport, Open Graph, Twitter Card, JSON-LD, imágenes, contenido, enlaces, robots, mixed content, URL, hreflang).
- **SEO técnico de sitio**: 12 comprobaciones (HTTPS, HSTS, CSP, cabeceras, redirecciones, robots.txt, sitemap, títulos/descripciones duplicados, estado del crawl).
- **Lighthouse local**: rendimiento, accesibilidad, buenas prácticas y SEO, con métricas FCP/LCP/TBT/CLS/SI/TTI y auditorías fallidas priorizadas.
- **Palabras clave**: análisis on-page de términos y frases, intención, clusters, canibalización, oportunidades, negativas y exportación CSV. GSC y Bing añaden impresiones, clics y posición si el dominio está verificado.
- **Fix contextual**: las recomendaciones se adaptan al stack detectado (WordPress, Next.js, Shopify, Laravel, Express, etc.).
- **Informe Markdown**: resumen ejecutivo, hallazgos prioritarios, problemas por severidad, palabras clave, plan de acción y anexo técnico. Exportación JSON y CSV opcional.
- **Dos interfaces**: CLI para automatizar y UI React para revisar resultados en el navegador.
- **Guard SSRF**: bloquea localhost, rangos privados/reservados y DNS que resuelva a IPs internas.

## Requisitos

| Requisito | Versión / nota |
| --- | --- |
| Node.js | `>= 22.19` (probado con 24.14.0) |
| npm | 10+ (probado con 11.9.0) |
| Google Chrome | Chrome estable instalado. También sirve Chromium. |
| Sistema | Windows, macOS o Linux |

Rutas de Chrome detectadas automáticamente: instalación estándar de Windows/macOS, `/usr/bin/google-chrome`, `/usr/bin/chromium`, etc. Si tu Chrome está en otra ruta, define `CHROME_PATH`:

```powershell
$env:CHROME_PATH = "C:\ruta\a\chrome.exe"
```

## Instalación

```powershell
git clone <tu-repositorio>
cd seo-audit
npm install
```

No se descarga ningún navegador: se usa el Chrome del sistema.

## Uso: CLI

```powershell
npm run audit -- https://example.com
```

Opciones:

| Opción | Descripción |
| --- | --- |
| `--max-pages N` | Páginas internas a rastrear (por defecto 10). |
| `--out RUTA` | Archivo `.md` o carpeta de salida (por defecto `reports/`). |
| `--json` | Escribe también un JSON con los datos estructurados. |
| `--no-lighthouse` | Omite Lighthouse (auditoría más rápida). |
| `--no-keywords` | Desactiva el análisis de palabras clave. |
| `--locale LOCALE` | Idioma de keywords (`es-ES` por defecto, también `en-US`). |
| `--country CC` | País para GSC/Bing (`ES` por defecto). |
| `--refresh-keywords` | Ignora la caché de GSC/Bing. |
| `--csv` | Exporta positivas y negativas en CSV junto al informe. |
| `--negative TERMINO` | Añade una negativa manual; se puede repetir o separar por comas. |
| `--timeout MS` | Timeout por petición y navegación. |
| `--allow-private` | Permite hosts privados/localhost. Solo para desarrollo. |
| `-h`, `--help` | Muestra la ayuda. |

Ejemplos:

```powershell
# Informe por defecto en reports/
npm run audit -- https://example.com

# 5 páginas, salida concreta y JSON
npm run audit -- https://example.com --max-pages 5 --out informes/ejemplo.md --json

# Sin Lighthouse y con más tiempo por navegación
npm run audit -- https://example.com --no-lighthouse --timeout 60000

# Keywords con negativas manuales y CSV
npm run audit -- https://example.com --negative "empleo,gratis" --csv

# Probar un sitio local (desactiva el guard SSRF)
npm run audit -- http://localhost:3000 --allow-private
```

GSC y Bing se configuran por variables de entorno. Consulta [`docs/KEYWORDS.md`](docs/KEYWORDS.md) para credenciales, requisitos, caché y exportación.

Códigos de salida: `0` éxito o ayuda, `1` error de ejecución, `2` error de uso (argumentos).

El progreso del crawl se escribe por stderr y el resumen por stdout. El informe se guarda en `reports/` (ignorado por git) salvo que indiques `--out`.

## Uso: interfaz web

```powershell
npm run dev
```

Abre <http://localhost:5173>. La UI llama a `POST /api/audit`, un middleware de Vite que ejecuta el mismo motor que la CLI.

Opciones de la UI:

- URL, número de páginas (1–30), Lighthouse y keywords on/off.
- Opciones avanzadas: idioma de keywords, negativas manuales y hosts privados (desactiva el guard SSRF).
- Panel de keywords con filtros, fuentes, clusters, limitaciones y descarga CSV.
- Descargar el informe `.md` o copiarlo al portapapeles.

Build de producción y previsualización:

```powershell
npm run build:web
npm run preview
```

`npm run preview` sirve el build en <http://localhost:4173> y también expone la API porque el plugin se registra en `configurePreviewServer`.

> Importante: `apps/web/dist` es solo el frontend estático. La API vive en el plugin de Vite; si publicas el `dist` en un hosting estático, el botón de auditoría no funcionará. La UI está pensada para ejecutarse en local.

## Informe generado

El Markdown contiene:

1. Resumen ejecutivo y hallazgos prioritarios.
2. Stack tecnológico detectado y evidencia.
3. Lo que ya funciona.
4. Problemas encontrados agrupados por severidad (`crítico`, `alto`, `medio`, `bajo`), con evidencia y cómo corregirlos.
5. Rendimiento y calidad (Lighthouse), métricas y oportunidades.
6. Palabras clave y oportunidades: positivas, canibalización, negativas, fuentes, clusters y limitaciones.
7. Accesibilidad y buenas prácticas.
8. Páginas analizadas.
9. Plan de acción priorizado (máximo 12 acciones; el resto queda en problemas).
10. Anexo técnico: redirecciones, robots.txt, sitemap, cabeceras y recursos pesados.
11. Limitaciones del análisis.

Con `--json` se genera un archivo hermano (mismo nombre, extensión `.json`) con `AuditData`: URL, fecha, estado, redirecciones, stack, resultados SEO, Lighthouse, keywords, resumen del crawl y recursos más pesados. Es la misma estructura que consume la UI.

Con `--csv` se generan `<informe>-keywords.csv` y `<informe>-negative-keywords.csv`. Los CSV incluyen BOM UTF-8 y protegen las celdas que empiezan por `=`, `+`, `-` o `@` para evitar fórmulas al abrirlos en Excel.

## Arquitectura

```
CLI ─┐
     ├─► inspectSite ─► probe HTTP ─► Chrome: render + crawl ─► detectStack
Web ─┘        │                                                        │
              └──────────────► analyzeSeo ◄───────────────────────────┘
                                    │
                              Lighthouse (Chrome aparte)
                                     │
                              analyzeKeywords
                          on-page + GSC/Bing opcional
                                     │
                    renderMarkdownReport / toAuditData / CSV
                                     │
                            .md / .json / .csv
```

Diagramas detallados (ASCII y Mermaid), contratos de datos y decisiones de diseño: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Fuente Mermaid independiente: [`docs/architecture.mmd`](docs/architecture.mmd). Configuración de GSC/Bing, caché y CSV: [`docs/KEYWORDS.md`](docs/KEYWORDS.md).

## Estructura del repositorio

```
seo-audit/
├─ packages/
│  ├─ core/                 # Motor: URL/SSRF, probe, render, crawl, stack, SEO, Lighthouse, informes
│  │  └─ src/
│  │     ├─ url.ts          # Normalización y guard SSRF
│  │     ├─ probe.ts        # HTTP con redirecciones manuales y límites
│  │     ├─ render.ts       # Puppeteer (Chrome headless)
│  │     ├─ crawl.ts        # BFS mismo host, dedupe y límite de páginas
│  │     ├─ detect/stack.ts # Reglas de detección de tecnologías
│  │     ├─ seo/            # Checks por página y de sitio + fixes contextuales
│  │     ├─ keywords/       # Análisis on-page, proveedores GSC/Bing, caché y scoring
│  │     ├─ perf/           # Lighthouse y resumen de auditorías
│  │     ├─ report/         # Markdown, JSON y CSV
│  │     └─ pipeline.ts     # Orquestación de inspectSite
│  └─ cli/                  # CLI: argumentos, ejecución y escritura de informes
├─ apps/
│  └─ web/                  # React 19 + Vite + Tailwind 4
│     ├─ server/audit-api.ts# Plugin Vite con POST /api/audit
│     ├─ server/audit-request.ts # Validación pura del payload
│     └─ src/               # UI, componentes y cliente de la API
├─ .github/workflows/ci.yml # Typecheck, lint, tests y build web
├─ docs/                    # Arquitectura, keywords y deuda técnica
├─ reports/                 # Informes generados (ignorado por git)
├─ .cache/                  # Caché de GSC/Bing (ignorada por git)
└─ package.json             # Workspaces y scripts raíz
```

## Seguridad

- **SSRF**: `assertSafeUrl` bloquea `localhost`, `.local`, `.internal`, metadata de cloud, IPv4 privadas/reservadas y IPv6 locales. Se valida la URL inicial y **cada salto** de redirección del probe HTTP.
- **Crawl acotado**: solo mismo host, máximo de páginas, sin assets, deduplicación y eliminación de parámetros de tracking.
- **Límites HTTP**: 5 MiB de HTML, 1 MiB para robots/sitemap, 5 redirecciones, timeouts.
- **API local**: cuerpo máximo 16 KiB, solo `POST /api/audit`; las URLs inseguras devuelven `400`.
- **Credenciales**: los tokens de GSC/Bing se leen del entorno y nunca se escriben en informes, CSV o caché. No uses variables `VITE_*` para secretos.
- **`--allow-private`** desactiva el guard SSRF. No lo uses con URLs no confiables.
- **Chrome**: la navegación y las subpeticiones dentro de Chrome no pasan por el guard SSRF. No expongas la API a Internet (ver deuda técnica TD-03).

## Límites conocidos

- No se respetan las directivas `Disallow` de `robots.txt`; solo se comprueba su existencia y se leen sitemaps declarados.
- Solo se rastrea un host (sin subdominios ni dominios externos).
- El crawl es secuencial: 30 páginas pueden tardar varios minutos.
- Lighthouse se ejecuta una vez por auditoría en emulación móvil; los valores varían entre ejecuciones.
- La detección de stack es heurística y puede tener falsos positivos/negativos.
- No hay base de datos, histórico, comparación entre ejecuciones ni autenticación.
- Las keywords on-page son heurísticas; intención y clusters requieren revisión editorial.
- GSC y Bing solo aportan datos de dominios verificados. Sus métricas no son comparables entre sí y no incluyen volúmenes de búsqueda de Ads.
- Las negativas son sugerencias y nunca se aplican automáticamente.
- Las comprobaciones automáticas no sustituyen una revisión manual de contenido, intención de búsqueda o estrategia editorial.

## Desarrollo

```powershell
npm run check      # typecheck + lint + tests
npm test           # 108 tests (Vitest)
npm run typecheck  # TypeScript estricto en todos los workspaces
npm run lint       # ESLint
npm run smoke -- https://example.com --max-pages 1 --no-lighthouse
npm run build:web  # build del frontend
```

Estructura de tests: unitarios de URL/SSRF, crawl, detección de stack, checks SEO, resumen de Lighthouse (con Chrome mockeado), keywords, proveedores, caché, informes Markdown/CSV, argumentos y CLI; validación y handler de `/api/audit`, cliente HTTP, filtros de keywords y render de componentes clave. Los tests no requieren Chrome, red ni credenciales.

CI: GitHub Actions ejecuta `npm ci`, `npm run check` y `npm run build:web` en cada push y pull request.

Auditoría de deuda técnica, riesgos y roadmap: [`docs/TECHNICAL-DEBT.md`](docs/TECHNICAL-DEBT.md).

Versionado y publicación: repositorio sin licencia definida todavía. Antes de hacerlo público, añade un archivo `LICENSE` acorde a tus intenciones (ver TD-07). Los paquetes son `private` y el core se consume como código TypeScript fuente; no está preparado para publicarse en npm (ver TD-02).

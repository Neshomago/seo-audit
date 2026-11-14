# SEO Audit

Auditor SEO **local** con crawl renderizado en Chrome, medición con Lighthouse e informe accionable en Markdown. Incluye una CLI y una interfaz web que comparten el mismo motor.

El proyecto analiza una URL, detecta el stack tecnológico, rastrea páginas internas del mismo dominio y genera un informe en español con lo que funciona, los problemas encontrados por severidad y un plan de acción priorizado.

> Estado: MVP funcional. Sin base de datos ni servicios externos. Todo se ejecuta en tu máquina con tu propia instalación de Chrome.

## Características

- **Crawl con navegador real**: Puppeteer + Chrome renderizan la home y hasta N páginas internas (10 por defecto, 30 en la UI).
- **Detección de stack**: 31 reglas de señal para identificar CMS, frameworks, e-commerce, backend, hosting/CDN y stacks compuestos (MERN/MEAN).
- **SEO on-page**: 18 comprobaciones por página (title, meta description, H1, canonical, idioma, viewport, Open Graph, Twitter Card, JSON-LD, imágenes, contenido, enlaces, robots, mixed content, URL, hreflang).
- **SEO técnico de sitio**: 12 comprobaciones (HTTPS, HSTS, CSP, cabeceras, redirecciones, robots.txt, sitemap, títulos/descripciones duplicados, estado del crawl).
- **Lighthouse local**: rendimiento, accesibilidad, buenas prácticas y SEO, con métricas FCP/LCP/TBT/CLS/SI/TTI y auditorías fallidas priorizadas.
- **Fix contextual**: las recomendaciones se adaptan al stack detectado (WordPress, Next.js, Shopify, Laravel, Express, etc.).
- **Informe Markdown**: resumen ejecutivo, hallazgos prioritarios, problemas por severidad, plan de acción y anexo técnico. Exportación JSON opcional.
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

# Probar un sitio local (desactiva el guard SSRF)
npm run audit -- http://localhost:3000 --allow-private
```

Códigos de salida: `0` éxito o ayuda, `1` error de ejecución, `2` error de uso (argumentos).

El progreso del crawl se escribe por stderr y el resumen por stdout. El informe se guarda en `reports/` (ignorado por git) salvo que indiques `--out`.

## Uso: interfaz web

```powershell
npm run dev
```

Abre <http://localhost:5173>. La UI llama a `POST /api/audit`, un middleware de Vite que ejecuta el mismo motor que la CLI.

Opciones de la UI:

- URL, número de páginas (1–30), Lighthouse on/off.
- Opciones avanzadas: permitir hosts privados (desactiva el guard SSRF).
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
6. Accesibilidad y buenas prácticas.
7. Páginas analizadas.
8. Plan de acción priorizado (máximo 12 acciones; el resto queda en problemas).
9. Anexo técnico: redirecciones, robots.txt, sitemap, cabeceras y recursos pesados.
10. Limitaciones del análisis.

Con `--json` se genera un archivo hermano (mismo nombre, extensión `.json`) con `AuditData`: URL, fecha, estado, redirecciones, stack, resultados SEO, Lighthouse, resumen del crawl y recursos más pesados. Es la misma estructura que consume la UI.

## Arquitectura

```
CLI ─┐
     ├─► inspectSite ─► probe HTTP ─► Chrome: render + crawl ─► detectStack
Web ─┘        │                                                        │
              └──────────────► analyzeSeo ◄───────────────────────────┘
                                    │
                             Lighthouse (Chrome aparte)
                                    │
                          renderMarkdownReport / toAuditData
                                    │
                                .md / .json
```

Diagramas detallados (ASCII y Mermaid), contratos de datos y decisiones de diseño: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Fuente Mermaid independiente: [`docs/architecture.mmd`](docs/architecture.mmd).

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
│  │     ├─ perf/           # Lighthouse y resumen de auditorías
│  │     ├─ report/         # Markdown y JSON
│  │     └─ pipeline.ts     # Orquestación de inspectSite
│  └─ cli/                  # CLI: argumentos, ejecución y escritura de informes
├─ apps/
│  └─ web/                  # React 19 + Vite + Tailwind 4
│     ├─ server/audit-api.ts# Plugin Vite con POST /api/audit
│     └─ src/               # UI, componentes y cliente de la API
├─ docs/                    # Arquitectura y deuda técnica
├─ reports/                 # Informes generados (ignorado por git)
└─ package.json             # Workspaces y scripts raíz
```

## Seguridad

- **SSRF**: `assertSafeUrl` bloquea `localhost`, `.local`, `.internal`, metadata de cloud, IPv4 privadas/reservadas y IPv6 locales. Se valida la URL inicial y **cada salto** de redirección del probe HTTP.
- **Crawl acotado**: solo mismo host, máximo de páginas, sin assets, deduplicación y eliminación de parámetros de tracking.
- **Límites HTTP**: 5 MiB de HTML, 1 MiB para robots/sitemap, 5 redirecciones, timeouts.
- **API local**: cuerpo máximo 16 KiB, solo `POST /api/audit`; las URLs inseguras devuelven `400`.
- **`--allow-private`** desactiva el guard SSRF. No lo uses con URLs no confiables.
- **Chrome**: la navegación y las subpeticiones dentro de Chrome no pasan por el guard SSRF. No expongas la API a Internet (ver deuda técnica TD-03).

## Límites conocidos

- No se respetan las directivas `Disallow` de `robots.txt`; solo se comprueba su existencia y se leen sitemaps declarados.
- Solo se rastrea un host (sin subdominios ni dominios externos).
- El crawl es secuencial: 30 páginas pueden tardar varios minutos.
- Lighthouse se ejecuta una vez por auditoría en emulación móvil; los valores varían entre ejecuciones.
- La detección de stack es heurística y puede tener falsos positivos/negativos.
- No hay base de datos, histórico, comparación entre ejecuciones ni autenticación.
- Las comprobaciones automáticas no sustituyen una revisión manual de contenido, intención de búsqueda o estrategia editorial.

## Desarrollo

```powershell
npm run check      # typecheck + lint + tests
npm test           # 63 tests (Vitest)
npm run typecheck  # TypeScript estricto en todos los workspaces
npm run lint       # ESLint
npm run smoke -- https://example.com --max-pages 1 --no-lighthouse
npm run build:web  # build del frontend
```

Estructura de tests: unitarios de URL/SSRF, crawl, detección de stack, checks SEO, resumen de Lighthouse (con Chrome mockeado), informe Markdown, argumentos y CLI. Los tests no requieren Chrome ni red.

Auditoría de deuda técnica, riesgos y roadmap: [`docs/TECHNICAL-DEBT.md`](docs/TECHNICAL-DEBT.md).

Versionado y publicación: repositorio sin licencia definida todavía. Antes de hacerlo público, añade un archivo `LICENSE` acorde a tus intenciones (ver TD-07). Los paquetes son `private` y el core se consume como código TypeScript fuente; no está preparado para publicarse en npm (ver TD-02).

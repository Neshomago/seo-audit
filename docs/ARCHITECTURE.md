# Arquitectura

Documento de referencia del proyecto `seo-audit`. Describe el contexto, los componentes, el flujo de datos, los contratos y las decisiones de diseño. Los diagramas están en ASCII (visibles en cualquier editor) y en Mermaid (GitHub, GitLab, VS Code, Obsidian y la mayoría de visores Markdown). La fuente Mermaid del diagrama principal está en [`architecture.mmd`](architecture.mmd).

## 1. Objetivo y alcance

El sistema responde a una pregunta: **¿qué problemas SEO, de rendimiento y de calidad tiene este sitio y cómo se corrigen con su stack actual?**

Alcance del MVP:

- Auditar una URL pública (o privada con `--allow-private`).
- Renderizar con Chrome real para sitios dependientes de JavaScript.
- Rastrear un número acotado de páginas internas del mismo host.
- Detectar tecnologías y adaptar las recomendaciones.
- Ejecutar Lighthouse en local.
- Analizar palabras clave on-page y, si hay credenciales y propiedad verificada, enriquecerlas con GSC y Bing.
- Entregar un informe Markdown y, opcionalmente, JSON y CSV.
- Ofrecer CLI y UI web sobre el mismo motor.

Fuera de alcance (por decisión de diseño):

- Persistencia, histórico, cuentas de usuario o multiusuario.
- Programación de auditorías o servicio en la nube.
- Comparación entre ejecuciones.
- Volúmenes de búsqueda de pago (Google Ads/Microsoft Ads), rankings SERP o Google Trends.
- Crawl de subdominios o dominios externos.

## 2. Contexto

```
                         +---------------------------+
                         |        Usuario/a          |
                         +-------------+-------------+
                                       |
                 +---------------------+---------------------+
                 |                                           |
       +---------v----------+                     +----------v-----------+
       | CLI                |                     | Navegador            |
       | npm run audit --   |                     | http://localhost:5173|
       +---------+----------+                     +----------+-----------+
                 |                                           |
                 |                                  +--------v-----------+
                 |                                  | UI React (apps/web)|
                 |                                  +--------+-----------+
                 |                                           | POST /api/audit
                 |                                  +--------v-----------+
                 |                                  | Plugin Vite        |
                 |                                  | audit-api.ts       |
                 |                                  +--------+-----------+
                 |                                           |
                 +------------------+------------------------+
                                    |
                          +---------v----------+
                          | packages/core      |
                          | inspectSite()      |
                          +---------+----------+
                                    |
          +-------------------------+--------------------------+
          |                         |                          |
 +--------v--------+      +---------v---------+      +---------v---------+
 | HTTP fetch      |      | Chrome (Puppeteer)|      | Lighthouse        |
 | probe/robots/   |      | render + crawl    |      | Chrome aparte     |
 | sitemap         |      |                   |      |                   |
 +-----------------+      +-------------------+      +-------------------+
```

El sistema hace peticiones HTTP al sitio auditado, habla con Chrome vía CDP en localhost y, solo si hay credenciales y propiedad verificada, consulta las APIs oficiales de GSC y Bing. No usa scraping ni proveedores SERP no oficiales.

## 3. Contenedores y componentes

### 3.1 Vista ASCII

```
+------------------------------- apps/web --------------------------------+
|  React 19 + Vite 8 + Tailwind 4                                        |
|  AuditForm -> App -> Summary / LighthousePanel / KeywordsPanel / IssuesPanel / PagesTable|
|                     |                                                   |
|                     | fetch('/api/audit')                               |
|                     v                                                   |
|  server/audit-api.ts (middleware Vite, dev y preview)                  |
|    - valida método y cuerpo (16 KiB)                                    |
|    - audit-request.ts normaliza maxPages, lighthouse, keywords, locale, negativas y allowPrivate|
|    - inspectSite() -> toAuditData() + renderMarkdownReport()           |
+----------------------------------+-------------------------------------+
                                   |
+------------------------------ packages/core ---------------------------+
|  pipeline.ts: inspectSite()                                            |
|                                                                        |
|  url.ts ---------> normalizeUrl + assertSafeUrl (SSRF)                 |
|  probe.ts -------> probeUrl + probeSite (robots, sitemap)              |
|  render.ts ------> launchBrowser + renderPage (Puppeteer)              |
|  crawl.ts -------> crawlSite (BFS mismo host, dedupe, maxPages)        |
|  detect/stack.ts -> detectStack (headers, HTML, cookies, DOM, assets)  |
|  seo/index.ts ---> analyzeSeo (page-checks + site-checks + fixes)      |
|  keywords/ -------> analyzeKeywords (on-page + GSC/Bing + caché)      |
|  perf/lighthouse  -> runLighthouse (chrome-launcher + Lighthouse)      |
|  report/markdown  -> renderMarkdownReport                             |
|  report/json -----> toAuditData                                       |
|  report/keywords-csv -> CSV positivas/negativas                       |
+----------------------------------+-------------------------------------+
                                   |
+------------------------------ packages/cli ---------------------------+
|  args.ts -> parseArgs / reportFileName / resolveReportPath             |
|  index.ts -> runCli (progreso, escritura .md/.json/.csv, códigos de salida)|
|  cli.ts --> entrypoint (process.argv)                                  |
+------------------------------------------------------------------------+
```

### 3.2 Vista Mermaid

```mermaid
flowchart TD
  subgraph Clientes
    UI["UI React (apps/web)"]
    CLI["CLI (packages/cli)"]
  end

  UI -->|"POST /api/audit"| API["Plugin Vite<br/>server/audit-api.ts"]
  CLI --> RUN["runCli"]

  API --> PIPE["inspectSite<br/>packages/core/pipeline.ts"]
  RUN --> PIPE

  PIPE --> GUARD["normalizeUrl + assertSafeUrl<br/>SSRF"]
  PIPE --> PROBE["probeUrl / probeSite<br/>HTTP + robots + sitemap"]
  PIPE --> BROWSER["launchBrowser<br/>Puppeteer + Chrome"]
  BROWSER --> RENDER["renderPage"]
  RENDER --> CRAWL["crawlSite BFS"]
  PIPE --> DETECT["detectStack"]
  PIPE --> SEO["analyzeSeo"]
  PIPE --> LH["runLighthouse<br/>chrome-launcher"]
  PIPE --> KEY["analyzeKeywords<br/>on-page + proveedores"]

  PROBE --> SEO
  CRAWL --> SEO
  DETECT --> SEO
  DETECT --> REPORT
  SEO --> REPORT["renderMarkdownReport / toAuditData"]
  LH --> REPORT
  KEY --> REPORT
  KEY -.->|"credenciales + propiedad"| GSC["GSC API"]
  KEY -.->|"credenciales + propiedad"| BING["Bing Webmaster API"]
  KEY --> CACHE[".cache/seo-audit"]
  REPORT --> OUT[".md / .json / .csv"]
  API --> UI
  RUN --> OUT
```

## 4. Flujo de una auditoría

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario / UI
  participant E as CLI o Vite API
  participant P as inspectSite
  participant G as Guard SSRF
  participant H as HTTP fetch
  participant C as Chrome (Puppeteer)
  participant D as detectStack
  participant S as analyzeSeo
  participant L as Lighthouse
  participant K as analyzeKeywords
  participant X as GSC / Bing

  U->>E: URL + opciones
  E->>P: inspectSite(url, options)
  P->>G: normalizeUrl + assertSafeUrl
  G-->>P: URL segura o UnsafeUrlError
  P->>H: GET home (redirecciones manuales)
  H-->>P: HttpProbe
  P->>H: GET robots.txt y sitemap
  H-->>P: SiteProbe
  P->>C: renderPage(home)
  C-->>P: RenderedPage
  P->>D: detectStack(señales)
  D-->>P: StackReport
  P->>C: crawlSite(BFS hasta maxPages)
  C-->>P: CrawlResult
  P->>S: analyzeSeo(pages, probe, site, stack)
  S-->>P: SiteSeoResult
  P->>L: runLighthouse(url)
  L-->>P: LighthouseResult (o error controlado)
  P->>K: analyzeKeywords(pages, options)
  K->>X: consulta opcional (si hay credenciales y propiedad)
  X-->>K: filas o estado controlado
  K-->>P: KeywordReport | null
  P-->>E: InspectResult
  E->>E: renderMarkdownReport / toAuditData / CSV
  E-->>U: Markdown + JSON + CSV
```

Pasos:

1. **Normalización y guard**: se añade `https://` si falta esquema, se elimina el hash y se valida el host (incluida resolución DNS).
2. **Probe HTTP**: `fetch` con `redirect: manual`; cada salto vuelve a pasar por el guard. Se leen cabeceras, cookies `Set-Cookie`, HTML limitado y cadena de redirecciones. En paralelo lógico (secuencial en código) se consultan `robots.txt` y sitemaps declarados o habituales.
3. **Render**: se lanza Chrome headless con Puppeteer. La home se navega con `networkidle2`, viewport 1366×900 y timeout de 45 s por defecto. Se capturan HTML final, título, cookies, recursos de `performance`, enlaces y errores de consola.
4. **Crawl**: BFS desde los enlaces de la home. Solo mismo host, sin assets, sin parámetros de tracking, deduplicado por host + path + query ordenada, con `maxPages` como tope. Los errores por página se registran y no abortan la auditoría.
5. **Detección de stack**: reglas sobre cabeceras, HTML, cookies, globals del DOM y URLs de recursos.
6. **SEO**: 18 comprobaciones por página + 12 de sitio, agrupadas en un resumen `pass/warn/fail`.
7. **Lighthouse**: se cierra el navegador del crawl y se lanza una instancia aparte de Chrome con `chrome-launcher`. Si falla, se devuelve `LighthouseResult.error` y el informe continúa.
8. **Keywords**: se analizan las páginas renderizadas. Si hay credenciales y propiedad verificada, se consultan GSC/Bing con caché; cualquier fallo se registra como estado del proveedor y no aborta la auditoría.
9. **Informe**: Markdown agrupado por `id + estado`; JSON con `AuditData`; CSV opcional de positivas/negativas.

### Cierre de Chrome

`inspectWithBrowser` envuelve render + crawl en `try/finally` y cierra el navegador antes de lanzar Lighthouse. Lighthouse usa su propia instancia y la mata en `finally`. Esto evita dos Chromes compitiendo y reduce picos de memoria.

## 5. Módulos y responsabilidades

| Módulo | Responsabilidad | Entradas / salidas clave |
| --- | --- | --- |
| `packages/core/src/url.ts` | Normalizar URLs y bloquear SSRF | `URL` / `UnsafeUrlError` |
| `probe.ts` | HTTP acotado con redirecciones seguras; robots y sitemap | `HttpProbe`, `SiteProbe` |
| `chrome.ts` | Resolver el ejecutable de Chrome (`CHROME_PATH` o rutas conocidas) | ruta absoluta |
| `render.ts` | Lanzar Chrome y extraer una `RenderedPage` | `Browser`, `RenderedPage` |
| `crawl.ts` | BFS interno con dedupe y límite | `CrawlResult` |
| `detect/stack.ts` | 31 reglas de señal → 28 identificadores de tecnología | `StackReport` |
| `seo/parse.ts` | Extraer datos SEO del HTML renderizado | `PageSeoData` |
| `seo/page-checks.ts` | 18 comprobaciones por página | `SeoCheck[]` |
| `seo/site-checks.ts` | 12 comprobaciones de sitio | `SeoCheck[]` |
| `seo/fixes.ts` | Contexto de stack y recomendaciones específicas | `StackContext`, `fixFor()` |
| `seo/index.ts` | Orquestar checks y resumen | `SiteSeoResult` |
| `keywords/index.ts` | Orquestar análisis on-page y proveedores | `KeywordReport` |
| `keywords/analyze.ts` | Normalizar, puntuar, agrupar y detectar negativas/canibalización | `KeywordReport` |
| `keywords/providers/gsc.ts` | Propiedad, OAuth y `searchAnalytics.query` | `KeywordProviderResult` |
| `keywords/providers/bing.ts` | Propiedad, API key y `GetQueryStats` | `KeywordProviderResult` |
| `keywords/providers/cache.ts` | Caché local con TTL de 24 h | entradas JSON |
| `perf/lighthouse.ts` | Ejecutar y resumir Lighthouse | `LighthouseResult` |
| `report/markdown.ts` | Informe legible en español | `string` Markdown |
| `report/json.ts` | Proyección estable para integraciones | `AuditData` |
| `report/keywords-csv.ts` | CSV de positivas y negativas | `string` CSV |
| `pipeline.ts` | Orquestación completa | `InspectResult` |
| `packages/cli/src/args.ts` | Parseo de flags y rutas de salida | `CliOptions` |
| `packages/cli/src/index.ts` | Ejecutar, progresar, escribir y reportar | código de salida |
| `apps/web/server/audit-request.ts` | Validación y normalización pura del payload | `AuditPayload` |
| `apps/web/server/audit-api.ts` | Endpoint local `POST /api/audit`, errores HTTP y middleware | `AuditResponse` |
| `apps/web/src/*` | Formulario, resumen, paneles, filtros, tabla y descarga | UI |

## 6. Contratos de datos

```
InspectResult
├─ probe: HttpProbe            # respuesta HTTP de la home
├─ site: SiteProbe             # robots.txt + sitemap
├─ page: RenderedPage          # home renderizada en Chrome
├─ stack: StackReport          # tecnologías + evidencias + notas
├─ crawl: CrawlResult          # páginas, errores, visitadas, duración
├─ seo: SiteSeoResult          # checks[], pages[], summary
├─ lighthouse?: LighthouseResult
└─ keywords?: KeywordReport | null
```

Tipos principales:

| Tipo | Campos relevantes |
| --- | --- |
| `HttpProbe` | `url`, `finalUrl`, `status`, `headers`, `setCookies`, `html`, `htmlBytes`, `truncated`, `redirectChain`, `elapsedMs`, `error?` |
| `SiteProbe` | `robots`, `sitemap`, `sitemapsDeclared` (`ResourceProbe` con `found`, `bytes`, `text`, `urlsCount`) |
| `RenderedPage` | `url`, `finalUrl`, `status`, `headers`, `html`, `title`, `cookieNames`, `resources`, `links`, `consoleErrors`, `dom`, `elapsedMs`, `error?` |
| `CrawlResult` | `startUrl`, `host`, `pages: CrawledPage[]`, `errors`, `visited`, `elapsedMs` |
| `StackReport` | `technologies[]` (`id`, `name`, `category`, `confidence`, `evidence[]`), `primaryStack[]`, `notes[]` |
| `PageSeoData` | title, description, robots, canonical, lang, viewport, headings, imágenes, enlaces, palabras, OG/Twitter, JSON-LD, hreflang, mixed content |
| `SeoCheck` | `id`, `category`, `status`, `severity`, `title`, `detail`, `evidence?`, `fix?`, `pageUrl?` |
| `SiteSeoResult` | `checks[]`, `pages: PageSeoResult[]`, `summary: { pass, warn, fail }` |
| `LighthouseResult` | `scores`, `metrics[]`, `failingAudits[]`, `elapsedMs`, `error?` |
| `KeywordReport` | `locale`, `country`, `period`, `providers[]`, `positives[]`, `negatives[]`, `clusters[]`, `summary`, `limitations[]` |
| `KeywordCandidate` | `keyword`, `intent`, `score`, `confidence`, `sources`, `onPage`, `gsc?`, `bing?`, `recommendedPage`, `action`, `cluster`, `cannibalization` |
| `KeywordProviderStatus` | `provider`, `status`, `message`, `property`, `fetchedAt`, `rows`, `truncated`, `cached` |
| `AuditData` | URL, fecha, estado, redirecciones, stack, SEO, Lighthouse, keywords, resumen de crawl y recursos pesados |

`AuditData` es la frontera pública para la UI y para `--json`; `InspectResult` es el contrato interno del motor. La UI no importa tipos de Puppeteer ni de Lighthouse.

```mermaid
classDiagram
  class InspectResult {
    +HttpProbe probe
    +SiteProbe site
    +RenderedPage page
    +StackReport stack
    +CrawlResult crawl
    +SiteSeoResult seo
    +LighthouseResult lighthouse
    +KeywordReport keywords
  }
  class SiteSeoResult {
    +SeoCheck[] checks
    +PageSeoResult[] pages
    +SeoSummary summary
  }
  class CrawlResult {
    +string startUrl
    +string host
    +CrawledPage[] pages
    +CrawlError[] errors
    +number visited
    +number elapsedMs
  }
  class LighthouseResult {
    +LighthouseScores scores
    +LighthouseMetric[] metrics
    +LighthouseAudit[] failingAudits
    +number elapsedMs
    +string error
  }
  InspectResult --> SiteSeoResult
  InspectResult --> CrawlResult
  InspectResult --> LighthouseResult
  InspectResult --> KeywordReport
```

## 7. Detalle de las etapas

### 7.1 Guard SSRF (`url.ts`)

- Solo `http:` y `https:`; añade `https://` si no hay esquema.
- Bloquea hostnames: `localhost`, `localhost.localdomain`, `metadata.google.internal`, `metadata.goog`, sufijos `.localhost`, `.local`, `.internal`, `.home.arpa`.
- Bloquea IPv4: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`.
- Bloquea IPv6: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8` y IPv4 mapeadas inseguras.
- Resuelve DNS con `lookup({ all: true })` y valida todas las direcciones.
- `allowPrivateHosts` desactiva el guard de forma explícita.

### 7.2 Probe HTTP (`probe.ts`)

- `redirect: manual` con máximo 5 redirecciones; cada salto se revalida con `assertSafeUrl`.
- Timeout por petición: 20 s por defecto.
- HTML: 5 MiB; recursos de texto (robots/sitemap): 1 MiB.
- `readTextLimited` corta el stream y marca `truncated` sin cargar el cuerpo completo.
- Los errores no lanzan: devuelven un `HttpProbe` con `status: 0` y `error`.
- `probeSite` prueba primero los sitemaps declarados en `robots.txt` y luego `/sitemap.xml` y `/sitemap_index.xml`.

### 7.3 Render y crawl

- Puppeteer `headless: true`, `protocolTimeout: 60 s`, viewport 1366×900.
- `page.goto` con `networkidle2` y timeout configurable (45 s por defecto).
- Extracción dentro de `page.evaluate`: HTML final, título, `performance.getEntriesByType('resource')`, enlaces `a[href]` (máx. 500), señales de framework en `window`, scripts y links.
- Errores de consola y `pageerror` se limitan a 50 entradas de 500 caracteres.
- Crawl: cola FIFO, mismo host, `maxPages` (10 por defecto), extensión de assets excluida, parámetros de tracking eliminados solo para deduplicar, hash eliminado.
- `onPage` permite a la CLI mostrar `[n/max] URL`.

### 7.4 Detección de stack

Señales combinadas:

- Cabeceras (`server`, `x-powered-by`, `via`, `cf-ray`, `x-vercel-*`, `x-nf-*`, etc.).
- HTML (`meta generator`, patrones de scripts, rutas, comentarios, atributos).
- Cookies (`wordpress_`, `PHPSESSID`, `laravel_session`, etc.).
- Globals del DOM (`__NEXT_DATA__`, `__NUXT__`, `Vue`, `angular`, `React`, `__sveltekit`, `__remixContext`, `firebase`, `jQuery`, `___gatsby`).
- Recursos (URLs de CDN, bundles, estilos).

Categorías: `CMS`, `Framework`, `Librería`, `Runtime`, `Backend`, `E-commerce`, `Hosting/CDN`, `Base de datos`, `Stack`. Cada tecnología incluye evidencias y confianza (`alta`, `media`, `baja`). Las reglas compuestas detectan MERN y MEAN.

### 7.5 SEO

**Por página (18):** `http-status`, `title`, `meta-description`, `h1`, `heading-hierarchy`, `canonical`, `lang`, `viewport`, `open-graph`, `twitter-card`, `json-ld`, `image-alt`, `word-count`, `internal-links`, `meta-robots`, `mixed-content`, `url-structure`, `hreflang`.

**De sitio (12):** `https`, `hsts`, `csp`, `x-content-type-options`, `referrer-policy`, `frame-options`, `redirects`, `robots`, `sitemap`, `duplicate-titles`, `duplicate-descriptions`, `crawl-status`.

Cada check tiene severidad (`critico`, `alto`, `medio`, `bajo`), estado (`pass`, `warn`, `fail`), detalle, evidencia opcional y `fix` contextual. Los fixes se eligen según el stack detectado (por ejemplo, sugerencias de plugin SEO en WordPress o de metadata en Next.js).

### 7.6 Lighthouse

- Categorías: `performance`, `accessibility`, `best-practices`, `seo`.
- Métricas: FCP, LCP, TBT, CLS, Speed Index, TTI.
- Se descartan auditorías `notApplicable`, `informative` y `manual`.
- Severidad: peso ≥ 10 → alto; peso ≥ 3 → alto si score 0, si no medio; resto → medio si score 0, si no bajo.
- Se ordenan por peso descendente y score ascendente.
- Chrome se valida con `existsSync` antes de `chrome-launcher`; si no existe, se devuelve un error controlado (TD-01).

### 7.7 Keywords

- **On-page**: extrae n-gramas de 1–3 palabras de title, headings, meta description, URL, alt, anchors y cuerpo; normaliza, elimina stopwords y deduplica.
- **Intención**: heurísticas léxicas para informacional, navegacional, comercial, transaccional, local o desconocida.
- **Scoring**: combina señales on-page, intención y métricas externas cuando existen. La confianza refleja la cantidad y calidad de las fuentes.
- **Clusters y páginas**: agrupa por término principal y recomienda la página con más señales; marca canibalización si aparece en varias.
- **Negativas**: reglas heurísticas (empleo, gratis, descarga, etc.) más las aportadas por el usuario. Se exportan como sugerencias `phrase`/`exact`; no se aplican solas.
- **GSC**: OAuth de solo lectura, ventana de 28 días con 3 días de retraso, `sites.list` y `searchAnalytics.query`, máximo 25.000 filas.
- **Bing**: API key, `GetUserSites` y `GetQueryStats`, ventana de 28 días. La API REST/JSON sustituye a las SOAP/POX retiradas.
- **Caché**: `.cache/seo-audit`, TTL 24 h. No guarda tokens ni HTML. `--refresh-keywords` la omite.
- **Degradación**: si faltan credenciales o la propiedad no está verificada, el proveedor queda en `no-config`/`no-property` y la auditoría sigue con on-page.
- **Exportación**: Markdown, `AuditData.keywords` y CSV con BOM UTF-8 y protección contra fórmulas.

Configuración y operación detalladas: [`KEYWORDS.md`](KEYWORDS.md).

### 7.8 Informe

Secciones: Resumen ejecutivo, Hallazgos prioritarios, Stack tecnológico, Lo que ya funciona, Problemas encontrados (por severidad), Rendimiento y calidad, Accesibilidad y buenas prácticas, Palabras clave y oportunidades, Páginas analizadas, Plan de acción priorizado, Anexo técnico y Limitaciones.

Límites de presentación: 5 hallazgos prioritarios, 20 comprobaciones correctas, 40 problemas por severidad, 12 acciones en el plan. Los checks se agrupan por `id + estado` para no repetir el mismo problema en cada página; se conserva el número de URLs afectadas. Los proveedores externos se muestran con su estado y limitaciones; nunca se ocultan fallos de credenciales o propiedad.

## 8. Seguridad

Modelo de confianza: **herramienta local para URLs elegidas por el usuario**. No está pensada para exponerse a Internet.

| Control | Implementación |
| --- | --- |
| SSRF en probe | Guard por salto de redirección + DNS |
| Límite de cuerpo | 16 KiB en la API; 5 MiB HTML / 1 MiB texto en probe |
| Superficie HTTP | Solo `POST /api/audit`; `405` para otros métodos |
| Errores de cliente | URL insegura → `400`; resto → `500` |
| Hosts privados | Bloqueados salvo `allowPrivateHosts` / `--allow-private` |
| Secretos | GSC/Bing se leen del entorno; no se escriben en informes, CSV ni caché |
| Datos externos | Solo APIs oficiales y solo con credenciales y propiedad verificada |
| Ejecución | Chrome local headless; sin descarga de binarios |

Riesgo residual importante: la navegación de Chrome y sus subpeticiones **no** pasan por el guard SSRF. Una URL pública que redirija a una IP privada podría ser cargada por Chrome y parte de su contenido acabar en el informe. Mitigación actual: no exponer la API y usar `allowPrivate` solo en desarrollo. Ver TD-03 en [`TECHNICAL-DEBT.md`](TECHNICAL-DEBT.md).

## 9. Manejo de errores

| Falla | Comportamiento |
| --- | --- |
| URL inválida o insegura | `UnsafeUrlError`; CLI código 1; API 400 |
| Error de red en probe | `HttpProbe.error`, `status: 0`; se continúa con Chrome |
| Error de navegación | `RenderedPage.error`; se conserva lo cargado |
| Página del crawl falla | Se registra en `CrawlResult.errors` y se sigue |
| Chrome no encontrado | Error controlado al lanzar render o Lighthouse |
| Lighthouse falla | `LighthouseResult.error`; el informe se genera igual |
| GSC/Bing sin credenciales o propiedad | Estado `no-config`/`no-property`; se continúa con on-page |
| GSC/Bing falla | Estado `error`/`partial`; el resto del informe se genera igual |
| Página sin datos | Checks con `status`/`severity` coherentes y `detail` explicativo |

## 10. Decisiones de diseño

| Decisión | Motivo | Consecuencia |
| --- | --- | --- |
| Renderizar con Chrome real | Muchos sitios son SPA y el HTML crudo no representa el DOM final | Más lento y requiere Chrome instalado |
| Crawl secuencial y acotado | Simplicidad, menos carga en el sitio y resultados reproducibles | 30 páginas pueden tardar minutos |
| Sin base de datos | Herramienta local, informes como artefactos | Sin histórico ni comparación |
| Lighthouse en Chrome aparte | Evita interferencias con Puppeteer y permite medir la home limpia | Un proceso más y ~8–20 s extra |
| Fingerprints propios | Evitar dependencias con licencias restrictivas | Cobertura heurística y mantenimiento manual |
| Informe en Markdown | Legible, versionable y compatible con cualquier herramienta | Presentación menos rica que HTML/PDF |
| Fixes contextuales por stack | Recomendaciones accionables, no genéricas | Requiere mantener reglas por tecnología |
| Keywords on-page siempre, externas opcionales | Aporta valor sin credenciales y evita bloquear la auditoría | Menos datos si no hay GSC/Bing |
| Proveedores oficiales y caché local | Evita scraping y llamadas repetidas | Requiere credenciales y aceptar límites de cada API |
| Monorepo con core TS fuente | Iteración rápida sin paso de build | Core no publicable aún (TD-02) |
| Guard SSRF explícito | Evitar que una herramienta local se convierta en vector de acceso a la red interna | Falsos negativos posibles; `--allow-private` para desarrollo |

## 11. Puntos de extensión

- **Nuevo check de página**: añadir en `seo/page-checks.ts` con `id`, categoría, severidad, detalle y `fix`.
- **Nuevo check de sitio**: añadir en `seo/site-checks.ts`; si necesita datos nuevos, ampliar `SiteChecksInput`.
- **Nueva regla de stack**: añadir a `RULES` en `detect/stack.ts` con `id`, nombre, categoría y función `detect`.
- **Nuevo fix contextual**: ampliar `fixFor()` y `StackContext` en `seo/fixes.ts`.
- **Nueva métrica de Lighthouse**: añadir a `METRICS` en `perf/lighthouse.ts`.
- **Nuevo proveedor de keywords**: implementar `KeywordProvider` en `keywords/providers/`, registrarlo en `providers/index.ts` y añadir su configuración en `keywords/config.ts`.
- **Nueva regla de intención/negativas**: ampliar `keywords/intent.ts` o `keywords/analyze.ts`.
- **Nueva sección del informe**: añadir un `render*Section` en `report/markdown.ts`.
- **Nuevo campo público**: ampliar `AuditData` en `report/json.ts` y los tipos de la UI.
- **Nueva UI**: consumir `POST /api/audit` o importar el core desde Node/tsx.

## 12. Rendimiento y límites

- El coste dominante es el render/crawl (≈1–5 s por página) y Lighthouse (≈8–20 s).
- GSC/Bing añaden latencia de red; la caché de 24 h evita repetir consultas.
- El crawl es secuencial: no hay concurrencia de páginas.
- Una auditoría de 10 páginas con Lighthouse suele tardar entre 30 s y 2 min según el sitio.
- `networkidle2` puede esperar hasta el timeout en páginas con polling o websockets.
- Los cuerpos y listas están acotados para evitar consumo de memoria descontrolado.
- Los informes no se cargan en memoria más allá del tamaño del texto generado.

## 13. Testing

- **Unitarios** (Vitest): URL/SSRF, crawl, stack, checks SEO, resumen de Lighthouse con Chrome mockeado, keywords (motor y proveedores), caché, Markdown/CSV, argumentos y CLI.
- **API**: validación pura del payload, handler con request/response simulados, códigos 400/405/413/500 y errores de `inspectSite`.
- **UI**: cliente `runAudit`, filtros de keywords y render estático de `AuditForm` y `KeywordsPanel`.
- Los tests no requieren Chrome, red ni credenciales.
- **Smoke manual** con `npm run smoke` y auditorías reales con `npm run audit`.
- Lighthouse se mockea con `vi.hoisted` para evitar `spawn ENOENT` y tests frágiles.
- GSC y Bing se mockean con `fetch` inyectado; no se llaman APIs reales en tests.
- No hay E2E de navegador; `AuditForm` y `KeywordsPanel` se cubren con render estático, no con interacción DOM.
- CI en GitHub Actions ejecuta `npm ci`, `npm run check` y `npm run build:web`.

## 14. Operación

| Modo | Comando | Puerto | API |
| --- | --- | --- | --- |
| CLI | `npm run audit -- <url>` | — | — |
| Desarrollo web | `npm run dev` | 5173 | Plugin Vite |
| Preview del build | `npm run build:web` + `npm run preview` | 4173 | Plugin Vite |
| Smoke del motor | `npm run smoke -- <url>` | — | — |

Los informes van a `reports/` por defecto y la caché de keywords a `.cache/seo-audit`; ambas carpetas están ignoradas por git. La API no debe publicarse en Internet. Las credenciales de GSC/Bing se definen en el entorno del proceso.

## 15. Deuda y evolución

La auditoría de deuda técnica, con prioridades, evidencia y plan de remediación, está en [`TECHNICAL-DEBT.md`](TECHNICAL-DEBT.md). Las líneas de evolución recomendadas son: empaquetado del core, CI, cierre del riesgo SSRF en Chrome, cumplimiento de `robots.txt`, tests de la capa web y proveedores de volumen de pago (Google Ads/Microsoft Ads) si se necesitan.

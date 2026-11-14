# Auditoría de deuda técnica

**Fecha:** 2026-11-13

**Actualización:** 2026-11-14 — baseline revalidado tras keywords, tests de API/UI y CI (108 tests / 18 archivos).

**Alcance:** repositorio `seo-audit` en su estado MVP inicial y primera iteración de keywords.

**Método:** revisión estática del código, ejecución de typecheck/lint/tests/build, `npm audit`, `npm outdated`, búsqueda de `TODO/FIXME` y revisión de límites de seguridad y operación.

No es un pentest ni una auditoría legal. Las conclusiones de seguridad se basan en el modelo de amenaza documentado: herramienta local para URLs elegidas por el usuario.

## 1. Línea base verificada

| Comprobación | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto en `core`, `cli` y `web` |
| `npm run lint` | Correcto (ESLint 10 + typescript-eslint) |
| `npm test` | **108 tests / 18 archivos** en verde |
| `npm run build:web` | Correcto (Vite 8.3.8) |
| CI | GitHub Actions con `npm ci`, `npm run check` y `npm run build:web` |
| `npm audit --omit=dev` | **0 vulnerabilidades** de producción |
| `npm audit` | **9 moderadas**, todas en cadena de desarrollo ESLint/minimatch |
| `TODO/FIXME/HACK/XXX` | Sin coincidencias en el código fuente |
| Entorno probado | Node 24.14.0, npm 11.9.0, Chrome 157.0.8103.51, Windows |

Los tests no requieren Chrome ni red. El smoke real se ejecutó manualmente con `example.com` y la UI se verificó contra `POST /api/audit`.

## 2. Resumen de hallazgos

| ID | Severidad | Área | Hallazgo | Estado |
| --- | --- | --- | --- | --- |
| TD-01 | Alta | Robustez | `chrome-launcher` podía lanzar un `spawn ENOENT` no controlado si la ruta de Chrome no existía | **Resuelto** |
| TD-02 | Media | Arquitectura / packaging | El core exporta TypeScript fuente; el plugin Vite lo importa por ruta relativa y no hay build publicable | Pendiente |
| TD-03 | Media (alta si se expone) | Seguridad | El guard SSRF no cubre redirecciones ni subpeticiones dentro de Chrome | Pendiente / riesgo aceptado en local |
| TD-04 | Media | Ética / operación | No se respetan las directivas `Disallow` de `robots.txt` | Pendiente |
| TD-05 | Media | Calidad | No hay CI; los checks dependen de ejecución manual | **Resuelto** |
| TD-06 | Media | Testing | No hay tests de la UI ni del endpoint `/api/audit`; solo hay tests de exportación CSV web | **Resuelto** (cobertura inicial) |
| TD-07 | Media | Legal | No existe archivo `LICENSE`; el repositorio no está preparado para publicación | Pendiente (decisión) |
| TD-08 | Baja | UX / API | Sin cancelación ni timeout de la petición del cliente; errores de cliente mejorables | Parcial |
| TD-09 | Baja | Dependencias | `vite` estaba declarado en la raíz sin uso directo | **Resuelto** |
| TD-10 | Baja | Mantenibilidad | Helpers duplicados (`messageOf`, `scorePercent`) y fixtures de test repetidos | Pendiente |
| TD-11 | Baja | Dependencias | 9 vulnerabilidades moderadas de desarrollo y deriva de versiones | Pendiente / monitorizar |
| TD-12 | Baja | Operación | Posible Chrome huérfano ante una salida abrupta del proceso | Pendiente |
| TD-13 | Baja | Rendimiento | Crawl secuencial sin concurrencia ni caché por página | Pendiente (mejora) |
| TD-14 | Baja | Robustez | Sin reintentos para fallos transitorios de red/navegación | Pendiente |
| TD-15 | Baja | Precisión | Lighthouse se ejecuta una sola vez; variabilidad entre ejecuciones | Aceptado |
| TD-16 | Baja | Tooling | Sin política explícita de encoding/finales de línea | **Resuelto** |

Prioridad recomendada: TD-03 y TD-07 antes de exponer el repositorio o la API; TD-02 antes de publicar paquetes o colaborar; el resto puede entrar en el backlog normal. TD-05 y TD-06 ya están resueltos.

## 3. Detalle de hallazgos

### TD-01 — Ruta de Chrome no validada (Alta) — Resuelto

**Evidencia:** `packages/core/src/perf/lighthouse.ts` llamaba a `chrome-launcher` con la ruta resuelta sin comprobar que el archivo existiera. Si `CHROME_PATH` apuntaba a una ruta inválida, el `spawn ENOENT` de `chrome-launcher` podía escapar del `try/catch` y tumbar el proceso (se observó como excepción no capturada en Vitest).

**Impacto:** una configuración incorrecta de Chrome rompía la auditoría de forma no controlada, en lugar de devolver un error útil.

**Solución aplicada:**

- `existsSync(chromePath)` antes de `launch()`; si no existe, se lanza un error con instrucciones y se devuelve `LighthouseResult.error`.
- Test nuevo: ejecutable inexistente → error controlado y `launch` no invocado.
- Tests existentes usan `process.execPath` como ruta válida mockeada.

**Verificación:** `npm test` (63 tests en aquel momento) y smoke real con Chrome.

### TD-02 — Core sin build publicable y acoplamiento del plugin Vite (Media)

**Evidencia:**

- `packages/core/package.json` exporta `./src/index.ts` como `types` e `import`; no hay `dist` ni declaraciones.
- `apps/web/server/audit-api.ts` importa `../../../packages/core/src/index.js` en lugar de `@seo-audit/core`.
- `apps/web/vite.config.ts` importa `./server/audit-api` sin extensión; Vite 8 avisa de que el `configLoader: 'native'` futuro no soportará esa forma.
- La CLI funciona gracias a `tsx`; un `node` plano no puede consumir el core.

**Impacto:** no se puede publicar el core en npm, no hay contratos compilados estables y la web depende de una ruta relativa frágil. El aviso de Vite es deuda futura.

**Recomendación:**

1. Añadir build al core (`tsc` con `declaration` o `tsup`) y exportar `dist/index.js` + `dist/index.d.ts`.
2. Cambiar el plugin a `import { ... } from '@seo-audit/core'`.
3. Resolver el import del config con extensión o mover la API a un paquete Node propio.
4. Versionar los paquetes con semver real en lugar de `*` cuando se publiquen.

**Esfuerzo:** M. **Prioridad:** antes de publicar paquetes o separar el repo.

### TD-03 — SSRF parcial: Chrome no pasa por el guard (Media; alta si la API se expone)

**Evidencia:**

- `pipeline.ts` valida la URL inicial y `probe.ts` revalida cada redirección HTTP.
- `render.ts` navega con `page.goto(url)` sin validar la URL final ni interceptar subpeticiones.
- `apps/web/server/audit-api.ts` no tiene autenticación; está pensado para localhost.

**Impacto:** una URL pública controlada por un atacante podría redirigir a `http://169.254.169.254/...` o a un host interno. Chrome cargaría esa página y parte de su contenido (título, HTML, enlaces, checks) podría acabar en el informe devuelto por la API. En uso local con URLs propias el riesgo es bajo; si se publica la API, es un vector de SSRF y fuga de información.

**Recomendación:**

- Activar intercepción de peticiones en Puppeteer (`page.setRequestInterception(true)`) y bloquear hosts no públicos antes de cada request, incluidas subpeticiones y redirecciones.
- Validar `page.url()` final tras la navegación.
- No exponer la API; si se hace, añadir autenticación, límites por usuario y una allowlist de dominios.
- Mantener `--allow-private` como opt-in explícito y documentar el riesgo.

**Esfuerzo:** M. **Prioridad:** alta antes de cualquier despliegue remoto.

### TD-04 — `robots.txt` no se respeta (Media)

**Evidencia:** `crawl.ts` encola enlaces sin consultar reglas `Disallow`; `seo/site-checks.ts` solo comprueba existencia/accesibilidad de `robots.txt` y lee sitemaps declarados.

**Impacto:** la herramienta puede rastrear rutas que el sitio pide no visitar. Aunque el crawl es acotado (10–30 páginas, secuencial), es una deuda ética y operativa si se usa sobre sitios de terceros.

**Recomendación:** parsear `robots.txt` para el user-agent de la herramienta (o `*`), aplicar `Disallow`/`Allow` al encolar, añadir un delay configurable y un user-agent identificable. Documentar que no sustituye el consentimiento del propietario.

**Esfuerzo:** S/M. **Prioridad:** antes de usar la herramienta a escala.

### TD-05 — Sin integración continua (Media) — Resuelto

**Evidencia:** no existía `.github/workflows/` ni configuración equivalente; los checks se ejecutaban a mano.

**Solución aplicada:** workflow `.github/workflows/ci.yml` con Node 24, cache de npm, `npm ci`, `npm run check` y `npm run build:web` en cada push y pull request.

**Verificación:** el workflow usa los mismos comandos que se ejecutan en local; no requiere Chrome, red externa ni credenciales.

**Pendiente opcional:** smoke test sin Chrome en CI y gate de `npm audit --omit=dev`. No ejecutar Lighthouse real en CI.

### TD-06 — Capa web sin tests (Media) — Resuelto (cobertura inicial)

**Evidencia:** los 108 tests cubren core, CLI y la capa web. Se añadieron:

- `apps/web/server/audit-request.test.ts`: defaults, URL, clamp de páginas, booleanos, locale y límites de negativas.
- `apps/web/server/audit-api.test.ts`: 405, URL ausente, JSON inválido, cuerpo grande (413), payload normalizado, `UnsafeUrlError` y error genérico.
- `apps/web/src/api.test.ts`: envío de la petición y mensajes de error.
- `apps/web/src/keywords-filter.test.ts`: búsqueda, intención y fuente.
- `apps/web/src/components/*.test.tsx`: render estático de `AuditForm` y `KeywordsPanel`.
- `apps/web/src/keywords-csv.test.ts`: exportación CSV y protección de fórmulas.

**Límite actual:** no hay tests de interacción DOM ni E2E; los componentes se validan con `renderToStaticMarkup`. Si la UI crece, añadir Vitest + Testing Library y, opcionalmente, Playwright.

**Impacto restante:** bajo. Los contratos y errores principales están cubiertos; los flujos visuales completos dependen de smoke manual.

**Esfuerzo:** M. **Prioridad:** después de CI.

### TD-07 — Sin licencia (Media, legal)

**Evidencia:** no existe `LICENSE`; `package.json` es `private: true`.

**Impacto:** sin licencia, el código no puede reutilizarse legalmente aunque sea público. Si el repositorio se publica, conviene decidir explícitamente entre uso privado, MIT, Apache-2.0 u otra.

**Recomendación:** añadir `LICENSE` y un campo `license` en `package.json`. Si se mantiene privado, documentarlo en el README (ya se indica que no hay licencia definida).

**Esfuerzo:** S (decisión). **Prioridad:** antes de publicar.

### TD-08 — UX de auditorías largas y errores de API (Baja) — Parcial

**Evidencia:**

- `apps/web/src/api.ts` usa `fetch` sin `AbortController`; no hay botón de cancelar.
- `handleAudit` bloquea el formulario hasta que termina; una auditoría de 30 páginas puede durar minutos.
- `audit-api.ts` ya devuelve `400` para `UnsafeUrlError` y JSON inválido, `405` para método incorrecto y `413` para cuerpos mayores de 16 KiB. El resto de errores devuelve `500`.

**Impacto:** el usuario no puede cancelar y no hay progreso en la UI; los errores de cliente principales ya están corregidos.

**Recomendación restante:** añadir `AbortController` y botón de cancelar; opcionalmente, progreso vía SSE o polling de trabajos. Para uso local no es bloqueante.

**Esfuerzo:** S/M. **Prioridad:** baja.

### TD-09 — Dependencia `vite` raíz sin uso (Baja) — Resuelto

**Evidencia:** `vite` estaba en `devDependencies` de la raíz; solo lo usan `apps/web` y Vitest.

**Impacto:** dependencia redundante y confusión sobre la versión efectiva.

**Solución aplicada:** eliminado de la raíz y actualizado `package-lock.json`. `npm ls vite --depth=1` muestra una única versión 8.3.8 vía web/Vitest.

### TD-10 — Duplicación de helpers y fixtures (Baja)

**Evidencia:**

- `messageOf()` está repetido en `probe.ts`, `render.ts`, `crawl.ts`, `perf/lighthouse.ts` y `apps/web/server/audit-api.ts`.
- `scorePercent()` existe en `packages/cli/src/index.ts` y `packages/core/src/report/markdown.ts` con formatos distintos.
- Los fixtures HTML de tests se repiten entre archivos de SEO/crawl.
- `format.ts` de la UI repite etiquetas de severidad/estado que ya existen en el core.

**Impacto:** cambios de formato o de mensajes deben hacerse en varios sitios; riesgo de divergencia.

**Recomendación:** extraer `core/src/util/errors.ts` y `core/src/util/format.ts`; crear `packages/core/test/fixtures.ts` compartido. No es urgente.

**Esfuerzo:** S. **Prioridad:** baja.

### TD-11 — Vulnerabilidades de desarrollo y deriva de versiones (Baja)

**Evidencia (`npm audit`):** 9 moderadas, todas en la cadena de ESLint/typescript-eslint por `minimatch` (DoS con `globparts`). `npm audit fix --force` propone degradar `typescript-eslint` a 8.36.0, lo que sería un cambio incompatible y no recomendado.

**Deriva (`npm outdated`):**

| Paquete | Instalado | Último | Nota |
| --- | --- | --- | --- |
| `typescript` | 5.9.3 | 7.0.2 | Retenido por compatibilidad con typescript-eslint `<6.1.0` |
| `eslint` | 10.14.0 | 10.15.0 | Actualización menor pendiente |
| `@types/node` | 24.19.2 | 26.6.6 | Coherente con Node 24; no saltar hasta actualizar runtime |

**Impacto:** riesgo bajo (solo tooling de desarrollo); la deriva puede acumular trabajo.

**Recomendación:** no aplicar `--force`; actualizar ESLint cuando publique el fix; revisar trimestralmente TypeScript/Node; añadir `npm audit --omit=dev` a CI como gate y el audit completo como informativo.

**Esfuerzo:** S. **Prioridad:** monitorizar.

### TD-12 — Chrome huérfano ante salida abrupta (Baja)

**Evidencia:** `render.ts` cierra el navegador en `finally` y `lighthouse.ts` hace `chrome?.kill()` en `finally`, pero un `SIGINT`/`SIGTERM` o un crash pueden dejar procesos de Chrome vivos.

**Impacto:** consumo de memoria/CPU tras cancelar una auditoría.

**Recomendación:** registrar manejadores de señales que cierren el navegador y el Chrome de Lighthouse; en Windows, validar el comportamiento con `taskkill`. Documentar como limitación mientras no se implemente.

**Esfuerzo:** S. **Prioridad:** baja.

### TD-13 — Crawl secuencial (Baja, mejora)

**Evidencia:** `crawl.ts` procesa la cola con `while` y `await options.render(next.url)` sin concurrencia.

**Impacto:** 30 páginas pueden tardar varios minutos; el tiempo crece linealmente con `maxPages`.

**Recomendación:** concurrencia acotada (2–3 páginas), reutilización de caché por URL y timeout por página. Medir antes/después; no introducir concurrencia sin límites para no saturar el sitio auditado.

**Esfuerzo:** M. **Prioridad:** mejora, no deuda bloqueante.

### TD-14 — Sin reintentos ante fallos transitorios (Baja)

**Evidencia:** un error de `renderPage` se registra en `CrawlResult.errors` y la página no se reintenta; el probe devuelve `status: 0` sin retry.

**Impacto:** falsos negativos por timeouts puntuales o 5xx transitorios.

**Recomendación:** un reintento con backoff para errores de red/5xx, con presupuesto de tiempo y sin reintentar errores de seguridad (SSRF) ni 4xx.

**Esfuerzo:** S. **Prioridad:** baja.

### TD-15 — Lighthouse de una sola pasada (Baja, aceptado)

**Evidencia:** `runLighthouse` ejecuta una vez; el informe usa esos valores.

**Impacto:** variabilidad entre ejecuciones; una muestra puede no representar el rendimiento real.

**Recomendación:** mantener una pasada por coste/tiempo y documentar la variabilidad (ya está en Limitaciones). Si se necesita precisión, ofrecer un modo `--lighthouse-runs 3` con mediana, fuera del alcance del MVP.

**Esfuerzo:** M. **Prioridad:** aceptado.

### TD-16 — Sin política de encoding/finales de línea (Baja) — Resuelto

**Evidencia:** no había `.editorconfig` ni `.gitattributes`; en Windows PowerShell 5.1 la consola puede mostrar caracteres UTF-8 como mojibake aunque los archivos sean correctos.

**Solución aplicada:** `.editorconfig` (UTF-8, LF, 2 espacios) y `.gitattributes` (`text=auto eol=lf`). Los archivos fuente ya estaban en UTF-8.

## 4. Riesgos residuales

| Riesgo | Probabilidad | Impacto | Mitigación actual | Mitigación recomendada |
| --- | --- | --- | --- | --- |
| SSRF/fuga vía Chrome si la API se expone | Baja en local, alta si se publica | Alto | Sin autenticación; guard parcial | TD-03 + no exponer la API |
| Crawl de rutas no permitidas | Media | Medio | Límite de páginas y mismo host | TD-04 |
| Dependencia de Chrome instalado | Alta | Bajo | Detección de rutas + error controlado | Mensaje claro (implementado) |
| Variabilidad de Lighthouse | Alta | Bajo | Documentado | Modo multi-run opcional |
| Regresiones sin CI | Baja | Medio | GitHub Actions con `check` y build | Mantener workflow |
| Publicación sin licencia | Media | Medio | README lo advierte | TD-07 |
| Vulnerabilidades de tooling | Baja | Bajo | Solo dev; sin fix incompatible | Monitorizar TD-11 |

## 5. Backlog priorizado

### Antes de publicar el repositorio

1. **TD-07**: decidir y añadir `LICENSE`.
2. **TD-02**: empaquetar el core o documentar claramente que se consume como fuente.
3. **TD-03**: implementar intercepción de requests en Puppeteer o dejar explícito que la API es solo local y no debe exponerse.

### Siguiente iteración

4. **TD-08**: cancelación/timeout en la UI.
5. **TD-04**: respeto de `robots.txt` y rate limit configurable.
6. **TD-10**: extraer utilidades y fixtures compartidos.

### Mejoras posteriores

9. **TD-13**: concurrencia acotada en el crawl.
10. **TD-14**: reintentos con backoff.
11. **TD-12**: cierre ordenado ante señales.
12. **TD-15**: modo Lighthouse multi-run si hay demanda.

## 6. Cómo reproducir esta auditoría

```powershell
npm ci
npm run check
npm run build:web
npm audit --omit=dev
npm audit
npm outdated
git grep -nE "TODO|FIXME|HACK|XXX"
```

Para el smoke real (requiere Chrome y red):

```powershell
npm run smoke -- https://example.com --max-pages 1
npm run audit -- https://example.com --max-pages 1 --out reports/auditoria.md --json
```

## 7. Criterios de aceptación para cerrar la deuda prioritaria

- CI verde en cada push/PR con typecheck, lint, tests y build web.
- `LICENSE` presente y coherente con la visibilidad del repositorio.
- El core se importa mediante `@seo-audit/core` y tiene build/declaraciones, o el README explica por qué no.
- El guard SSRF cubre redirecciones de Chrome y subpeticiones, o la API está restringida a localhost con advertencia explícita.
- La API devuelve `400/413` para errores de cliente y la UI permite cancelar una auditoría.
- `robots.txt` se aplica al crawl o se documenta como limitación aceptada con un uso responsable.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, ensureDir, listFiles, pageRouteFromRelative, toPosixPath } from "./lib/fs-utils.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { escapeHtml, renderTemplate } from "./lib/template.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const srcRoot = path.join(appRoot, "src");
const publicRoot = path.join(appRoot, "public");
const distRoot = path.join(appRoot, "dist");
const buildLockRoot = path.join(appRoot, ".build.lock");
const partialsRoot = path.join(srcRoot, "partials");
const layoutPath = path.join(srcRoot, "layouts", "default.html");
const buildVersion = process.env.BUILD_VERSION || String(Date.now());
const buildMode = process.env.SITE_BUILD_MODE || "production";
const includeOriginalPages = buildMode !== "production";
const productionPublicExcludes = new Set([
  "en",
  "images.prismic.io",
  "logo-original-schloss-freudenfels.svg",
  "ru",
  "schloss-freudenfels.cdn.prismic.io",
  "unpublished"
]);

const styleOrder = ["legacy", "base", "components", "sections", "features", "pages"];

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireBuildLock() {
  const staleAfterMs = 30_000;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await fs.mkdir(buildLockRoot);
      await fs.writeFile(path.join(buildLockRoot, "pid"), String(process.pid));
      return async () => {
        await fs.rm(buildLockRoot, { recursive: true, force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      try {
        const stat = await fs.stat(buildLockRoot);
        if (Date.now() - stat.mtimeMs > staleAfterMs) {
          await fs.rm(buildLockRoot, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }

      await wait(100);
    }
  }

  throw new Error("Build lock timeout");
}

async function concatFiles(files, banner) {
  const chunks = [banner, ""];

  for (const file of files) {
    const relative = toPosixPath(path.relative(srcRoot, file));
    const content = await fs.readFile(file, "utf8");
    chunks.push(`/* ${relative} */`);
    chunks.push(content.trimEnd());
    chunks.push("");
  }

  return `${chunks.join("\n").trimEnd()}\n`;
}

async function collectStyleFiles() {
  const stylesRoot = path.join(srcRoot, "styles");
  const allFiles = await listFiles(stylesRoot, file => file.endsWith(".css"));
  const files = [];
  const seen = new Set();

  for (const group of styleOrder) {
    const groupRoot = path.join(stylesRoot, group);
    for (const file of allFiles.filter(item => item.startsWith(groupRoot + path.sep))) {
      files.push(file);
      seen.add(file);
    }
  }

  for (const file of allFiles) {
    if (!seen.has(file)) files.push(file);
  }

  return files;
}

function routeFromPageFile(pagesRoot, file) {
  return pageRouteFromRelative(path.relative(pagesRoot, file));
}

async function collectRoutes(pageFiles) {
  const routesPath = path.join(srcRoot, "data", "routes.json");
  const pagesRoot = path.join(srcRoot, "pages");

  try {
    const routes = JSON.parse(await fs.readFile(routesPath, "utf8"));
    const routeSet = new Set(routes);

    if (includeOriginalPages) {
      for (const file of pageFiles) {
        const route = routeFromPageFile(pagesRoot, file);
        if (route.startsWith("/original/")) {
          routeSet.add(route);
        }
      }
    }

    return [...routeSet].sort((a, b) => a.localeCompare(b));
  } catch {
    return pageFiles
      .map(file => routeFromPageFile(pagesRoot, file))
      .filter(route => includeOriginalPages || !route.startsWith("/original/"))
      .sort();
  }
}

function renderRoutesHead(routes) {
  const prefetch = routes
    .filter(route => route !== "/" && !route.endsWith(".html"))
    .map(route => `<link rel="prefetch" href="${route}"/>`)
    .join("");
  return `${prefetch}\n  <script>window.__ROUTES__ = ${JSON.stringify(routes)}</script>`;
}

async function buildCss() {
  const files = await collectStyleFiles();
  const css = await concatFiles(files, "/* Generated from app/src/styles. Edit source files, not dist/styles.css. */");
  await fs.writeFile(path.join(distRoot, "styles.css"), css);
}

async function buildJs() {
  const files = await listFiles(path.join(srcRoot, "scripts"), file => file.endsWith(".js"));
  const js = await concatFiles(files, "/* Generated from app/src/scripts. Edit source files, not dist/scripts.js. */");
  await fs.writeFile(path.join(distRoot, "scripts.js"), js);
}

async function buildPages() {
  const pagesRoot = path.join(srcRoot, "pages");
  const allPageFiles = await listFiles(pagesRoot, file => file.endsWith(".html"));
  const layout = await fs.readFile(layoutPath, "utf8");
  const routes = await collectRoutes(allPageFiles);
  const routeSet = new Set(routes);
  const pageFiles = allPageFiles.filter(file => routeSet.has(routeFromPageFile(pagesRoot, file)));
  const routesHead = renderRoutesHead(routes);

  for (const file of pageFiles) {
    const relative = path.relative(pagesRoot, file);
    const { data, content } = parseFrontmatter(await fs.readFile(file, "utf8"));
    const pageContext = {
      ...normalizeContext(data),
      BUILD_VERSION: escapeHtml(buildVersion),
      ORIGINAL_NAV_LINK: includeOriginalPages ? ' / <a href="/original/">OR</a>' : "",
      ROUTES_HEAD: routesHead
    };
    const bodyContent = await renderTemplate(content, pageContext, { partialsRoot });
    const hasAnimatedBoot = /\bdata-animate=(["'])true\1/.test(bodyContent);
    const bodyClass = [data.bodyClass || "", hasAnimatedBoot ? "ic-booting" : ""].filter(Boolean).join(" ");
    const description = data.description
      ? `<meta name="description" content="${escapeHtml(data.description)}" />`
      : "";
    const html = await renderTemplate(layout, {
      ...pageContext,
      CONTENT: bodyContent.trim(),
      DESCRIPTION_META: description,
      ROUTES_HEAD: routesHead,
      TITLE: escapeHtml(data.title || ""),
      LANG: escapeHtml(data.lang || "ru"),
      BODY_CLASS: escapeHtml(bodyClass)
    }, { partialsRoot });

    const target = path.join(distRoot, relative);
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, html);
  }

  return pageFiles.length;
}

function normalizeContext(data) {
  const context = {};

  for (const [key, value] of Object.entries(data)) {
    context[key] = value;
    context[key.toUpperCase()] = value;
  }

  return context;
}

function shouldCopyPublicAsset(source) {
  if (includeOriginalPages) return true;

  const relative = path.relative(publicRoot, source);
  const topLevelName = relative.split(path.sep)[0];
  return !productionPublicExcludes.has(topLevelName);
}

export async function buildSite() {
  const releaseBuildLock = await acquireBuildLock();

  try {
    await fs.rm(distRoot, { recursive: true, force: true });
    await ensureDir(distRoot);
    await copyDir(publicRoot, distRoot, shouldCopyPublicAsset);
    await buildCss();
    await buildJs();
    const pageCount = await buildPages();
    console.log(`Built dist from src: ${pageCount} pages, mode ${buildMode}, version ${buildVersion}`);
  } finally {
    await releaseBuildLock();
  }
}

await buildSite();

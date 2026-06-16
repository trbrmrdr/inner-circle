import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { siteConfig } from "../src/site.config.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const srcRoot = path.join(appRoot, "src");
const baseDir = path.join(appRoot, siteConfig.baseDir);
const outDir = path.join(appRoot, siteConfig.outDir);

const htmlFile = /\.html$/i;
const cssFile = /\.css$/i;
const jsFile = /\.js$/i;

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyDirectory(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(source, target);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function listFiles(root, predicate = () => true) {
  if (!(await exists(root))) {
    return [];
  }

  const result = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      result.push(...await listFiles(fullPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(fullPath)) {
      result.push(fullPath);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

async function concatFiles(sourceDir, predicate, banner) {
  const files = await listFiles(sourceDir, predicate);
  const chunks = [banner.trim(), ""];

  for (const file of files) {
    const relative = path.relative(srcRoot, file).split(path.sep).join("/");
    const content = await fs.readFile(file, "utf8");
    chunks.push(`/* ${relative} */`);
    chunks.push(content.trimEnd());
    chunks.push("");
  }

  return chunks.join("\n");
}

async function buildLegacyCss() {
  const legacyStylesDir = path.join(srcRoot, siteConfig.legacyStylesDir);

  if (await exists(legacyStylesDir)) {
    return concatFiles(
      legacyStylesDir,
      filePath => cssFile.test(filePath),
      "/* Generated from app/src/legacy-styles. Split from dst_0/index.css. */"
    );
  }

  return fs.readFile(path.join(baseDir, "index.css"), "utf8");
}

function assetPrefixFor(htmlPath) {
  const relativeToRoot = path.relative(path.dirname(htmlPath), outDir).split(path.sep).join("/");
  return relativeToRoot ? `${relativeToRoot}/` : "./";
}

function languageFor(relativeHtmlPath, html) {
  const firstSegment = relativeHtmlPath.split("/")[0];

  if (firstSegment === "ru" || firstSegment === "en") {
    return firstSegment;
  }

  const langMatch = html.match(/<html[^>]*\slang="([^"]+)"/i);
  return langMatch?.[1]?.slice(0, 2) || "ru";
}

function extractAltLanguageHref(headerHtml) {
  const switcher = headerHtml.match(/<div class="_c67921 _2575d7">([\s\S]*?)<\/div>/);
  const link = switcher?.[1]?.match(/<a\s+href="([^"]+)"/i);
  return link?.[1] || "";
}

function replaceFirstBetween(html, startNeedle, endNeedle, replacement) {
  const start = html.indexOf(startNeedle);

  if (start === -1) {
    return html;
  }

  const end = html.indexOf(endNeedle, start + startNeedle.length);

  if (end === -1) {
    return html;
  }

  return `${html.slice(0, start)}${replacement}\n${html.slice(end)}`;
}

function rewriteAssets(html, htmlPath) {
  const prefix = assetPrefixFor(htmlPath);
  const css = [
    `<link rel="stylesheet" type="text/css" href="${prefix}${siteConfig.legacyCss}" />`,
    `<link rel="stylesheet" type="text/css" href="${prefix}${siteConfig.appCss}" />`
  ].join("\n\t\t\t\t");
  const js = [
    `<script async defer src="${prefix}${siteConfig.legacyJs}"></script>`,
    `<script defer src="${prefix}${siteConfig.appJs}"></script>`
  ].join("\n\t\t\t\t");

  return html
    .replace(/<script\s+async\s+defer\s+src="[^"]*index\.js"><\/script>/i, js)
    .replace(/<link\s+rel="stylesheet"\s+type="text\/css"\s+href="[^"]*index\.css"\s*\/>/i, css);
}

function stripLegacyContactMapAssets(html) {
  return html
    .replace(/\n?\s*<link\s+rel="stylesheet"\s+type="text\/css"\s+href="\/assets\/inner-circle\/inner-circle-map\.css"\s*\/>/i, "")
    .replace(/\n?\s*<script\s+type="module"\s+src="\/assets\/inner-circle\/inner-circle-map\.js"><\/script>/i, "");
}

async function readPartial(relativePartialPath) {
  return fs.readFile(path.join(srcRoot, relativePartialPath), "utf8");
}

async function renderHeader(html, language) {
  const partialPath = siteConfig.partials.headers[language];

  if (!partialPath || !(await exists(path.join(srcRoot, partialPath)))) {
    return html;
  }

  const match = html.match(/<header class="_68f6d6">[\s\S]*?<\/header>/);

  if (!match) {
    return html;
  }

  const altHref = extractAltLanguageHref(match[0]);
  const template = await readPartial(partialPath);
  const rendered = template.replaceAll("{{ALT_LANG_HREF}}", altHref);

  return html.replace(match[0], rendered.trim());
}

async function renderConfiguredFragments(html, relativeHtmlPath) {
  const pageConfig = siteConfig.pages[relativeHtmlPath];

  if (!pageConfig) {
    return html;
  }

  let nextHtml = html;

  if (pageConfig.details) {
    const details = await readPartial(pageConfig.details);
    nextHtml = replaceFirstBetween(
      nextHtml,
      `<div class="_424e8e" data-id="details"></div><div class="_7a5709">`,
      `<div class="_5b8182">`,
      details.trim()
    );
  }

  if (pageConfig.contactLocation) {
    const contactLocation = await readPartial(pageConfig.contactLocation);
    nextHtml = stripLegacyContactMapAssets(nextHtml);
    nextHtml = replaceFirstBetween(
      nextHtml,
      `<div class="_fddeb5 _da312f inner-circle-static-map">`,
      `<div class="_5b8182">`,
      contactLocation.trim()
    );
  }

  if (pageConfig.footer) {
    const footer = await readPartial(pageConfig.footer);
    nextHtml = replaceFirstBetween(
      nextHtml,
      `<div class="_5b8182">`,
      `<div class="_4db49f">`,
      footer.trim()
    );
  }

  return nextHtml;
}

async function processHtmlFile(htmlPath) {
  const relativeHtmlPath = path.relative(outDir, htmlPath).split(path.sep).join("/");
  const original = await fs.readFile(htmlPath, "utf8");
  const language = languageFor(relativeHtmlPath, original);
  let html = rewriteAssets(original, htmlPath);

  html = await renderConfiguredFragments(html, relativeHtmlPath);
  html = await renderHeader(html, language);

  await fs.writeFile(htmlPath, html);
}

async function build() {
  if (!(await exists(baseDir))) {
    throw new Error(`Base site folder not found: ${baseDir}`);
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await copyDirectory(baseDir, outDir);

  await fs.copyFile(path.join(baseDir, "index.js"), path.join(outDir, siteConfig.legacyJs));
  await fs.writeFile(path.join(outDir, siteConfig.legacyCss), `${await buildLegacyCss()}\n`);

  const appCss = await concatFiles(
    path.join(srcRoot, "styles"),
    filePath => cssFile.test(filePath),
    "/* Generated from app/src/styles. Put new visual work here, not in legacy.css. */"
  );
  const appJs = await concatFiles(
    path.join(srcRoot, "scripts"),
    filePath => jsFile.test(filePath),
    "/* Generated from app/src/scripts. Put new behavior here, not in legacy-runtime.js. */"
  );

  await fs.writeFile(path.join(outDir, siteConfig.appCss), `${appCss}\n`);
  await fs.writeFile(path.join(outDir, siteConfig.appJs), `${appJs}\n`);

  const htmlFiles = await listFiles(outDir, filePath => htmlFile.test(filePath));
  await Promise.all(htmlFiles.map(processHtmlFile));

  console.log(`Built ${path.relative(appRoot, outDir)} from ${siteConfig.baseDir}: ${htmlFiles.length} pages`);
}

await build();

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mediaRoot = path.join(repoRoot, "resources", "Place-Location-Photos");
const outDir = path.join(__dirname, "out", "photo-contact-sheets");
const thumbsDir = path.join(outDir, "thumbs");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

function safeFileName(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) files.push(fullPath);
  }
  return files;
}

function identify(filePath) {
  try {
    const raw = run("magick", ["identify", "-format", "%w %h", filePath]);
    const [width, height] = raw.split(/\s+/).map(Number);
    return { width, height };
  } catch {
    return { width: 0, height: 0 };
  }
}

function createThumb(filePath, thumbPath) {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  run("magick", [
    filePath,
    "-auto-orient",
    "-thumbnail",
    "420x300",
    "-background",
    "white",
    "-gravity",
    "center",
    "-extent",
    "420x300",
    thumbPath,
  ]);
}

function buildSheets(items) {
  const byDir = new Map();
  for (const item of items) {
    if (!byDir.has(item.topDir)) byDir.set(item.topDir, []);
    byDir.get(item.topDir).push(item);
  }

  const sheets = [];
  for (const [topDir, dirItems] of byDir) {
    for (let index = 0; index < dirItems.length; index += 25) {
      const pageItems = dirItems.slice(index, index + 25);
      const page = String(index / 25 + 1).padStart(2, "0");
      const sheetPath = path.join(outDir, `${safeFileName(topDir)}-${page}.jpg`);
      run("magick", [
        "montage",
        ...pageItems.map((item) => item.thumbPath),
        "-thumbnail",
        "220x160",
        "-label",
        "%t",
        "-font",
        "Helvetica",
        "-pointsize",
        "12",
        "-background",
        "white",
        "-fill",
        "#111111",
        "-tile",
        "5x5",
        "-geometry",
        "240x205+8+8",
        sheetPath,
      ]);
      sheets.push(path.relative(repoRoot, sheetPath));
    }
  }
  return sheets;
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(thumbsDir, { recursive: true });

const files = walk(mediaRoot).sort((a, b) =>
  path.relative(mediaRoot, a).localeCompare(path.relative(mediaRoot, b), "ru"),
);

const manifest = [];
for (const [index, filePath] of files.entries()) {
  const rel = path.relative(mediaRoot, filePath).split(path.sep).join("/");
  const topDir = rel.split("/")[0];
  const id = String(index + 1).padStart(4, "0");
  const dimensions = identify(filePath);
  const thumbName = `${id}__${safeFileName(rel)}.jpg`;
  const thumbPath = path.join(thumbsDir, thumbName);

  createThumb(filePath, thumbPath);

  manifest.push({
    id,
    topDir,
    relativePath: rel,
    sourcePath: path.relative(repoRoot, filePath),
    thumbPath: path.relative(repoRoot, thumbPath),
    width: dimensions.width,
    height: dimensions.height,
  });
}

const sheets = buildSheets(manifest);
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ mediaRoot, sheets, items: manifest }, null, 2));
fs.writeFileSync(
  path.join(outDir, "manifest.md"),
  [
    "# Site Photo Contact Sheets",
    "",
    `Media root: \`${path.relative(repoRoot, mediaRoot)}\``,
    `Images indexed: ${manifest.length}`,
    "",
    "## Contact Sheets",
    ...sheets.map((sheet) => `- \`${sheet}\``),
    "",
    "## Items",
    ...manifest.map((item) => `- ${item.id}: \`${item.relativePath}\` (${item.width}x${item.height})`),
    "",
  ].join("\n"),
);

console.log(JSON.stringify({ images: manifest.length, sheets }, null, 2));

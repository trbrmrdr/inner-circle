import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1SRmEToiokN560sk-H-to3kIR6qF7uPXVOsXBmrobU7g";
const DEFAULT_MEDIA_ROOT = path.resolve(
  "/Users/trbrmrdr/Documents/Project/Inner-Circle/resources/Place-Location-Photos",
);
const SHEET_TITLE = "MEDIA";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.join(__dirname, "out", "local-media-contact");
const thumbsDir = path.join(outDir, "thumbs");

function parseArgs(argv) {
  const args = {
    spreadsheetId: process.env.INNER_CIRCLE_SHEET_ID || DEFAULT_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    mediaRoot: process.env.INNER_CIRCLE_LOCAL_MEDIA_ROOT || DEFAULT_MEDIA_ROOT,
    limit: Infinity,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--spreadsheet-id") {
      args.spreadsheetId = argv[index + 1];
      index += 1;
    } else if (arg === "--credentials") {
      args.credentialsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--media-root") {
      args.mediaRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
    }
  }

  return args;
}

function findDefaultCredentialsPath() {
  for (const dir of [path.join(repoRoot, "secrets"), path.join(repoRoot, ".secrets")]) {
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(dir, name);

      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed.type === "service_account" && parsed.client_email) return filePath;
      } catch {
        // Ignore unrelated JSON files.
      }
    }
  }

  return "";
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function rowToObject(headers, row) {
  const item = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key) item[key] = row[index] || "";
  });
  return item;
}

function safeFileName(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9а-яА-Я._-]+/g, "_")
    .slice(0, 140);
}

function stripMediaRootPrefix(value) {
  return String(value || "")
    .replace(/^фото\/видео дома\/?/i, "")
    .replace(/^Place-Location-Photos\/?/i, "")
    .replace(/^\/+/, "");
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function indexLocalFiles(mediaRoot) {
  const byRelativePath = new Map();
  const byName = new Map();

  for (const filePath of walkFiles(mediaRoot)) {
    const relativePath = path.relative(mediaRoot, filePath);
    const normalizedRelativePath = relativePath.split(path.sep).join("/").toLowerCase();
    const name = path.basename(filePath).toLowerCase();

    byRelativePath.set(normalizedRelativePath, filePath);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(filePath);
  }

  return { byRelativePath, byName };
}

function findLocalFile(row, localIndex) {
  const relativePath = `${stripMediaRootPrefix(row.path)}/${row.name}`
    .replace(/\/+/g, "/")
    .toLowerCase();

  if (localIndex.byRelativePath.has(relativePath)) {
    return localIndex.byRelativePath.get(relativePath);
  }

  const candidates = localIndex.byName.get(String(row.name || "").toLowerCase()) || [];
  return candidates[0] || "";
}

async function getMediaRows(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_TITLE}'!A:L`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = response.data.values || [];
  const headers = rows[0] || [];

  return rows
    .slice(1)
    .map((row, index) => ({
      ...rowToObject(headers, row),
      sheetRow: index + 2,
    }))
    .filter((row) => row.media_id && row.name);
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    return {
      ok: false,
      error: `${result.stderr || result.stdout || `${command} failed`}`.trim(),
    };
  }

  return { ok: true };
}

function createThumb(localPath, thumbPath) {
  if (fs.existsSync(thumbPath)) return { ok: true, cached: true };

  const ext = path.extname(localPath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return run("magick", [
      localPath,
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

  if (VIDEO_EXTENSIONS.has(ext)) {
    return run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "1",
      "-i",
      localPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=420:-1,pad=420:300:(ow-iw)/2:(oh-ih)/2:white",
      thumbPath,
    ]);
  }

  return { ok: false, error: `Unsupported file type: ${ext}` };
}

function buildContactSheets(media) {
  const sheetPaths = [];
  const ready = media.filter((item) => item.thumbPath && fs.existsSync(item.thumbPath));

  for (let index = 0; index < ready.length; index += 25) {
    const batch = ready.slice(index, index + 25);
    const page = String(sheetPaths.length + 1).padStart(2, "0");
    const sheetPath = path.join(outDir, `media-contact-sheet-${page}.png`);
    const labeledPaths = batch.map((item) => {
      const labelPath = path.join(
        thumbsDir,
        `${safeFileName(item.mediaId)}__${safeFileName(item.name)}.jpg`,
      );

      if (labelPath !== item.thumbPath && !fs.existsSync(labelPath)) {
        fs.copyFileSync(item.thumbPath, labelPath);
      }

      return labelPath;
    });

    const result = run("magick", [
      "montage",
      ...labeledPaths,
      "-thumbnail",
      "200x145",
      "-label",
      "%t",
      "-font",
      "Helvetica",
      "-pointsize",
      "13",
      "-background",
      "white",
      "-fill",
      "#111111",
      "-tile",
      "5x5",
      "-geometry",
      "220x190+8+8",
      sheetPath,
    ]);

    if (!result.ok) throw new Error(result.error);
    sheetPaths.push(sheetPath);
  }

  return sheetPaths;
}

async function main() {
  const args = parseArgs(process.argv);
  const credentialsPath = path.resolve(args.credentialsPath || findDefaultCredentialsPath());

  if (!fs.existsSync(args.mediaRoot)) {
    throw new Error(`Local media root does not exist: ${args.mediaRoot}`);
  }

  fs.mkdirSync(thumbsDir, { recursive: true });

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const localIndex = indexLocalFiles(args.mediaRoot);
  const mediaRows = (await getMediaRows(sheets, args.spreadsheetId)).slice(0, args.limit);
  const media = [];

  for (const [index, row] of mediaRows.entries()) {
    if (index > 0 && index % 50 === 0) {
      console.error(`Processed ${index}/${mediaRows.length} media rows`);
    }

    const localPath = findLocalFile(row, localIndex);
    const thumbPath = localPath
      ? path.join(thumbsDir, `${safeFileName(row.media_id)}.jpg`)
      : "";
    const thumbResult = localPath ? createThumb(localPath, thumbPath) : { ok: false, error: "No local match" };

    media.push({
      mediaId: row.media_id,
      type: row.type,
      name: row.name,
      path: row.path,
      localPath,
      thumbPath: thumbResult.ok ? thumbPath : "",
      sheetRow: row.sheetRow,
      error: thumbResult.ok ? "" : thumbResult.error,
    });
  }

  const contactSheets = buildContactSheets(media);
  const catalogPath = path.join(outDir, "media-catalog.json");
  fs.writeFileSync(catalogPath, `${JSON.stringify(media, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        source: "local",
        mediaRoot: args.mediaRoot,
        mediaItems: media.length,
        matchedLocalFiles: media.filter((item) => item.localPath).length,
        generatedThumbs: media.filter((item) => item.thumbPath).length,
        contactSheets,
        catalogPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});

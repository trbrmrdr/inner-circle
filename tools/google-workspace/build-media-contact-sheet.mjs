import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1SRmEToiokN560sk-H-to3kIR6qF7uPXVOsXBmrobU7g";
const SHEET_TITLE = "MEDIA";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const outDir = path.join(__dirname, "out", "media-contact");
const thumbsDir = path.join(outDir, "thumbs");

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

function parseArgs(argv) {
  const args = {
    spreadsheetId: process.env.INNER_CIRCLE_SHEET_ID || DEFAULT_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    limit: 220,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--credentials") {
      args.credentialsPath = argv[index + 1];
      index += 1;
    }
  }

  return args;
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
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function extractImageUrl(value) {
  const text = String(value || "");
  const imageFormulaMatch = text.match(/IMAGE\("([^"]+)"/i);
  if (imageFormulaMatch) return imageFormulaMatch[1];

  const urlMatch = text.match(/https?:\/\/[^\s")]+/i);
  if (urlMatch) return urlMatch[0];

  return "";
}

async function download(url, targetPath, accessToken) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let response;
  try {
    response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, bytes);
}

async function getSheetRows(sheets, spreadsheetId) {
  const range = `'${SHEET_TITLE}'!A:L`;
  const [valuesResponse, formulasResponse] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMATTED_VALUE",
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "FORMULA",
    }),
  ]);

  const values = valuesResponse.data.values || [];
  const formulas = formulasResponse.data.values || [];
  const headers = values[0] || [];

  return values.slice(1).map((row, index) => {
    const item = rowToObject(headers, row);
    const formulaItem = rowToObject(headers, formulas[index + 1] || []);
    item.sheetRow = index + 2;
    item.preview_formula = formulaItem.preview || "";
    item.preview_formula_url = extractImageUrl(formulaItem.preview || "");
    return item;
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const credentialsPath = path.resolve(args.credentialsPath || findDefaultCredentialsPath());

  fs.mkdirSync(thumbsDir, { recursive: true });

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  const authClient = await auth.getClient();
  const accessToken = (await authClient.getAccessToken()).token;
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });
  const rows = (await getSheetRows(sheets, args.spreadsheetId))
    .filter((row) => row.media_id && row.file_id)
    .slice(0, args.limit);

  const media = [];

  for (const [index, row] of rows.entries()) {
    if (index > 0 && index % 25 === 0) {
      console.error(`Processed ${index}/${rows.length} media rows`);
    }

    const file = await drive.files.get({
      fileId: row.file_id,
      supportsAllDrives: true,
      fields: "id,name,mimeType,thumbnailLink,webViewLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)",
    });

    const fileData = file.data;
    const thumbUrl = fileData.thumbnailLink || "";
    const ext = fileData.mimeType?.includes("png") ? "png" : "jpg";
    const thumbPath = path.join(thumbsDir, `${safeFileName(row.media_id)}.${ext}`);
    let downloaded = false;

    if (thumbUrl) {
      try {
        await download(thumbUrl, thumbPath, accessToken);
        downloaded = true;
      } catch (error) {
        console.error(`Skipped ${row.media_id}: ${error.message}`);
      }
    }

    media.push({
      mediaId: row.media_id,
      type: row.type,
      name: row.name || fileData.name,
      path: row.path,
      fileId: row.file_id,
      mimeType: fileData.mimeType,
      webViewLink: fileData.webViewLink,
      width: fileData.imageMediaMetadata?.width || fileData.videoMediaMetadata?.width || null,
      height: fileData.imageMediaMetadata?.height || fileData.videoMediaMetadata?.height || null,
      durationMillis: fileData.videoMediaMetadata?.durationMillis || null,
      previewUrl: thumbUrl,
      thumbPath: downloaded ? thumbPath : "",
      sheetRow: row.sheetRow,
    });
  }

  const catalogPath = path.join(outDir, "media-catalog.json");
  fs.writeFileSync(catalogPath, `${JSON.stringify(media, null, 2)}\n`);

  const python = spawnSync(
    "python3",
    [
      "-",
      catalogPath,
      path.join(outDir, "media-contact-sheet"),
    ],
    {
      encoding: "utf8",
      input: String.raw`
import json
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

catalog_path, out_prefix = sys.argv[1], sys.argv[2]
with open(catalog_path, "r", encoding="utf-8") as f:
    media = json.load(f)

items = [item for item in media if item.get("thumbPath") and os.path.exists(item["thumbPath"])]
font = ImageFont.load_default()
tile_w, tile_h = 220, 210
img_w, img_h = 200, 145
cols, rows_per_page = 5, 5
per_page = cols * rows_per_page
pages = []

for page_idx in range(max(1, math.ceil(len(items) / per_page))):
    page_items = items[page_idx * per_page:(page_idx + 1) * per_page]
    sheet = Image.new("RGB", (cols * tile_w, rows_per_page * tile_h), "white")
    draw = ImageDraw.Draw(sheet)

    for idx, item in enumerate(page_items):
        col = idx % cols
        row = idx // cols
        x, y = col * tile_w, row * tile_h
        draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline=(215, 215, 215))

        try:
            thumb = Image.open(item["thumbPath"]).convert("RGB")
            thumb.thumbnail((img_w, img_h))
            tx = x + (tile_w - thumb.width) // 2
            ty = y + 8
            sheet.paste(thumb, (tx, ty))
        except Exception:
            pass

        label = f'{item["mediaId"]}  {item.get("type","")}'
        name = item.get("name", "")[:30]
        path = item.get("path", "")[:34]
        draw.text((x + 8, y + 158), label, fill=(0, 0, 0), font=font)
        draw.text((x + 8, y + 174), name, fill=(40, 40, 40), font=font)
        draw.text((x + 8, y + 190), path, fill=(80, 80, 80), font=font)

    out_path = f"{out_prefix}-{page_idx + 1:02d}.png"
    sheet.save(out_path)
    pages.append(out_path)

print(json.dumps({"pages": pages, "items": len(items)}, ensure_ascii=False))
`,
    },
  );

  if (python.status !== 0) {
    console.error(python.stderr || python.stdout);
    process.exit(python.status || 1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mediaItems: media.length,
        downloadedThumbs: media.filter((item) => item.thumbPath).length,
        catalogPath,
        contactSheets: JSON.parse(python.stdout).pages,
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

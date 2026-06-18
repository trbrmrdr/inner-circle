import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1SRmEToiokN560sk-H-to3kIR6qF7uPXVOsXBmrobU7g";
const HEALTHCHECK_SHEET_TITLE = "_codex_healthcheck";
const POST_COLUMNS = [
  "post_id",
  "date",
  "time",
  "platforms",
  "info/photo/context",
  "text",
  "media_ids",
  "status",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = {
    spreadsheetId: process.env.INNER_CIRCLE_SHEET_ID || DEFAULT_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    writeHealthcheck: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--spreadsheet-id") {
      args.spreadsheetId = argv[index + 1];
      index += 1;
    } else if (arg === "--credentials") {
      args.credentialsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--write-healthcheck") {
      args.writeHealthcheck = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run inspect
  npm run inspect:write
  node inspect-workspace.mjs --spreadsheet-id <id> --credentials <path>

Environment:
  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
  INNER_CIRCLE_SHEET_ID=<spreadsheet id>
`);
}

function findDefaultCredentialsPath() {
  const candidates = [
    path.join(repoRoot, "secrets"),
    path.join(repoRoot, ".secrets"),
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;

    const jsonFiles = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => path.join(dir, name));

    for (const filePath of jsonFiles) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed.type === "service_account" && parsed.client_email) {
          return filePath;
        }
      } catch {
        // Ignore unrelated JSON files.
      }
    }
  }

  return "";
}

function loadServiceAccountInfo(credentialsPath) {
  const raw = fs.readFileSync(credentialsPath, "utf8");
  const parsed = JSON.parse(raw);

  if (parsed.type !== "service_account" || !parsed.client_email) {
    throw new Error("The credentials file does not look like a Google service account JSON key.");
  }

  return {
    clientEmail: parsed.client_email,
    projectId: parsed.project_id,
  };
}

function quoteSheetName(title) {
  return `'${String(title).replaceAll("'", "''")}'`;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/^\*/, "")
    .toLowerCase();
}

function findHeaderRow(rows) {
  let best = { index: -1, score: 0 };

  rows.forEach((row, index) => {
    const normalized = row.map(normalizeHeader);
    const score = POST_COLUMNS.filter((column) => normalized.includes(column)).length;
    if (score > best.score) {
      best = { index, score };
    }
  });

  if (best.score >= 2) return best.index;

  const firstNonEmpty = rows.findIndex((row) => row.some((cell) => String(cell || "").trim()));
  return firstNonEmpty;
}

function buildColumnIndex(headers) {
  const index = new Map();
  headers.forEach((header, columnIndex) => {
    const normalized = normalizeHeader(header);
    if (normalized) index.set(normalized, columnIndex);
  });
  return index;
}

function cell(row, columnIndex, name) {
  const index = columnIndex.get(name);
  if (index === undefined) return "";
  return row[index] || "";
}

function truncate(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function splitMediaIds(value) {
  return String(value || "")
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractDriveIds(value) {
  const text = String(value || "");
  const ids = new Set();

  for (const match of text.matchAll(/[-\w]{25,}/g)) {
    ids.add(match[0]);
  }

  return [...ids];
}

async function getAuth(credentialsPath, writeEnabled) {
  const scopes = [
    writeEnabled
      ? "https://www.googleapis.com/auth/spreadsheets"
      : "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
  ];

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes,
  });

  return auth;
}

async function getSpreadsheetOverview(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields:
      "properties(title,locale,timeZone),sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount,columnCount)))",
  });

  return response.data;
}

async function readSheetPreview(sheets, spreadsheetId, title) {
  const range = `${quoteSheetName(title)}!1:50`;
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

  return {
    values: valuesResponse.data.values || [],
    formulas: formulasResponse.data.values || [],
  };
}

function summarizePostSheet(title, values, formulas) {
  const headerRowIndex = findHeaderRow(values);
  if (headerRowIndex < 0) {
    return {
      title,
      type: "unknown",
      message: "No non-empty rows in the first 50 rows.",
    };
  }

  const headers = values[headerRowIndex] || [];
  const columnIndex = buildColumnIndex(headers);
  const detectedPostColumns = POST_COLUMNS.filter((column) => columnIndex.has(column));
  const previewFormulaCount = formulas
    .flat()
    .filter((value) => String(value || "").startsWith("=")).length;
  const driveIdsInFormulas = new Set(
    formulas.flat().flatMap((value) => extractDriveIds(value)),
  );

  const rows = values.slice(headerRowIndex + 1).filter((row) => row.some(Boolean));
  const postRows = rows
    .map((row, index) => {
      const text = cell(row, columnIndex, "text");
      const mediaIds = splitMediaIds(cell(row, columnIndex, "media_ids"));

      return {
        sheetRow: headerRowIndex + index + 2,
        postId: cell(row, columnIndex, "post_id"),
        date: cell(row, columnIndex, "date"),
        time: cell(row, columnIndex, "time"),
        platforms: cell(row, columnIndex, "platforms"),
        context: truncate(cell(row, columnIndex, "info/photo/context"), 120),
        textChars: String(text || "").length,
        textPreview: truncate(text, 180),
        mediaIds,
        status: cell(row, columnIndex, "status"),
      };
    })
    .filter((row) => row.postId || row.context || row.textPreview || row.mediaIds.length)
    .slice(0, 20);

  return {
    title,
    type: detectedPostColumns.length >= 3 ? "posts" : "generic",
    headerRow: headerRowIndex + 1,
    detectedColumns: detectedPostColumns,
    visibleHeaders: headers.map((header) => String(header || "")).filter(Boolean),
    previewFormulaCount,
    driveIdsInFormulas: [...driveIdsInFormulas].slice(0, 10),
    rows: postRows,
  };
}

function summarizeMediaSheet(title, values, formulas) {
  const headerRowIndex = findHeaderRow(values);
  const headers = headerRowIndex >= 0 ? values[headerRowIndex] || [] : [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const probablyMedia =
    /media|медиа/i.test(title) ||
    normalizedHeaders.some((header) =>
      ["media_id", "media id", "id", "drive_file_id", "file_id", "thumbnail", "preview"].includes(header),
    );

  if (!probablyMedia) return null;

  const columnIndex = buildColumnIndex(headers);
  const rows = values.slice(headerRowIndex + 1).filter((row) => row.some(Boolean));
  const formulaRows = formulas.slice(headerRowIndex + 1);

  const entries = rows.slice(0, 30).map((row, index) => {
    const formulaRow = formulaRows[index] || [];
    const joined = [...row, ...formulaRow].join(" ");
    const driveIds = extractDriveIds(joined).slice(0, 3);

    return {
      sheetRow: headerRowIndex + index + 2,
      mediaId:
        cell(row, columnIndex, "media_id") ||
        cell(row, columnIndex, "media id") ||
        cell(row, columnIndex, "id") ||
        row[0] ||
        "",
      name:
        cell(row, columnIndex, "name") ||
        cell(row, columnIndex, "file_name") ||
        cell(row, columnIndex, "filename") ||
        row[1] ||
        "",
      type:
        cell(row, columnIndex, "type") ||
        cell(row, columnIndex, "mime_type") ||
        cell(row, columnIndex, "mime") ||
        "",
      driveIds,
      hasFormula: formulaRow.some((value) => String(value || "").startsWith("=")),
    };
  });

  return {
    title,
    type: "media",
    headerRow: headerRowIndex + 1,
    visibleHeaders: headers.map((header) => String(header || "")).filter(Boolean),
    entries,
  };
}

async function listDriveMetadata(drive) {
  const response = await drive.files.list({
    pageSize: 20,
    q: "trashed = false",
    orderBy: "modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields:
      "files(id,name,mimeType,modifiedTime,thumbnailLink,webViewLink,parents),nextPageToken",
  });

  return response.data.files || [];
}

async function writeHealthcheck(sheets, spreadsheetId, serviceAccountInfo, spreadsheet) {
  const existingSheet = spreadsheet.sheets?.find(
    (sheet) => sheet.properties?.title === HEALTHCHECK_SHEET_TITLE,
  );

  if (!existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: HEALTHCHECK_SHEET_TITLE,
                gridProperties: {
                  rowCount: 20,
                  columnCount: 6,
                },
              },
            },
          },
        ],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(HEALTHCHECK_SHEET_TITLE)}!A1:D4`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        ["Codex healthcheck", "status", "updated_at", "service_account"],
        [
          "Safe write test; posting rows were not changed.",
          "ok",
          new Date().toISOString(),
          serviceAccountInfo.clientEmail,
        ],
        ["Spreadsheet", spreadsheet.properties?.title || "", spreadsheetId, ""],
      ],
    },
  });

  return HEALTHCHECK_SHEET_TITLE;
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  const credentialsPath = path.resolve(args.credentialsPath || findDefaultCredentialsPath());

  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    throw new Error(
      "Google service account JSON key was not found. Put it in secrets/ or pass --credentials.",
    );
  }

  const serviceAccountInfo = loadServiceAccountInfo(credentialsPath);
  const auth = await getAuth(credentialsPath, args.writeHealthcheck);
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const spreadsheet = await getSpreadsheetOverview(sheets, args.spreadsheetId);
  const sheetSummaries = [];

  for (const sheet of spreadsheet.sheets || []) {
    const title = sheet.properties?.title;
    if (!title) continue;

    const preview = await readSheetPreview(sheets, args.spreadsheetId, title);
    const mediaSummary = summarizeMediaSheet(title, preview.values, preview.formulas);
    sheetSummaries.push(mediaSummary || summarizePostSheet(title, preview.values, preview.formulas));
  }

  const driveFiles = await listDriveMetadata(drive);
  let healthcheck = null;

  if (args.writeHealthcheck) {
    healthcheck = await writeHealthcheck(sheets, args.spreadsheetId, serviceAccountInfo, spreadsheet);
  }

  printSummary({
    ok: true,
    mode: args.writeHealthcheck ? "read-write-healthcheck" : "read-only",
    serviceAccount: {
      email: serviceAccountInfo.clientEmail,
      projectId: serviceAccountInfo.projectId,
    },
    spreadsheet: {
      id: args.spreadsheetId,
      title: spreadsheet.properties?.title,
      locale: spreadsheet.properties?.locale,
      timeZone: spreadsheet.properties?.timeZone,
      sheetCount: spreadsheet.sheets?.length || 0,
      sheets: spreadsheet.sheets?.map((sheet) => ({
        title: sheet.properties?.title,
        hidden: Boolean(sheet.properties?.hidden),
        rows: sheet.properties?.gridProperties?.rowCount,
        columns: sheet.properties?.gridProperties?.columnCount,
      })),
    },
    sheetSummaries,
    driveAccess: {
      listedFiles: driveFiles.length,
      files: driveFiles.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        hasThumbnail: Boolean(file.thumbnailLink),
        webViewLink: file.webViewLink,
      })),
    },
    healthcheck,
  });
}

main().catch((error) => {
  const message = error?.response?.data?.error || error?.message || String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});

import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { GoogleConfig } from "../src/config/GoogleConfig";
import { SheetsSchema, SheetColumn, SheetDefinition } from "../src/sheets/SheetsSchema";

interface CliOptions {
  dryRun: boolean;
  spreadsheetId?: string;
  credentialsFile?: string;
  postsSheet?: string;
  mediaSheet?: string;
  leadsSheet?: string;
  logsSheet?: string;
  settingsSheet?: string;
  gridPaddingRows: number;
  gridPaddingColumns: number;
  trimGrid: boolean;
}

interface ExistingSheet {
  sheetId: number;
  title: string;
  headers: string[];
  headerIndexByName: Map<string, number>;
  usedRowCount: number;
  usedColumnCount: number;
  rowCount: number;
  columnCount: number;
}

interface ExistingSettingsRow {
  rowNumber: number;
  key: string;
  value: string;
  description: string;
}

class GoogleSheetsSync {
  static Options: CliOptions = this.ParseArgs();

  static async Run() {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      this.PrintHelp();
      return;
    }

    this.ApplyOptions();
    this.AssertConfig();

    const sheets = this.Client();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      includeGridData: false,
    });

    const existing = await this.ExistingSheets(sheets, spreadsheet.data);
    const requests: sheets_v4.Schema$Request[] = [];
    const valueUpdates: sheets_v4.Schema$ValueRange[] = [];
    const rawValueUpdates: sheets_v4.Schema$ValueRange[] = [];
    const notes: string[] = [];
    const settingsRows = await this.ReadSettingsRows(sheets);
    const missingSettingsRows = this.MissingSettingsRows(settingsRows);

    for (const definition of SheetsSchema.Definitions()) {
      let sheet = existing.get(definition.name);

      if (!sheet) {
        notes.push(`create sheet: ${definition.name}`);
        requests.push({
          addSheet: {
            properties: {
              title: definition.name,
              gridProperties: {
                frozenRowCount: definition.frozenRows || 1,
                rowCount: 1 + this.Options.gridPaddingRows,
                columnCount: definition.columns.length + this.Options.gridPaddingColumns,
              },
            },
          },
        });
        sheet = {
          sheetId: -1,
          title: definition.name,
          headers: [],
          headerIndexByName: new Map(),
          usedRowCount: 1,
          usedColumnCount: 0,
          rowCount: 1 + this.Options.gridPaddingRows,
          columnCount: definition.columns.length + this.Options.gridPaddingColumns,
        };
        existing.set(definition.name, sheet);
      }

      const missingColumns = definition.columns.filter((column) => !sheet.headerIndexByName.has(column.name));
      const appendStartColumn = this.AppendStartColumn(sheet);
      const syncedColumnCount = missingColumns.length > 0
        ? appendStartColumn + missingColumns.length - 1
        : Math.max(sheet.usedColumnCount, sheet.headers.length, definition.columns.length);
      const requiredColumnCount = Math.max(syncedColumnCount, definition.columns.length) + this.Options.gridPaddingColumns;
      const extraRows = definition.name === GoogleConfig.SETTINGS_SHEET ? missingSettingsRows.length : 0;
      const requiredRowCount = Math.max(sheet.usedRowCount + extraRows, 1) + this.Options.gridPaddingRows;
      this.QueueGridResize(definition.name, sheet, requiredRowCount, requiredColumnCount, requests, notes);

      if (missingColumns.length > 0) {
        notes.push(`append columns in ${definition.name}: ${missingColumns.map((column) => column.name).join(", ")}`);
        valueUpdates.push({
          range: this.Range(definition.name, `${this.Column(appendStartColumn)}1:${this.Column(appendStartColumn + missingColumns.length - 1)}1`),
          values: [missingColumns.map((column) => column.name)],
        });
      }

      this.QueueDefaultValues(definition, sheet, missingColumns, valueUpdates);
      this.QueueSettingsRows(definition, sheet, missingSettingsRows, valueUpdates, notes);
      this.QueueSettingsDescriptionUpdates(definition, settingsRows, valueUpdates, notes);
      this.QueueColumnFormatting(definition, sheet, missingColumns, requests, notes);
      await this.QueueLeadPhoneValueUpdates(definition, sheet, missingColumns, sheets, rawValueUpdates, notes);
    }

    await this.ApplyRequests(sheets, requests);
    await this.ApplyValues(sheets, valueUpdates);
    await this.ApplyRawValues(sheets, rawValueUpdates);

    console.log(JSON.stringify({
      ok: true,
      dryRun: this.Options.dryRun,
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      credentialsFile: GoogleConfig.CREDENTIALS_FILE,
      sheets: {
        posts: GoogleConfig.POSTS_SHEET,
        media: GoogleConfig.MEDIA_SHEET,
        leads: GoogleConfig.LEADS_SHEET,
        logs: GoogleConfig.LOGS_SHEET,
        settings: GoogleConfig.SETTINGS_SHEET,
      },
      gridPadding: {
        rows: this.Options.gridPaddingRows,
        columns: this.Options.gridPaddingColumns,
      },
      trimGrid: this.Options.trimGrid,
      actions: notes,
    }, null, 2));
  }

  static ParseArgs(): CliOptions {
    return {
      dryRun: process.argv.includes("--dry-run"),
      spreadsheetId: this.ArgValue("--spreadsheet-id"),
      credentialsFile: this.ArgValue("--credentials") || this.ArgValue("--credentials-file"),
      postsSheet: this.ArgValue("--posts-sheet"),
      mediaSheet: this.ArgValue("--media-sheet"),
      leadsSheet: this.ArgValue("--leads-sheet"),
      logsSheet: this.ArgValue("--logs-sheet"),
      settingsSheet: this.ArgValue("--settings-sheet"),
      gridPaddingRows: this.ArgNumber("--grid-padding-rows", 1),
      gridPaddingColumns: this.ArgNumber("--grid-padding-columns", 1),
      trimGrid: !process.argv.includes("--no-trim-grid"),
    };
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static ArgNumber(name: string, fallback: number) {
    const rawValue = this.ArgValue(name);
    if (rawValue === "") return fallback;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) return fallback;
    return Math.floor(value);
  }

  static PrintHelp() {
    console.log([
      "Использование:",
      "  npm run sheets:check",
      "  npm run sheets:sync",
      "  ENV_FILE=env/moscow.env npm run sheets:check",
      "",
      "Опции:",
      "  --dry-run                         Только показать будущие изменения.",
      "  --spreadsheet-id <id>              Использовать другую Google таблицу.",
      "  --credentials <path>               Использовать другой service account.",
      "  --posts-sheet <name>               Имя листа постов.",
      "  --media-sheet <name>               Имя листа медиа.",
      "  --leads-sheet <name>               Имя листа заявок.",
      "  --logs-sheet <name>                Имя листа логов.",
      "  --settings-sheet <name>            Имя листа настроек.",
      "  --grid-padding-rows <number>       Сколько пустых строк держать в запасе.",
      "  --grid-padding-columns <number>    Сколько пустых колонок держать в запасе.",
      "  --no-trim-grid                     Не сжимать сетку таблицы.",
    ].join("\n"));
  }

  static ApplyOptions() {
    if (this.Options.spreadsheetId) GoogleConfig.SPREADSHEET_ID = this.Options.spreadsheetId;
    if (this.Options.credentialsFile) GoogleConfig.CREDENTIALS_FILE = this.Options.credentialsFile;
    if (this.Options.postsSheet) GoogleConfig.POSTS_SHEET = this.Options.postsSheet;
    if (this.Options.mediaSheet) GoogleConfig.MEDIA_SHEET = this.Options.mediaSheet;
    if (this.Options.leadsSheet) GoogleConfig.LEADS_SHEET = this.Options.leadsSheet;
    if (this.Options.logsSheet) GoogleConfig.LOGS_SHEET = this.Options.logsSheet;
    if (this.Options.settingsSheet) GoogleConfig.SETTINGS_SHEET = this.Options.settingsSheet;
  }

  static AssertConfig() {
    if (!GoogleConfig.SPREADSHEET_ID) {
      throw new Error("GOOGLE_SPREADSHEET_ID is required");
    }

    if (!fs.existsSync(GoogleConfig.CREDENTIALS_FILE)) {
      throw new Error(`Google credentials file not found: ${GoogleConfig.CREDENTIALS_FILE}`);
    }
  }

  static Client() {
    const auth = new google.auth.GoogleAuth({
      keyFile: GoogleConfig.CREDENTIALS_FILE,
      scopes: GoogleConfig.SCOPES,
    });

    return google.sheets({ version: "v4", auth });
  }

  static async ExistingSheets(sheets: sheets_v4.Sheets, spreadsheet: sheets_v4.Schema$Spreadsheet) {
    const map = new Map<string, ExistingSheet>();

    for (const item of spreadsheet.sheets || []) {
      const title = item.properties?.title || "";
      const sheetId = item.properties?.sheetId || 0;
      const rowCount = item.properties?.gridProperties?.rowCount || 0;
      const columnCount = item.properties?.gridProperties?.columnCount || 0;
      if (!title) continue;

      const usedRange = await this.ReadUsedRange(sheets, title);
      map.set(title, {
        title,
        sheetId,
        headers: usedRange.headers,
        headerIndexByName: usedRange.headerIndexByName,
        usedRowCount: usedRange.usedRowCount,
        usedColumnCount: usedRange.usedColumnCount,
        rowCount,
        columnCount,
      });
    }

    return map;
  }

  static async ReadUsedRange(sheets: sheets_v4.Sheets, title: string) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range: this.Range(title, "A1:ZZZ"),
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const rows = response.data.values || [];
      const headerIndexByName = new Map<string, number>();
      const headerValues = rows[0] || [];
      const headers: string[] = [];

      headerValues.forEach((value, index) => {
        const name = this.CellText(value);
        if (!name || headerIndexByName.has(name)) return;
        headers.push(name);
        headerIndexByName.set(name, index + 1);
      });

      return {
        headers,
        headerIndexByName,
        usedRowCount: rows.length,
        usedColumnCount: rows.reduce((max, row) => Math.max(max, this.LastUsedColumn(row)), 0),
      };
    } catch {
      return {
        headers: [],
        headerIndexByName: new Map<string, number>(),
        usedRowCount: 0,
        usedColumnCount: 0,
      };
    }
  }

  static QueueDefaultValues(
    definition: SheetDefinition,
    sheet: ExistingSheet,
    missingColumns: { name: string; defaultValue?: string }[],
    valueUpdates: sheets_v4.Schema$ValueRange[],
  ) {
    const columnsWithDefaults = missingColumns.filter((column) => column.defaultValue !== undefined);
    if (columnsWithDefaults.length === 0) return;

    const existingDataRowCount = Math.max(0, sheet.usedRowCount - 1);
    if (existingDataRowCount === 0) return;

    const columnIndexByName = this.ColumnIndexByName(sheet, missingColumns);

    for (const column of columnsWithDefaults) {
      const columnIndex = columnIndexByName.get(column.name);
      if (!columnIndex) continue;

      valueUpdates.push({
        range: this.Range(definition.name, `${this.Column(columnIndex)}2:${this.Column(columnIndex)}${existingDataRowCount + 1}`),
        values: Array.from({ length: existingDataRowCount }, () => [column.defaultValue || ""]),
      });
    }
  }

  static QueueGridResize(
    title: string,
    sheet: ExistingSheet,
    requiredRowCount: number,
    requiredColumnCount: number,
    requests: sheets_v4.Schema$Request[],
    notes: string[],
  ) {
    if (sheet.sheetId < 0) return;

    const gridProperties: sheets_v4.Schema$GridProperties = {};
    const fields: string[] = [];

    if (this.ShouldResize(sheet.rowCount, requiredRowCount)) {
      gridProperties.rowCount = requiredRowCount;
      fields.push("gridProperties.rowCount");
    }

    if (this.ShouldResize(sheet.columnCount, requiredColumnCount)) {
      gridProperties.columnCount = requiredColumnCount;
      fields.push("gridProperties.columnCount");
    }

    if (fields.length === 0) return;

    const rowNote = gridProperties.rowCount ? `rows ${sheet.rowCount} -> ${gridProperties.rowCount}` : "";
    const columnNote = gridProperties.columnCount ? `columns ${sheet.columnCount} -> ${gridProperties.columnCount}` : "";
    notes.push(`resize grid in ${title}: ${[rowNote, columnNote].filter(Boolean).join(", ")}`);
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheetId,
          gridProperties,
        },
        fields: fields.join(","),
      },
    });
  }

  static QueueColumnFormatting(
    definition: SheetDefinition,
    sheet: ExistingSheet,
    missingColumns: SheetColumn[],
    requests: sheets_v4.Schema$Request[],
    notes: string[],
  ) {
    if (sheet.sheetId < 0) return;

    const columnIndexes = this.ColumnIndexByName(sheet, missingColumns);
    for (const column of definition.columns) {
      const columnIndex = columnIndexes.get(column.name);
      if (!columnIndex) continue;

      if (column.numberFormat) {
        notes.push(`format column ${definition.name}.${column.name}: ${column.numberFormat.type}`);
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 1,
              startColumnIndex: columnIndex - 1,
              endColumnIndex: columnIndex,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: column.numberFormat,
              },
            },
            fields: "userEnteredFormat.numberFormat",
          },
        });
      }

      if (column.pixelSize) {
        notes.push(`resize column ${definition.name}.${column.name}: ${column.pixelSize}px`);
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId: sheet.sheetId,
              dimension: "COLUMNS",
              startIndex: columnIndex - 1,
              endIndex: columnIndex,
            },
            properties: {
              pixelSize: column.pixelSize,
            },
            fields: "pixelSize",
          },
        });
      }

      if (column.headerNote) {
        notes.push(`note header ${definition.name}.${column.name}`);
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: columnIndex - 1,
              endColumnIndex: columnIndex,
            },
            cell: {
              note: column.headerNote,
            },
            fields: "note",
          },
        });
      }
    }
  }

  static async QueueLeadPhoneValueUpdates(
    definition: SheetDefinition,
    sheet: ExistingSheet,
    missingColumns: SheetColumn[],
    sheets: sheets_v4.Sheets,
    rawValueUpdates: sheets_v4.Schema$ValueRange[],
    notes: string[],
  ) {
    if (definition.name !== GoogleConfig.LEADS_SHEET) return;

    const columnIndex = this.ColumnIndexByName(sheet, missingColumns).get("phone");
    if (!columnIndex || sheet.usedRowCount < 2) return;

    const column = this.Column(columnIndex);
    const range = this.Range(definition.name, `${column}2:${column}${sheet.usedRowCount}`);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const values = response.data.values || [];
    const updates: sheets_v4.Schema$ValueRange[] = [];

    values.forEach((row, index) => {
      const current = row[0];
      const formatted = this.FormatPhoneForSheet(current);
      if (!formatted || formatted === String(current || "").trim()) return;

      const rowNumber = index + 2;
      updates.push({
        range: this.Range(definition.name, `${column}${rowNumber}`),
        values: [[formatted]],
      });
    });

    if (updates.length === 0) return;
    notes.push(`format existing lead phones: ${updates.length}`);
    rawValueUpdates.push(...updates);
  }

  static ColumnIndexByName(sheet: ExistingSheet, missingColumns: SheetColumn[]) {
    const map = new Map(sheet.headerIndexByName);
    const appendStartColumn = this.AppendStartColumn(sheet);
    missingColumns.forEach((column, index) => map.set(column.name, appendStartColumn + index));
    return map;
  }

  static ShouldResize(current: number, required: number) {
    if (current < required) return true;
    return this.Options.trimGrid && current > required;
  }

  static AppendStartColumn(sheet: ExistingSheet) {
    return Math.max(sheet.usedColumnCount, sheet.headers.length) + 1;
  }

  static CellText(value: unknown) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  static LastUsedColumn(row: unknown[]) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (this.CellText(row[index])) return index + 1;
    }

    return 0;
  }

  static async ReadSettingsRows(sheets: sheets_v4.Sheets): Promise<ExistingSettingsRow[]> {
    const range = this.Range(GoogleConfig.SETTINGS_SHEET, "A:C");
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range,
      });

      return ((response.data.values || []) as string[][]).slice(1).map((row, index) => ({
        rowNumber: index + 2,
        key: String(row[0] || "").trim(),
        value: String(row[1] || "").trim(),
        description: String(row[2] || "").trim(),
      })).filter((row) => Boolean(row.key));
    } catch {
      return [];
    }
  }

  static MissingSettingsRows(existingRows: ExistingSettingsRow[]) {
    const existingKeys = new Set(existingRows.map((row) => row.key));
    return SheetsSchema.SettingsDefaults.filter(([key]) => !existingKeys.has(key));
  }

  static QueueSettingsRows(
    definition: SheetDefinition,
    sheet: ExistingSheet,
    missingRows: string[][],
    valueUpdates: sheets_v4.Schema$ValueRange[],
    notes: string[],
  ) {
    if (definition.name !== GoogleConfig.SETTINGS_SHEET) return;
    if (missingRows.length === 0) return;

    const startRow = Math.max(sheet.usedRowCount + 1, 2);
    notes.push(`append settings rows: ${missingRows.map(([key]) => key).join(", ")}`);
    valueUpdates.push({
      range: this.Range(definition.name, `A${startRow}:C${startRow + missingRows.length - 1}`),
      values: missingRows,
    });
  }

  static QueueSettingsDescriptionUpdates(
    definition: SheetDefinition,
    existingRows: ExistingSettingsRow[],
    valueUpdates: sheets_v4.Schema$ValueRange[],
    notes: string[],
  ) {
    if (definition.name !== GoogleConfig.SETTINGS_SHEET) return;
    if (existingRows.length === 0) return;

    const defaults = new Map(SheetsSchema.SettingsDefaults.map(([key, value, description]) => [key, { value, description }]));
    const updatedKeys: string[] = [];

    for (const row of existingRows) {
      const defaultRow = defaults.get(row.key);
      if (!defaultRow || row.description === defaultRow.description) continue;

      updatedKeys.push(row.key);
      valueUpdates.push({
        range: this.Range(definition.name, `C${row.rowNumber}`),
        values: [[defaultRow.description]],
      });
    }

    if (updatedKeys.length > 0) {
      notes.push(`update setting descriptions: ${updatedKeys.join(", ")}`);
    }
  }

  static async ApplyRequests(sheets: sheets_v4.Sheets, requests: sheets_v4.Schema$Request[]) {
    if (requests.length === 0 || this.Options.dryRun) return;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      requestBody: { requests },
    });
  }

  static async ApplyValues(sheets: sheets_v4.Sheets, data: sheets_v4.Schema$ValueRange[]) {
    if (data.length === 0 || this.Options.dryRun) return;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
  }

  static async ApplyRawValues(sheets: sheets_v4.Sheets, data: sheets_v4.Schema$ValueRange[]) {
    if (data.length === 0 || this.Options.dryRun) return;

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data,
      },
    });
  }

  static FormatPhoneForSheet(value: unknown) {
    const raw = String(value || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw;

    let normalized = digits;
    if (normalized.startsWith("8")) normalized = `7${normalized.slice(1)}`;
    if (normalized.startsWith("9")) normalized = `7${normalized}`;
    if (!normalized.startsWith("7")) normalized = `7${normalized}`;
    normalized = normalized.slice(0, 11);

    if (normalized.length !== 11 || !normalized.startsWith("7")) return raw;

    return `+7 ${normalized.slice(1, 4)} ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
  }

  static Column(index: number) {
    let column = "";
    let current = index;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      column = String.fromCharCode(65 + remainder) + column;
      current = Math.floor((current - remainder) / 26);
    }
    return column;
  }

  static Range(sheetName: string, range: string) {
    return `'${sheetName.replace(/'/g, "''")}'!${range}`;
  }
}

GoogleSheetsSync.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

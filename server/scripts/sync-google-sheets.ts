import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { GoogleConfig } from "../src/config/GoogleConfig";
import { SheetsSchema, SheetDefinition } from "../src/sheets/SheetsSchema";

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
  usedRowCount: number;
  rowCount: number;
  columnCount: number;
}

class GoogleSheetsSync {
  static Options: CliOptions = this.ParseArgs();

  static async Run() {
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
    const notes: string[] = [];
    const missingSettingsRows = await this.MissingSettingsRows(sheets);

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
          usedRowCount: 1,
          rowCount: 1 + this.Options.gridPaddingRows,
          columnCount: definition.columns.length + this.Options.gridPaddingColumns,
        };
        existing.set(definition.name, sheet);
      }

      const missingColumns = definition.columns.filter((column) => !sheet.headers.includes(column.name));
      const headerCountAfterSync = sheet.headers.length + missingColumns.length;
      const requiredColumnCount = Math.max(headerCountAfterSync, definition.columns.length) + this.Options.gridPaddingColumns;
      const extraRows = definition.name === GoogleConfig.SETTINGS_SHEET ? missingSettingsRows.length : 0;
      const requiredRowCount = Math.max(sheet.usedRowCount + extraRows, 1) + this.Options.gridPaddingRows;
      this.QueueGridResize(definition.name, sheet, requiredRowCount, requiredColumnCount, requests, notes);

      if (missingColumns.length > 0) {
        notes.push(`append columns in ${definition.name}: ${missingColumns.map((column) => column.name).join(", ")}`);
        const startColumn = sheet.headers.length + 1;
        valueUpdates.push({
          range: this.Range(definition.name, `${this.Column(startColumn)}1:${this.Column(startColumn + missingColumns.length - 1)}1`),
          values: [missingColumns.map((column) => column.name)],
        });
      }

      this.QueueDefaultValues(definition, sheet, missingColumns, valueUpdates);
      this.QueueSettingsRows(definition, sheet, missingSettingsRows, valueUpdates, notes);
    }

    await this.ApplyRequests(sheets, requests);
    await this.ApplyValues(sheets, valueUpdates);

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
      trimGrid: process.argv.includes("--trim-grid"),
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

      const [headers, usedRowCount] = await Promise.all([
        this.ReadHeaders(sheets, title),
        this.ReadUsedRowCount(sheets, title),
      ]);
      map.set(title, { title, sheetId, headers, usedRowCount, rowCount, columnCount });
    }

    return map;
  }

  static async ReadHeaders(sheets: sheets_v4.Sheets, title: string) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range: this.Range(title, "1:1"),
      });

      return (response.data.values?.[0] || []).map((value) => String(value || "").trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  static async ReadUsedRowCount(sheets: sheets_v4.Sheets, title: string) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range: this.Range(title, "A:ZZ"),
      });

      return response.data.values?.length || 0;
    } catch {
      return 0;
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

    const columnIndexByName = new Map<string, number>();

    sheet.headers.forEach((name, index) => columnIndexByName.set(name, index + 1));
    missingColumns.forEach((column, index) => {
      columnIndexByName.set(column.name, sheet.headers.length + index + 1);
    });

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

  static ShouldResize(current: number, required: number) {
    if (current < required) return true;
    return this.Options.trimGrid && current > required;
  }

  static async MissingSettingsRows(sheets: sheets_v4.Sheets): Promise<string[][]> {
    const range = this.Range(GoogleConfig.SETTINGS_SHEET, "A:C");
    let existingRows: string[][] = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range,
      });
      existingRows = (response.data.values || []) as string[][];
    } catch {
      return SheetsSchema.SettingsDefaults;
    }

    const existingKeys = new Set(existingRows.slice(1).map((row) => String(row[0] || "").trim()).filter(Boolean));
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

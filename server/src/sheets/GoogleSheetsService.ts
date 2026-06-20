import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { GoogleConfig } from "../config/GoogleConfig";
import { LeadRequest, Platform, PostTask, PostType, PublishResult, SheetRow } from "../types/autopost";

export class GoogleSheetsService {
  static SheetsClient: sheets_v4.Sheets | null = null;

  static IsReady() {
    return Boolean(GoogleConfig.SPREADSHEET_ID && fs.existsSync(GoogleConfig.CREDENTIALS_FILE));
  }

  static async AppendLead(lead: LeadRequest): Promise<PublishResult> {
    if (!this.IsReady()) {
      return { ok: false, disabled: true, platform: "sheets", message: "Google Sheets is not configured" };
    }

    const values = [[
      new Date().toISOString(),
      lead.name || "",
      lead.phone || "",
      lead.email || "",
      lead.telegram || "",
      lead.message || "",
      lead.page || "",
      lead.source || "",
      JSON.stringify(lead.meta || {}),
    ]];

    const response = await this.Client().spreadsheets.values.append({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range: `${GoogleConfig.LEADS_SHEET}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    return {
      ok: true,
      platform: "sheets",
      id: response.data.updates?.updatedRange,
      raw: response.data,
    };
  }

  static async AppendLog(level: string, message: string, data?: unknown): Promise<PublishResult> {
    if (!this.IsReady()) {
      return { ok: false, disabled: true, platform: "sheets", message: "Google Sheets is not configured" };
    }

    const response = await this.Client().spreadsheets.values.append({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range: `${GoogleConfig.LOGS_SHEET}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toISOString(), level, message, data ? JSON.stringify(data) : ""]],
      },
    });

    return {
      ok: true,
      platform: "sheets",
      id: response.data.updates?.updatedRange,
      raw: response.data,
    };
  }

  static async ReadSettings() {
    if (!this.IsReady()) return new Map<string, string>();
    const rows = await this.ReadRange(`${GoogleConfig.SETTINGS_SHEET}!A:B`);
    const settings = new Map<string, string>();

    rows.forEach((row) => {
      if (row[0]) settings.set(String(row[0]), String(row[1] || ""));
    });

    return settings;
  }

  static async ReadReadyPosts(limit = 3): Promise<PostTask[]> {
    if (!this.IsReady()) return [];
    const rows = await this.ReadSheet(GoogleConfig.POSTS_SHEET);
    const now = Date.now();

    return rows
      .map((row) => this.ToPostTask(row))
      .filter((task): task is PostTask => Boolean(task))
      .filter((task) => {
        const status = task.status.toLowerCase();
        if (!["ready", "scheduled"].includes(status)) return false;
        if (!task.publish_at) return true;
        const time = Date.parse(task.publish_at);
        return Number.isNaN(time) || time <= now;
      })
      .slice(0, limit);
  }

  static async MarkPostProcessing(task: PostTask) {
    await this.UpdatePostFields(task.rowNumber, {
      status: "processing",
      attempt: String(task.attempt + 1),
      last_error: "",
      updated_at: new Date().toISOString(),
    });
  }

  static async MarkPostResult(task: PostTask, status: string, fields: Record<string, string>) {
    await this.UpdatePostFields(task.rowNumber, {
      status,
      updated_at: new Date().toISOString(),
      ...fields,
    });
  }

  static async UpdatePostFields(rowNumber: number, fields: Record<string, string>) {
    if (!this.IsReady()) return;
    const headers = await this.Headers(GoogleConfig.POSTS_SHEET);
    const data: sheets_v4.Schema$ValueRange[] = [];

    Object.entries(fields).forEach(([key, value]) => {
      const index = headers.indexOf(key);
      if (index === -1) return;
      data.push({
        range: `${GoogleConfig.POSTS_SHEET}!${this.Column(index + 1)}${rowNumber}`,
        values: [[value]],
      });
    });

    if (data.length === 0) return;

    await this.Client().spreadsheets.values.batchUpdate({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
  }

  static async ReadSheet(sheetName: string): Promise<SheetRow[]> {
    const rows = await this.ReadRange(`${sheetName}!A:Z`);
    if (rows.length < 2) return [];

    const headers = rows[0].map((value) => String(value || "").trim());
    return rows.slice(1).map((row, index) => {
      const raw: Record<string, string> = {};
      headers.forEach((header, headerIndex) => {
        if (!header) return;
        raw[header] = String(row[headerIndex] || "").trim();
      });

      return {
        rowNumber: index + 2,
        raw,
      };
    });
  }

  static async Headers(sheetName: string) {
    const rows = await this.ReadRange(`${sheetName}!1:1`);
    return (rows[0] || []).map((value) => String(value || "").trim());
  }

  static async ReadRange(range: string) {
    const response = await this.Client().spreadsheets.values.get({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range,
    });

    return response.data.values || [];
  }

  static ToPostTask(row: SheetRow): PostTask | null {
    const raw = row.raw;
    const text = raw.text || raw.body || raw.caption || "";
    if (!text.trim()) return null;

    return {
      ...row,
      post_uid: raw.post_uid || raw.id || `row-${row.rowNumber}`,
      status: raw.status || "",
      publish_at: raw.publish_at || "",
      title: raw.title || "",
      text,
      media_urls: this.Split(raw.media_urls || raw.media_url || raw.media || ""),
      platforms: this.Split(raw.platforms || raw.platform || "telegram", true).filter((value): value is Platform =>
        ["telegram", "vk", "instagram", "facebook"].includes(value),
      ),
      post_type: this.PostType(raw.post_type || raw.type || "text"),
      attempt: Number(raw.attempt || 0),
      telegram_message_id: raw.telegram_message_id || "",
      vk_post_id: raw.vk_post_id || "",
      instagram_media_id: raw.instagram_media_id || "",
      facebook_post_id: raw.facebook_post_id || "",
    };
  }

  static PostType(value: string): PostType {
    const clean = value.toLowerCase().trim();
    if (["text", "image", "video", "album", "reel", "story", "carousel"].includes(clean)) {
      return clean as PostType;
    }
    return "text";
  }

  static Split(value: string, lower = false) {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .map((item) => (lower ? item.toLowerCase() : item))
      .filter(Boolean);
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

  static Client() {
    if (this.SheetsClient) return this.SheetsClient;

    const auth = new google.auth.GoogleAuth({
      keyFile: GoogleConfig.CREDENTIALS_FILE,
      scopes: GoogleConfig.SCOPES,
    });

    this.SheetsClient = google.sheets({ version: "v4", auth });
    return this.SheetsClient;
  }
}

import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { GoogleConfig } from "../config/GoogleConfig";
import { LeadRequest, Platform, PostTask, PostType, PublishResult, SheetRow } from "../types/autopost";
import { SheetsSchema } from "./SheetsSchema";

export class GoogleSheetsService {
  static SheetsClient: sheets_v4.Sheets | null = null;

  static IsReady() {
    return Boolean(GoogleConfig.IsReady() && fs.existsSync(GoogleConfig.CREDENTIALS_FILE));
  }

  static async AppendLead(lead: LeadRequest): Promise<PublishResult> {
    if (!this.IsReady()) {
      return { ok: false, disabled: true, platform: "sheets", message: "Google Sheets is not configured" };
    }

    const headers = await this.SafeHeaders(GoogleConfig.LEADS_SHEET, SheetsSchema.LeadsColumns.map((column) => column.name));
    const values = [headers.map((header) => this.LeadValue(header, lead))];

    const response = await this.Client().spreadsheets.values.append({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range: `${GoogleConfig.LEADS_SHEET}!A:${this.Column(Math.max(headers.length, 1))}`,
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
    const [rows, mediaMap] = await Promise.all([
      this.ReadSheet(GoogleConfig.POSTS_SHEET),
      this.ReadMediaMap(),
    ]);
    const now = Date.now();

    return rows
      .map((row) => this.ToPostTask(row, mediaMap))
      .filter((task): task is PostTask => Boolean(task))
      .filter((task) => {
        const status = task.status.toLowerCase();
        if (!["ready", "scheduled"].includes(status)) return false;
        if (!task.publish_at) return true;
        const time = this.ParsePublishAt(task.publish_at);
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
    const rows = await this.ReadRange(`${sheetName}!A:AZ`);
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

  static async SafeHeaders(sheetName: string, fallback: string[]) {
    try {
      const headers = await this.Headers(sheetName);
      return headers.length > 0 ? headers : fallback;
    } catch {
      return fallback;
    }
  }

  static LeadValue(header: string, lead: LeadRequest) {
    const key = header.trim();
    if (!key) return "";

    const base: Record<string, unknown> = {
      created_at: new Date().toISOString(),
      lead_uid: lead.lead_uid || lead.leadUid || "",
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      telegram: lead.telegram || "",
      date: lead.date || "",
      guests: lead.guests || "",
      scenario: lead.scenario || "",
      consent: lead.consent === true ? "true" : lead.consent || "",
      message: lead.message || "",
      page: lead.page || "",
      source: lead.source || "",
      meta_json: JSON.stringify(lead.meta || {}),
    };

    const direct = base[key] ?? (lead as Record<string, unknown>)[key] ?? lead.meta?.[key];
    if (direct === undefined || direct === null) return "";
    if (typeof direct === "object") return JSON.stringify(direct);
    return String(direct);
  }

  static async ReadRange(range: string) {
    const response = await this.Client().spreadsheets.values.get({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range,
    });

    return response.data.values || [];
  }

  static async ReadMediaMap() {
    const mediaMap = new Map<string, Record<string, string>>();
    try {
      const rows = await this.ReadSheet(GoogleConfig.MEDIA_SHEET);
      rows.forEach((row) => {
        const mediaId = row.raw.media_id || row.raw.id || "";
        if (mediaId) mediaMap.set(mediaId, row.raw);
      });
    } catch {
      return mediaMap;
    }
    return mediaMap;
  }

  static ToPostTask(row: SheetRow, mediaMap = new Map<string, Record<string, string>>()): PostTask | null {
    const raw = row.raw;
    const text = raw.text || raw.body || raw.caption || "";
    if (!text.trim()) return null;

    const mediaUrls = [
      ...this.Split(raw.media_urls || raw.media_url || raw.media || ""),
      ...this.Split(raw.media_ids || raw.media_id || "").map((mediaId) => this.MediaUrl(mediaMap.get(mediaId))).filter(Boolean),
    ];

    return {
      ...row,
      post_uid: raw.post_uid || raw.post_id || raw.id || `row-${row.rowNumber}`,
      status: raw.status || "",
      publish_at: raw.publish_at || this.BuildPublishAt(raw),
      title: raw.title || "",
      text,
      media_urls: mediaUrls,
      platforms: this.Split(raw.platforms || raw.platform || "telegram", true).filter((value): value is Platform =>
        ["telegram", "vk", "instagram", "facebook"].includes(value),
      ),
      post_type: this.PostType(raw.post_type || raw.type || this.InferPostType(mediaUrls)),
      attempt: Number(raw.attempt || 0),
      telegram_message_id: raw.telegram_message_id || "",
      vk_post_id: raw.vk_post_id || "",
      instagram_media_id: raw.instagram_media_id || "",
      facebook_post_id: raw.facebook_post_id || "",
    };
  }

  static BuildPublishAt(raw: Record<string, string>) {
    const date = raw.date || "";
    const time = raw.time || "";
    return [date, time].filter(Boolean).join(" ").trim();
  }

  static ParsePublishAt(value: string) {
    const clean = value.trim();
    const parsed = Date.parse(clean);
    if (!Number.isNaN(parsed)) return parsed;

    const match = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!match) return Number.NaN;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    return new Date(year, month, day, hour, minute).getTime();
  }

  static MediaUrl(raw?: Record<string, string>) {
    if (!raw) return "";
    if (raw.public_url) return raw.public_url;
    if (raw.media_url) return raw.media_url;
    if (raw.preview_url) return raw.preview_url;
    if (raw.drive_url) return raw.drive_url;
    if (raw.file_id) return `https://drive.google.com/uc?export=download&id=${raw.file_id}`;
    return "";
  }

  static InferPostType(mediaUrls: string[]) {
    if (mediaUrls.length > 1) return "album";
    if (mediaUrls.length === 1) return "image";
    return "text";
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

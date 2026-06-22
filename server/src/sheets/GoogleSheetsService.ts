import fs from "fs";
import { google, sheets_v4 } from "googleapis";
import { GoogleConfig } from "../config/GoogleConfig";
import { LeadRequest, Platform, PostMediaItem, PostTask, PostType, PublishResult, SheetRow } from "../types/autopost";
import { SheetsSchema } from "./SheetsSchema";

export class GoogleSheetsService {
  static SheetsClient: sheets_v4.Sheets | null = null;
  static LeadHeaders: string[] = [];
  static PostCandidatesCache: { loadedAt: number; posts: PostTask[] } | null = null;
  static PostCandidatesCacheMs = 60_000;

  static IsReady() {
    return Boolean(GoogleConfig.IsReady() && fs.existsSync(GoogleConfig.CREDENTIALS_FILE));
  }

  static async AppendLead(lead: LeadRequest): Promise<PublishResult> {
    if (!this.IsReady()) {
      return { ok: false, disabled: true, platform: "sheets", message: "Google Sheets is not configured" };
    }

    const headers = await this.EnsureLeadHeaders();
    const values = [headers.map((header) => this.LeadValue(header, lead))];

    const response = await this.Client().spreadsheets.values.append({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range: `${GoogleConfig.LEADS_SHEET}!A:${this.Column(Math.max(headers.length, 1))}`,
      valueInputOption: "RAW",
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

  static async ReadDuePosts(settings: { publishWindowMinutes: number; futureGraceSeconds: number }): Promise<PostTask[]> {
    const posts = await this.ReadPostCandidates(true);
    const now = Date.now();
    const from = now - settings.publishWindowMinutes * 60_000;
    const to = now + settings.futureGraceSeconds * 1_000;

    return posts.filter((task) => {
      if (!this.IsReadyStatus(task.status)) return false;
      const publishAt = this.ParsePublishAt(task.publish_at || "");
      if (Number.isNaN(publishAt)) return false;
      return publishAt >= from && publishAt <= to;
    });
  }

  static async ReadPostCandidates(force = false): Promise<PostTask[]> {
    if (!this.IsReady()) return [];

    const now = Date.now();
    if (!force && this.PostCandidatesCache && now - this.PostCandidatesCache.loadedAt < this.PostCandidatesCacheMs) {
      return this.PostCandidatesCache.posts;
    }

    const [rows, mediaMap] = await Promise.all([
      this.ReadSheet(GoogleConfig.POSTS_SHEET),
      this.ReadMediaMap(),
    ]);

    const posts = rows
      .map((row) => this.ToPostTask(row, mediaMap))
      .filter((task): task is PostTask => Boolean(task));

    this.PostCandidatesCache = {
      loadedAt: now,
      posts,
    };

    return posts;
  }

  static async FindPostById(postId: string, force = false) {
    const cleanId = postId.trim().toLowerCase();
    if (!cleanId) return null;

    const posts = await this.ReadPostCandidates(force);
    return posts.find((post) => {
      const ids = [
        post.post_uid,
        post.raw.post_id,
        post.raw.post_uid,
        post.raw.id,
        String(post.rowNumber),
      ].filter(Boolean).map((id) => String(id).toLowerCase());

      return ids.includes(cleanId);
    }) || null;
  }

  static async MarkPostProcessing(task: PostTask) {
    await this.UpdatePostFields(task.rowNumber, {
      status: "processing",
    });
  }

  static async MarkPostResult(task: PostTask, status: string, fields: Record<string, string>) {
    await this.UpdatePostFields(task.rowNumber, {
      status,
      ...fields,
    });
  }

  static async MarkPlatformProcessing(task: PostTask, platform: Platform, lockUntil: string) {
    await this.UpdatePostFields(task.rowNumber, {
      status: "processing",
      [`${platform}_status`]: "processing",
      [`${platform}_lock_until`]: lockUntil,
      [`${platform}_error`]: "",
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

  static async MissingPostColumns(columns: string[]) {
    const headers = await this.Headers(GoogleConfig.POSTS_SHEET);
    return columns.filter((column) => !headers.includes(column));
  }

  static async SafeHeaders(sheetName: string, fallback: string[]) {
    try {
      const headers = await this.Headers(sheetName);
      return headers.length > 0 ? headers : fallback;
    } catch {
      return fallback;
    }
  }

  static async EnsureLeadHeaders() {
    if (this.LeadHeaders.length > 0) return this.LeadHeaders;

    const requiredHeaders = SheetsSchema.LeadsColumns.map((column) => column.name);
    const sheets = this.Client();
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      includeGridData: false,
    });

    const existingSheet = (spreadsheet.data.sheets || []).find((sheet) => sheet.properties?.title === GoogleConfig.LEADS_SHEET);
    if (!existingSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: GoogleConfig.LEADS_SHEET,
                gridProperties: {
                  frozenRowCount: 1,
                  rowCount: 2,
                  columnCount: requiredHeaders.length + 1,
                },
              },
            },
          }],
        },
      });

      await this.WriteHeaderRow(GoogleConfig.LEADS_SHEET, requiredHeaders);
      this.LeadHeaders = requiredHeaders;
      return this.LeadHeaders;
    }

    const headers = await this.SafeHeaders(GoogleConfig.LEADS_SHEET, []);
    if (headers.length === 0) {
      await this.EnsureGridColumns(existingSheet, requiredHeaders.length + 1);
      await this.WriteHeaderRow(GoogleConfig.LEADS_SHEET, requiredHeaders);
      this.LeadHeaders = requiredHeaders;
      return this.LeadHeaders;
    }

    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    const finalHeaders = [...headers, ...missingHeaders];
    await this.EnsureGridColumns(existingSheet, finalHeaders.length + 1);

    if (missingHeaders.length > 0) {
      const startColumn = headers.length + 1;
      await this.Client().spreadsheets.values.update({
        spreadsheetId: GoogleConfig.SPREADSHEET_ID,
        range: `${GoogleConfig.LEADS_SHEET}!${this.Column(startColumn)}1:${this.Column(startColumn + missingHeaders.length - 1)}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [missingHeaders] },
      });
    }

    this.LeadHeaders = finalHeaders;
    return this.LeadHeaders;
  }

  static async EnsureGridColumns(sheet: sheets_v4.Schema$Sheet, requiredColumnCount: number) {
    const sheetId = sheet.properties?.sheetId;
    const currentColumnCount = sheet.properties?.gridProperties?.columnCount || 0;
    if (sheetId === undefined || currentColumnCount >= requiredColumnCount) return;

    await this.Client().spreadsheets.batchUpdate({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                columnCount: requiredColumnCount,
              },
            },
            fields: "gridProperties.columnCount",
          },
        }],
      },
    });
  }

  static async WriteHeaderRow(sheetName: string, headers: string[]) {
    await this.Client().spreadsheets.values.update({
      spreadsheetId: GoogleConfig.SPREADSHEET_ID,
      range: `${sheetName}!A1:${this.Column(headers.length)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }

  static LeadValue(header: string, lead: LeadRequest) {
    const key = header.trim();
    if (!key) return "";

    const base: Record<string, unknown> = {
      created_at: new Date().toISOString(),
      name: lead.name || "",
      phone: this.FormatPhoneForSheet(lead.phone || ""),
      email: lead.email || "",
      telegram: lead.telegram || "",
      date: lead.date || "",
      guests: lead.guests || "",
      scenario: lead.scenario || "",
      consent: lead.consent === true ? "true" : lead.consent || "",
      meta_json: JSON.stringify(lead.meta || {}),
    };

    const direct = base[key] ?? (lead as Record<string, unknown>)[key] ?? lead.meta?.[key];
    if (direct === undefined || direct === null) return "";
    if (typeof direct === "object") return JSON.stringify(direct);
    return String(direct);
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
    const postId = (raw.post_id || "").trim();
    const publishAt = raw.publish_at || this.BuildPublishAt(raw);
    const platforms = this.Platforms(raw.platforms || raw.platform || "");
    const text = raw.text || raw.body || raw.caption || "";

    const mediaItems = this.Split(raw.media_ids || raw.media_id || "")
      .map((mediaId) => this.PostMediaItem(mediaId, mediaMap.get(mediaId)))
      .filter((item): item is PostMediaItem => Boolean(item));

    const mediaUrls = [
      ...this.Split(raw.media_urls || raw.media_url || raw.media || ""),
      ...mediaItems.map((item) => this.MediaUrl(item.raw)).filter(Boolean),
    ];

    if (!postId || !publishAt || platforms.length === 0) return null;
    if (!text.trim() && mediaItems.length === 0 && mediaUrls.length === 0) return null;

    return {
      ...row,
      post_uid: postId,
      status: raw.status || "",
      publish_at: publishAt,
      title: raw.title || "",
      text,
      media_urls: mediaUrls,
      media_items: mediaItems,
      platforms,
      post_type: this.ResolvePostType(raw.post_type || raw.type || "", mediaUrls),
      telegram_status: raw.telegram_status || "",
      telegram_lock_until: raw.telegram_lock_until || "",
      telegram_published_at: raw.telegram_published_at || "",
      telegram_message_id: raw.telegram_message_id || "",
      telegram_url: raw.telegram_url || "",
      telegram_error: raw.telegram_error || "",
      telegram_response: raw.telegram_response || "",
      vk_status: raw.vk_status || "",
      vk_lock_until: raw.vk_lock_until || "",
      vk_published_at: raw.vk_published_at || "",
      vk_post_id: raw.vk_post_id || "",
      vk_url: raw.vk_url || "",
      vk_error: raw.vk_error || "",
      vk_response: raw.vk_response || "",
      instagram_media_id: raw.instagram_media_id || "",
      facebook_post_id: raw.facebook_post_id || "",
    };
  }

  static IsReadyStatus(status: string) {
    return ["ready", "partial"].includes(status.trim().toLowerCase());
  }

  static BuildPublishAt(raw: Record<string, string>) {
    const date = raw.date || "";
    const time = raw.time || "";
    if (!date || !time) return "";
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
    if (raw.drive_url) return raw.drive_url;
    if (raw.file_id) return `https://drive.google.com/uc?export=download&id=${raw.file_id}`;
    return "";
  }

  static PostMediaItem(mediaId: string, raw?: Record<string, string>): PostMediaItem | null {
    if (!mediaId) return null;

    return {
      media_id: mediaId,
      file_id: raw?.file_id || "",
      name: raw?.name || mediaId,
      type: raw?.type || "",
      mime_type: raw?.mime_type || "",
      drive_url: raw?.drive_url || "",
      preview_url: raw?.preview_url || "",
      public_url: raw?.public_url || "",
      media_url: raw?.media_url || "",
      raw: raw || { media_id: mediaId },
    };
  }

  static InferPostType(mediaUrls: string[]) {
    if (mediaUrls.length > 1) return "album";
    if (mediaUrls.length === 1) return "image";
    return "text";
  }

  static ResolvePostType(value: string, mediaUrls: string[]): PostType {
    const clean = value.toLowerCase().trim();
    if (!clean) return this.PostType(this.InferPostType(mediaUrls));
    if (clean === "text" && mediaUrls.length > 0) return this.PostType(this.InferPostType(mediaUrls));
    return this.PostType(clean);
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

  static Platforms(value: string): Platform[] {
    const seen = new Set<Platform>();
    const platforms: Platform[] = [];

    this.Split(value, true).forEach((item) => {
      const platform = this.Platform(item);
      if (!platform || seen.has(platform)) return;
      seen.add(platform);
      platforms.push(platform);
    });

    return platforms;
  }

  static Platform(value: string): Platform | null {
    const clean = value.toLowerCase().trim();
    if (["telegram", "tg", "телеграм"].includes(clean)) return "telegram";
    if (["vk", "вк", "vkontakte"].includes(clean)) return "vk";
    if (["instagram", "ig", "inst", "инстаграм"].includes(clean)) return "instagram";
    if (["facebook", "fb", "фейсбук"].includes(clean)) return "facebook";
    return null;
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

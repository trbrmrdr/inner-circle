import { GoogleConfig } from "../config/GoogleConfig";

export interface SheetColumn {
  name: string;
  required?: boolean;
  defaultValue?: string;
  note?: string;
  numberFormat?: {
    type: string;
    pattern?: string;
  };
  pixelSize?: number;
}

export interface SheetDefinition {
  name: string;
  columns: SheetColumn[];
  frozenRows?: number;
}

export class SheetsSchema {
  static PostsBaseColumns: SheetColumn[] = [
    { name: "*date_marker" },
    { name: "post_id", required: true, note: "Internal unique post id." },
    { name: "date", note: "Used with time when publish_at is empty." },
    { name: "time", note: "Used with date when publish_at is empty." },
    { name: "platforms", required: true, note: "telegram, vk, instagram, facebook." },
    { name: "info/photo/context" },
    { name: "text", required: true },
    { name: "media_ids", note: "Resolved through MEDIA.media_id." },
    { name: "preview_1" },
    { name: "preview_2" },
    { name: "preview_3" },
    { name: "preview_4" },
    { name: "preview_5" },
    { name: "preview_6" },
    { name: "preview_7" },
    { name: "preview_8" },
    { name: "preview_9" },
    { name: "preview_10" },
    { name: "status", required: true, defaultValue: "draft" },
  ];

  static PostsServerColumns: SheetColumn[] = [
    { name: "post_type", defaultValue: "text" },
    { name: "publish_at" },
    { name: "attempt", defaultValue: "0" },
    { name: "lock_until" },
    { name: "telegram_message_id" },
    { name: "telegram_url" },
    { name: "vk_post_id" },
    { name: "vk_url" },
    { name: "instagram_media_id" },
    { name: "instagram_url" },
    { name: "facebook_post_id" },
    { name: "facebook_url" },
    { name: "last_error" },
    { name: "last_response" },
    { name: "updated_at" },
  ];

  static MediaBaseColumns: SheetColumn[] = [
    { name: "preview" },
    { name: "media_id", required: true },
    { name: "type" },
    { name: "file_status" },
    { name: "path" },
    { name: "name" },
    { name: "drive_url" },
    { name: "file_id" },
    { name: "mime_type" },
    { name: "preview_url" },
    { name: "created_at" },
    { name: "updated_at" },
    { name: "used_count" },
    { name: "posted_count" },
    { name: "last_posted_at" },
    { name: "used_in_posts" },
  ];

  static MediaServerColumns: SheetColumn[] = [
    { name: "public_url", note: "Public HTTPS media URL for Meta posting." },
    { name: "media_url", note: "Direct media URL fallback." },
  ];

  static LeadsColumns: SheetColumn[] = [
    { name: "created_at", required: true },
    { name: "name" },
    {
      name: "phone",
      numberFormat: { type: "TEXT" },
      pixelSize: 170,
      note: "Displayed as +7 999 000-00-00. Server receives raw digits and formats the sheet value.",
    },
    { name: "email" },
    { name: "telegram" },
    { name: "date" },
    { name: "guests" },
    { name: "scenario" },
    { name: "consent" },
    { name: "meta_json" },
  ];

  static LogsColumns: SheetColumn[] = [
    { name: "created_at", required: true },
    { name: "level", required: true },
    { name: "message", required: true },
    { name: "data_json" },
  ];

  static SettingsColumns: SheetColumn[] = [
    { name: "key", required: true },
    { name: "value" },
    { name: "description" },
  ];

  static SettingsDefaults = [
    ["autopost.enabled", "false", "Включает автопостинг из таблицы. Env AUTOPOST_ENABLED тоже должен быть включен, иначе worker не стартует."],
    ["autopost.interval_ms", "60000", "Частота проверки новых постов в миллисекундах для локального сервера или VPS."],
    ["autopost.batch_limit", "3", "Максимальное количество постов за один проход автопостинга."],
    ["parser.enabled", "false", "Резерв для будущего парсера комментариев и реакций. Сейчас не используется."],
    ["parser.interval_ms", "300000", "Резервная частота запуска будущего парсера в миллисекундах."],
  ];

  static Definitions(): SheetDefinition[] {
    return [
      {
        name: GoogleConfig.POSTS_SHEET,
        frozenRows: 1,
        columns: [...this.PostsBaseColumns, ...this.PostsServerColumns],
      },
      {
        name: GoogleConfig.MEDIA_SHEET,
        frozenRows: 1,
        columns: [...this.MediaBaseColumns, ...this.MediaServerColumns],
      },
      {
        name: GoogleConfig.LEADS_SHEET,
        frozenRows: 1,
        columns: this.LeadsColumns,
      },
      {
        name: GoogleConfig.LOGS_SHEET,
        frozenRows: 1,
        columns: this.LogsColumns,
      },
      {
        name: GoogleConfig.SETTINGS_SHEET,
        frozenRows: 1,
        columns: this.SettingsColumns,
      },
    ];
  }
}

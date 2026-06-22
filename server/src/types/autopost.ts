export type Platform = "telegram" | "vk" | "instagram" | "facebook";
export type ServicePlatform = Platform | "email" | `email:${string}` | "sheets" | "telegram-tech";
export type PostStatus = "" | "template" | "draft" | "ready" | "processing" | "posted" | "partial" | "error" | "skipped" | "done";

export type PostType =
  | "text"
  | "image"
  | "video"
  | "album"
  | "reel"
  | "story"
  | "carousel";

export interface SheetRow {
  rowNumber: number;
  raw: Record<string, string>;
}

export interface PostTask extends SheetRow {
  post_uid: string;
  status: PostStatus | string;
  publish_at?: string;
  title?: string;
  text: string;
  media_urls: string[];
  media_items: PostMediaItem[];
  platforms: Platform[];
  post_type: PostType;
  telegram_status?: string;
  telegram_lock_until?: string;
  telegram_published_at?: string;
  telegram_message_id?: string;
  telegram_url?: string;
  telegram_error?: string;
  telegram_response?: string;
  vk_status?: string;
  vk_lock_until?: string;
  vk_published_at?: string;
  vk_post_id?: string;
  vk_url?: string;
  vk_error?: string;
  vk_response?: string;
  instagram_media_id?: string;
  facebook_post_id?: string;
}

export interface PostMediaItem {
  media_id: string;
  file_id?: string;
  name?: string;
  type?: string;
  mime_type?: string;
  drive_url?: string;
  preview_url?: string;
  public_url?: string;
  media_url?: string;
  raw: Record<string, string>;
}

export interface DownloadedMedia {
  media: PostMediaItem;
  sourcePath: string;
  filename: string;
  mime_type: string;
  size: number;
}

export type PreparedMediaAssetType = "photo" | "video";

export interface PreparedMedia {
  media_id: string;
  originalPath: string;
  preparedPath: string;
  filename: string;
  mime_type: string;
  asset_type: PreparedMediaAssetType;
  size: number;
  converted: boolean;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailPath?: string;
  thumbnailFilename?: string;
  notes?: string[];
}

export interface PreparedPost {
  task: PostTask;
  run_id: string;
  rootDir: string;
  sourceDir: string;
  platformDir: string;
  manifestPath: string;
  text: string;
  media: PreparedMedia[];
  warnings?: string[];
}

export interface LeadRequest {
  name?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  date?: string;
  guests?: string;
  scenario?: string;
  consent?: string | boolean;
  captchaScore?: string;
  captchaAction?: string;
  captchaToken?: string;
  meta?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  platform: ServicePlatform;
  skipped?: boolean;
  disabled?: boolean;
  id?: string;
  url?: string;
  message?: string;
  stats?: PublishStats;
  raw?: unknown;
}

export interface PublishStats {
  textLength?: number;
  mediaCount?: number;
  photoCount?: number;
  videoCount?: number;
  warningCount?: number;
}

export interface PreparedText {
  telegram: string;
  vk: string;
  instagram: string;
  facebook: string;
}

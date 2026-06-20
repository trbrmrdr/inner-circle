export type Platform = "telegram" | "vk" | "instagram" | "facebook";
export type ServicePlatform = Platform | "email" | `email:${string}` | "sheets" | "telegram-tech";

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
  status: string;
  publish_at?: string;
  title?: string;
  text: string;
  media_urls: string[];
  media_items: PostMediaItem[];
  platforms: Platform[];
  post_type: PostType;
  attempt: number;
  telegram_message_id?: string;
  vk_post_id?: string;
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
  raw?: unknown;
}

export interface PreparedText {
  telegram: string;
  vk: string;
  instagram: string;
  facebook: string;
}

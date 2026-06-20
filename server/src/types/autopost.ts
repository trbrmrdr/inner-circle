export type Platform = "telegram" | "vk" | "instagram" | "facebook";

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
  platforms: Platform[];
  post_type: PostType;
  attempt: number;
  telegram_message_id?: string;
  vk_post_id?: string;
  instagram_media_id?: string;
  facebook_post_id?: string;
}

export interface LeadRequest {
  name?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  message?: string;
  page?: string;
  source?: string;
  meta?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  platform: Platform | "email" | "sheets" | "telegram-tech";
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

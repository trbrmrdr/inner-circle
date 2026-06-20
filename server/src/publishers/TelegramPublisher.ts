import { TelegramConfig } from "../config/TelegramConfig";
import { PostTask, PublishResult } from "../types/autopost";
import { HttpHelper } from "../core/HttpHelper";
import { MediaPrepareHelper } from "../core/MediaPrepareHelper";

export class TelegramPublisher {
  static async SendTechMessage(text: string): Promise<PublishResult> {
    if (!TelegramConfig.IsTechReady()) {
      return { ok: false, disabled: true, platform: "telegram-tech", message: "Telegram tech bot is not configured" };
    }

    const result = await this.Call("sendMessage", {
      chat_id: TelegramConfig.TECH_CHAT_ID,
      text,
      parse_mode: TelegramConfig.PARSE_MODE,
      disable_web_page_preview: true,
    });

    return {
      ok: true,
      platform: "telegram-tech",
      id: String(result?.result?.message_id || ""),
      raw: result,
    };
  }

  static async EditTechMessage(messageId: string, text: string): Promise<PublishResult> {
    if (!TelegramConfig.IsTechReady()) {
      return { ok: false, disabled: true, platform: "telegram-tech", message: "Telegram tech bot is not configured" };
    }

    const result = await this.Call("editMessageText", {
      chat_id: TelegramConfig.TECH_CHAT_ID,
      message_id: messageId,
      text,
      parse_mode: TelegramConfig.PARSE_MODE,
      disable_web_page_preview: true,
    });

    return {
      ok: true,
      platform: "telegram-tech",
      id: messageId,
      raw: result,
    };
  }

  static async PublishPost(task: PostTask, text: string): Promise<PublishResult> {
    if (!TelegramConfig.IsBotReady() || !TelegramConfig.PUBLIC_CHAT_ID) {
      return { ok: false, disabled: true, platform: "telegram", message: "Telegram public bot is not configured" };
    }

    const mediaUrls = MediaPrepareHelper.NormalizeUrls(task);
    if (mediaUrls.length === 0 || task.post_type === "text") {
      const result = await this.Call("sendMessage", {
        chat_id: TelegramConfig.PUBLIC_CHAT_ID,
        text: this.Limit(text, 4096),
        parse_mode: TelegramConfig.PARSE_MODE,
        disable_web_page_preview: false,
      });

      return this.Result(result);
    }

    if (mediaUrls.length > 1 && task.post_type !== "video") {
      const media = mediaUrls.slice(0, 10).map((url, index) => ({
        type: MediaPrepareHelper.IsVideo(url) ? "video" : "photo",
        media: url,
        caption: index === 0 ? this.Limit(text, 1024) : undefined,
        parse_mode: index === 0 ? TelegramConfig.PARSE_MODE : undefined,
      }));

      const result = await this.Call("sendMediaGroup", {
        chat_id: TelegramConfig.PUBLIC_CHAT_ID,
        media,
      });

      return this.Result(result, Array.isArray(result?.result) ? String(result.result[0]?.message_id || "") : "");
    }

    const firstMedia = mediaUrls[0];
    const method = MediaPrepareHelper.IsVideo(firstMedia) ? "sendVideo" : "sendPhoto";
    const result = await this.Call(method, {
      chat_id: TelegramConfig.PUBLIC_CHAT_ID,
      [method === "sendVideo" ? "video" : "photo"]: firstMedia,
      caption: this.Limit(text, 1024),
      parse_mode: TelegramConfig.PARSE_MODE,
    });

    return this.Result(result);
  }

  static async Call(method: string, data: Record<string, unknown>) {
    return HttpHelper.Json<any>({
      method: "POST",
      url: `${TelegramConfig.API_URL}${TelegramConfig.BOT_TOKEN}/${method}`,
      headers: { "Content-Type": "application/json" },
      data,
    });
  }

  static Result(result: any, forcedId = ""): PublishResult {
    const messageId = forcedId || String(result?.result?.message_id || "");
    return {
      ok: Boolean(result?.ok),
      platform: "telegram",
      id: messageId,
      raw: result,
      message: result?.description,
    };
  }

  static Limit(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
  }
}

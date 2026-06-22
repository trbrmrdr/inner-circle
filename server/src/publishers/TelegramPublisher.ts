import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { TelegramConfig } from "../config/TelegramConfig";
import { PreparedMedia, PreparedPost, PostTask, PublishResult, ServicePlatform } from "../types/autopost";
import { AiTextHelper } from "../core/AiTextHelper";
import { HttpHelper } from "../core/HttpHelper";
import { MediaPipeline } from "../media/MediaPipeline";

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

  static async DeleteTechMessage(messageId: string): Promise<PublishResult> {
    if (!TelegramConfig.IsTechReady()) {
      return { ok: false, disabled: true, platform: "telegram-tech", message: "Telegram tech bot is not configured" };
    }

    const result = await this.Call("deleteMessage", {
      chat_id: TelegramConfig.TECH_CHAT_ID,
      message_id: messageId,
    });

    return {
      ok: true,
      platform: "telegram-tech",
      id: messageId,
      raw: result,
    };
  }

  static async PublishPost(task: PostTask, text = ""): Promise<PublishResult> {
    if (!TelegramConfig.IsBotReady() || !TelegramConfig.PUBLIC_CHAT_ID) {
      return { ok: false, disabled: true, platform: "telegram", message: "Telegram public bot is not configured" };
    }

    const preparedText = text.trim()
      ? text
      : task.text.trim()
        ? (await AiTextHelper.PreparePostText(task)).telegram
        : "";
    const prepared = await MediaPipeline.PrepareTelegramPost(task, preparedText);
    const result = this.WithPreparedMeta(
      await this.PublishPreparedPostToChat(TelegramConfig.PUBLIC_CHAT_ID, prepared, "telegram"),
      prepared,
    );
    if ((prepared.warnings || []).length > 0) {
      result.message = `Published with ${prepared.warnings?.length || 0} media warning(s)`;
    }

    if (result.ok) {
      try {
        MediaPipeline.Cleanup(prepared);
      } catch (error) {
        this.AddRawWarning(result, `temp cleanup failed: ${HttpHelper.ErrorMessage(error)}`);
      }
    }

    return result;
  }

  static async PublishPreparedPostToTech(prepared: PreparedPost): Promise<PublishResult> {
    if (!TelegramConfig.IsTechReady()) {
      return { ok: false, disabled: true, platform: "telegram-tech", message: "Telegram tech bot is not configured" };
    }

    return this.PublishPreparedPostToChat(TelegramConfig.TECH_CHAT_ID, prepared, "telegram-tech");
  }

  static async PublishPreparedPostToChat(
    chatId: string,
    prepared: PreparedPost,
    platform: ServicePlatform = "telegram",
  ): Promise<PublishResult> {
    const text = prepared.text.trim();
    this.ValidatePreparedMedia(prepared.media);

    if (prepared.media.length === 0) {
      if (!text) {
        throw new Error("Telegram post has no text and no prepared media.");
      }

      const result = await this.Call("sendMessage", {
        chat_id: chatId,
        text: this.Limit(text, TelegramConfig.MESSAGE_TEXT_LIMIT),
        parse_mode: TelegramConfig.PARSE_MODE,
        disable_web_page_preview: false,
      });

      return this.WithMessageUrl(this.Result(result, "", platform), chatId);
    }

    if (prepared.media.length > TelegramConfig.MEDIA_GROUP_LIMIT) {
      throw new Error(`Telegram media group supports 2-${TelegramConfig.MEDIA_GROUP_LIMIT} media items. Got ${prepared.media.length}.`);
    }

    if (prepared.media.length > 1) {
      const result = await this.SendMediaGroupFiles(chatId, prepared.media, text);
      return this.WithMessageUrl(
        this.Result(result, Array.isArray(result?.result) ? String(result.result[0]?.message_id || "") : "", platform),
        chatId,
      );
    }

    const result = await this.SendSingleMedia(chatId, prepared.media[0], text);
    return this.WithMessageUrl(this.Result(result, "", platform), chatId);
  }

  static async SendSingleMedia(chatId: string, media: PreparedMedia, caption: string) {
    const safeCaption = this.MediaCaption(caption);
    if (media.asset_type === "photo") {
      return this.CallForm("sendPhoto", {
        chat_id: chatId,
        caption: safeCaption,
        parse_mode: TelegramConfig.PARSE_MODE,
        show_caption_above_media: "true",
      }, "photo", media.preparedPath, media.filename);
    }

    if (media.asset_type === "video") {
      return this.CallFormFiles("sendVideo", this.VideoFields(chatId, media, safeCaption), [
        { field: "video", path: media.preparedPath, filename: media.filename },
        ...(media.thumbnailPath && media.thumbnailFilename
          ? [{ field: "thumbnail", path: media.thumbnailPath, filename: media.thumbnailFilename }]
          : []),
      ]);
    }

    throw new Error(`Telegram autopost supports only photo/video media. Got ${media.asset_type}.`);
  }

  static VideoFields(chatId: string, media: PreparedMedia, caption: string) {
    return {
      chat_id: chatId,
      caption,
      parse_mode: TelegramConfig.PARSE_MODE,
      show_caption_above_media: "true",
      supports_streaming: "true",
      ...(media.width ? { width: String(media.width) } : {}),
      ...(media.height ? { height: String(media.height) } : {}),
      ...(media.duration ? { duration: String(Math.round(media.duration)) } : {}),
    };
  }

  static async SendMediaGroupFiles(chatId: string, media: PreparedMedia[], caption: string) {
    const form = new FormData();
    form.append("chat_id", chatId);
    const safeCaption = this.MediaCaption(caption);

    const payload = media.map((item, index) => {
      const attachName = `media_${index}`;
      form.append(attachName, fs.createReadStream(item.preparedPath), item.filename);
      const thumbnailAttachName = `thumb_${index}`;
      if (item.asset_type === "video" && item.thumbnailPath && item.thumbnailFilename) {
        form.append(thumbnailAttachName, fs.createReadStream(item.thumbnailPath), item.thumbnailFilename);
      }

      return {
        type: item.asset_type === "video" ? "video" : "photo",
        media: `attach://${attachName}`,
        thumbnail: item.asset_type === "video" && item.thumbnailPath ? `attach://${thumbnailAttachName}` : undefined,
        width: item.asset_type === "video" ? item.width : undefined,
        height: item.asset_type === "video" ? item.height : undefined,
        duration: item.asset_type === "video" && item.duration ? Math.round(item.duration) : undefined,
        supports_streaming: item.asset_type === "video" ? true : undefined,
        caption: index === 0 && safeCaption ? safeCaption : undefined,
        parse_mode: index === 0 && safeCaption ? TelegramConfig.PARSE_MODE : undefined,
        show_caption_above_media: true,
      };
    });

    form.append("media", JSON.stringify(payload));
    return this.CallFormData("sendMediaGroup", form);
  }

  static async Call(method: string, data: Record<string, unknown>) {
    return HttpHelper.Json<any>({
      method: "POST",
      url: `${TelegramConfig.API_URL}${TelegramConfig.BOT_TOKEN}/${method}`,
      headers: { "Content-Type": "application/json" },
      data,
    });
  }

  static async CallForm(
    method: string,
    fields: Record<string, string>,
    fileField: string,
    filePath: string,
    filename: string,
  ) {
    return this.CallFormFiles(method, fields, [{ field: fileField, path: filePath, filename }]);
  }

  static async CallFormFiles(
    method: string,
    fields: Record<string, string | undefined>,
    files: Array<{ field: string; path: string; filename: string }>,
  ) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== "") form.append(key, value);
    });
    files.forEach((file) => form.append(file.field, fs.createReadStream(file.path), file.filename));
    return this.CallFormData(method, form);
  }

  static async CallFormData(method: string, form: FormData) {
    const response = await axios.post(`${TelegramConfig.API_URL}${TelegramConfig.BOT_TOKEN}/${method}`, form, {
      headers: form.getHeaders(),
      timeout: 120_000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status >= 400 || response.data?.ok === false) {
      throw new Error(HttpHelper.ErrorText(response.data, response.status));
    }

    return response.data;
  }

  static Result(result: any, forcedId = "", platform: ServicePlatform = "telegram"): PublishResult {
    const messageId = forcedId || String(result?.result?.message_id || "");
    return {
      ok: Boolean(result?.ok),
      platform,
      id: messageId,
      raw: result,
      message: result?.description,
    };
  }

  static WithMessageUrl(result: PublishResult, chatId: string) {
    if (!result.id) return result;
    return {
      ...result,
      url: this.MessageUrl(chatId, result.id),
    };
  }

  static WithPreparedMeta(result: PublishResult, prepared: PreparedPost) {
    const stats = this.PreparedStats(prepared);
    return {
      ...result,
      stats,
      raw: {
        telegram: result.raw,
        warnings: prepared.warnings || [],
        media: prepared.media.map((item) => item.media_id),
        stats,
        manifestPath: prepared.manifestPath,
      },
    };
  }

  static PreparedStats(prepared: PreparedPost) {
    const photoCount = prepared.media.filter((item) => item.asset_type === "photo").length;
    const videoCount = prepared.media.filter((item) => item.asset_type === "video").length;
    return {
      textLength: prepared.text.length,
      mediaCount: prepared.media.length,
      photoCount,
      videoCount,
      warningCount: prepared.warnings?.length || 0,
    };
  }

  static AddRawWarning(result: PublishResult, message: string) {
    if (!result.raw || typeof result.raw !== "object" || Array.isArray(result.raw)) {
      result.raw = { value: result.raw, warnings: [message] };
      return;
    }

    const raw = result.raw as { warnings?: string[] };
    raw.warnings = [...(raw.warnings || []), message];
  }

  static MessageUrl(chatId: string, messageId: string) {
    if (!messageId) return "";
    if (chatId.startsWith("@")) return `https://t.me/${chatId.slice(1)}/${messageId}`;
    if (chatId.startsWith("-100")) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
    return "";
  }

  static Limit(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
  }

  static MediaCaption(text: string) {
    const clean = text.trim();
    if (clean.length > TelegramConfig.MEDIA_CAPTION_LIMIT) {
      throw new Error(`Telegram media caption limit is ${TelegramConfig.MEDIA_CAPTION_LIMIT} characters. Prepared text has ${clean.length}.`);
    }

    return clean;
  }

  static ValidatePreparedMedia(media: PreparedMedia[]) {
    const invalid = media.find((item) => item.asset_type !== "photo" && item.asset_type !== "video");
    if (invalid) {
      throw new Error(`Telegram autopost supports only photo/video media. ${invalid.media_id} is ${invalid.asset_type}.`);
    }
  }

  static EscapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

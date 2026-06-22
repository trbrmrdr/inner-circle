import { DeepSeekConfig } from "../config/DeepSeekConfig";
import { TelegramConfig } from "../config/TelegramConfig";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";
import { PostTask, PreparedText } from "../types/autopost";
import { DeepSeekPrompts } from "./DeepSeekPrompts";
import { HttpHelper } from "./HttpHelper";

interface DeepSeekRuntimeSettings {
  enabled: boolean;
  telegramPrompt: string;
}

export class AiTextHelper {
  static SettingsCache: { loadedAt: number; settings: DeepSeekRuntimeSettings } | null = null;
  static SettingsCacheMs = 60_000;

  static async PreparePostText(task: PostTask): Promise<PreparedText> {
    const fallback = this.Fallback(task);
    const settings = await this.LoadSettings();
    if (!DeepSeekConfig.API_KEY || !DeepSeekConfig.ENABLED || !settings.enabled) return fallback;

    const telegramLimit = this.TelegramLimit(task);
    const prompt = [
      "Rewrite the source text for Telegram autoposting and return strict JSON.",
      "Return only JSON with key telegram.",
      "Keep meaning, facts, names, prices and contacts unchanged.",
      `Telegram output must be <= ${telegramLimit} characters.`,
      "",
      "Telegram-specific prompt:",
      this.TelegramPrompt(telegramLimit, settings.telegramPrompt),
      "",
      `Post type: ${task.post_type || ""}`,
      `Telegram media count: ${this.TelegramMediaCount(task)}`,
      `Telegram has video: ${this.HasTelegramVideo(task) ? "yes" : "no"}`,
      "",
      `Title: ${task.title || ""}`,
      `Source text: ${task.text}`,
    ].join("\n");

    try {
      const data = await HttpHelper.Json<any>({
        method: "POST",
        url: DeepSeekConfig.API_URL,
        headers: {
          Authorization: `Bearer ${DeepSeekConfig.API_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          model: DeepSeekConfig.MODEL,
          messages: [
            {
              role: "system",
              content: "You prepare safe, compact social media post text and return strict JSON.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        },
      });

      const content = data?.choices?.[0]?.message?.content;
      const parsed = typeof content === "string" ? JSON.parse(content) : {};

      return {
        telegram: this.ToTelegramText(parsed.telegram, fallback.telegram, telegramLimit),
        vk: fallback.vk,
        instagram: fallback.instagram,
        facebook: fallback.facebook,
      };
    } catch (error) {
      return fallback;
    }
  }

  static Fallback(taskOrText: PostTask | string): PreparedText {
    const text = typeof taskOrText === "string" ? taskOrText : taskOrText.text;
    const telegramLimit = typeof taskOrText === "string" ? TelegramConfig.MESSAGE_TEXT_LIMIT : this.TelegramLimit(taskOrText);
    const clean = this.NormalizePlain(text);

    return {
      telegram: this.EscapeAndLimitPlain(clean, telegramLimit),
      vk: clean,
      instagram: clean,
      facebook: clean,
    };
  }

  static ToText(value: unknown, fallback: string) {
    if (typeof value !== "string") return fallback;
    const clean = value.trim();
    return clean || fallback;
  }

  static ToTelegramText(value: unknown, fallback: string, max: number) {
    if (typeof value !== "string") return fallback;
    const clean = this.NormalizeTelegramHtml(value);
    if (!clean) return fallback;
    if (this.HasUnsupportedHtmlTags(clean) || !this.HasBalancedHtmlTags(clean)) {
      return this.EscapeAndLimitPlain(clean, max);
    }

    if (clean.length > max) {
      return this.EscapeAndLimitPlain(clean, max);
    }

    return clean;
  }

  static async LoadSettings(): Promise<DeepSeekRuntimeSettings> {
    const now = Date.now();
    if (this.SettingsCache && now - this.SettingsCache.loadedAt < this.SettingsCacheMs) {
      return this.SettingsCache.settings;
    }

    try {
      const settings = await GoogleSheetsService.ReadSettings();
      const loaded = {
        enabled: this.Bool(settings, "deepseek.enabled", DeepSeekConfig.ENABLED),
        telegramPrompt: this.Str(settings, "deepseek.telegram.prompt", ""),
      };
      this.SettingsCache = { loadedAt: now, settings: loaded };
      return loaded;
    } catch {
      const fallback = {
        enabled: DeepSeekConfig.ENABLED,
        telegramPrompt: "",
      };
      this.SettingsCache = { loadedAt: now, settings: fallback };
      return fallback;
    }
  }

  static Bool(settings: Map<string, string>, key: string, fallback: boolean) {
    const raw = settings.get(key);
    if (raw === undefined || raw.trim() === "") return fallback;
    return ["1", "true", "yes", "on", "да"].includes(raw.trim().toLowerCase());
  }

  static Str(settings: Map<string, string>, key: string, fallback: string) {
    const raw = settings.get(key);
    if (raw === undefined || raw.trim() === "") return fallback;
    return raw.trim();
  }

  static TelegramPrompt(limit: number, settingsPrompt = "") {
    const template = this.PlatformPrompt(settingsPrompt, DeepSeekPrompts.TELEGRAM_EN, DeepSeekPrompts.TELEGRAM_RU);

    return template.replace("{{telegram_limit}}", String(limit));
  }

  static VkPrompt(settingsPrompt = "") {
    return this.PlatformPrompt(settingsPrompt, DeepSeekPrompts.VK_EN, DeepSeekPrompts.VK_RU);
  }

  static PlatformPrompt(settingsPrompt: string, englishDefault: string, russianDefault: string) {
    return settingsPrompt.trim() || (DeepSeekConfig.PROMPT_LANGUAGE === "en" ? englishDefault : russianDefault);
  }

  static TelegramLimit(task: PostTask) {
    return this.TelegramMediaCount(task) > 0 && task.post_type !== "text"
      ? TelegramConfig.MEDIA_CAPTION_LIMIT
      : TelegramConfig.MESSAGE_TEXT_LIMIT;
  }

  static TelegramMediaCount(task: PostTask) {
    return Math.max(task.media_items?.length || 0, task.media_urls?.length || 0);
  }

  static HasTelegramVideo(task: PostTask) {
    return (task.media_items || []).some((item) => {
      const type = `${item.type || ""} ${item.mime_type || ""}`.toLowerCase();
      return type.includes("video");
    }) || (task.media_urls || []).some((url) => /\.(mp4|m4v|mov|webm)(?:[?#].*)?$/i.test(url));
  }

  static NormalizeTelegramHtml(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(\/?)strong(?:\s+[^>]*)?>/gi, "<$1b>")
      .replace(/<(\/?)em(?:\s+[^>]*)?>/gi, "<$1i>")
      .replace(/<(\/?)(b|i|u|s|code|pre)(?:\s+[^>]*)?>/gi, "<$1$2>")
      .replace(/<a\s+href=(["'])([^"']+)\1[^>]*>/gi, (_match, _quote, url) => `<a href="${this.EscapeAttribute(url)}">`)
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  static NormalizePlain(value: string) {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  static HasUnsupportedHtmlTags(value: string) {
    const allowed = new Set(["b", "i", "u", "s", "code", "pre", "a"]);
    const tags = value.matchAll(/<\/?([a-zA-Z][\w:-]*)(?:\s+[^>]*)?>/g);
    for (const tag of tags) {
      if (!allowed.has(tag[1].toLowerCase())) return true;
    }

    return false;
  }

  static HasBalancedHtmlTags(value: string) {
    const paired = ["b", "i", "u", "s", "code", "pre", "a"];
    return paired.every((tag) => {
      const open = value.match(new RegExp(`<${tag}(?:\\s+[^>]*)?>`, "gi"))?.length || 0;
      const close = value.match(new RegExp(`</${tag}>`, "gi"))?.length || 0;
      return open === close;
    });
  }

  static StripHtml(value: string) {
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
  }

  static EscapeAndLimitPlain(value: string, max: number) {
    const plain = this.NormalizePlain(this.StripHtml(value));
    if (this.EscapeHtml(plain).length <= max) return this.EscapeHtml(plain);

    const suffix = "...";
    let end = Math.max(0, max - suffix.length);
    let clipped = `${plain.slice(0, end).trimEnd()}${suffix}`;

    while (end > 0 && this.EscapeHtml(clipped).length > max) {
      end -= 1;
      clipped = `${plain.slice(0, end).trimEnd()}${suffix}`;
    }

    return this.EscapeHtml(clipped).slice(0, max);
  }

  static EscapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  static EscapeAttribute(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "");
  }
}

import { DeepSeekConfig } from "../config/DeepSeekConfig";
import { TelegramConfig } from "../config/TelegramConfig";
import { PostTask, PreparedText } from "../types/autopost";
import { HttpHelper } from "./HttpHelper";

export class AiTextHelper {
  static TELEGRAM_PROMPT_RU =
    "Подготовь красивый Telegram-текст для автопостинга.\n\
Сохрани факты, имена, цены, даты, адреса, ссылки и контакты без выдумок.\n\
Можно использовать только Telegram HTML: <b>, <i>, <u>, <s>, <code>, <pre>, <a href=\"...\">.\n\
Не используй Markdown, списки с тяжелой версткой, таблицы и неподдерживаемые HTML-теги.\n\
Если у поста есть медиа, текст станет caption первого медиа в альбоме.\n\
Сделай текст плотным, читаемым и не длиннее {{telegram_limit}} символов.";

  static TELEGRAM_PROMPT_EN =
    "Prepare a polished Telegram caption for autoposting.\n\
Keep facts, names, prices, dates, addresses, links and contacts unchanged. Do not invent details.\n\
Use only Telegram HTML: <b>, <i>, <u>, <s>, <code>, <pre>, <a href=\"...\">.\n\
Do not use Markdown, heavy tables, or unsupported HTML tags.\n\
If the post has media, this text will be the caption of the first media item in one album.\n\
Make it compact, readable, and no longer than {{telegram_limit}} characters.";

  static async PreparePostText(task: PostTask): Promise<PreparedText> {
    const fallback = this.Fallback(task);
    if (!DeepSeekConfig.IsReady()) return fallback;

    const telegramLimit = this.TelegramLimit(task);
    const prompt = [
      "Rewrite the source text for social media autoposting and return strict JSON.",
      "Return only JSON with keys telegram, vk, instagram, facebook.",
      "Keep meaning, facts, names, prices and contacts unchanged.",
      `Telegram output must be <= ${telegramLimit} characters.`,
      "VK should be readable without HTML.",
      "Instagram should be concise and may include 3-8 hashtags if relevant.",
      "Facebook should be neutral and readable.",
      "",
      "Telegram-specific prompt:",
      this.TelegramPrompt(telegramLimit),
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
        vk: this.ToText(parsed.vk, fallback.vk),
        instagram: this.ToText(parsed.instagram, fallback.instagram),
        facebook: this.ToText(parsed.facebook, fallback.facebook),
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

  static TelegramPrompt(limit: number) {
    const template = DeepSeekConfig.PROMPT_LANGUAGE === "en"
      ? this.TELEGRAM_PROMPT_EN
      : this.TELEGRAM_PROMPT_RU;

    return template.replace("{{telegram_limit}}", String(limit));
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

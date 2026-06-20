import { DeepSeekConfig } from "../config/DeepSeekConfig";
import { PostTask, PreparedText } from "../types/autopost";
import { HttpHelper } from "./HttpHelper";

export class AiTextHelper {
  static async PreparePostText(task: PostTask): Promise<PreparedText> {
    const fallback = this.Fallback(task.text);
    if (!DeepSeekConfig.IsReady()) return fallback;

    const prompt = [
      "Rewrite the source text for social media autoposting.",
      "Return only JSON with keys telegram, vk, instagram, facebook.",
      "Keep meaning, facts, names, prices and contacts unchanged.",
      "Telegram may use HTML tags: b, i, u, s, code, pre, a.",
      "VK should be readable without HTML.",
      "Instagram should be concise and may include 3-8 hashtags if relevant.",
      "Facebook should be neutral and readable.",
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
        telegram: this.ToText(parsed.telegram, fallback.telegram),
        vk: this.ToText(parsed.vk, fallback.vk),
        instagram: this.ToText(parsed.instagram, fallback.instagram),
        facebook: this.ToText(parsed.facebook, fallback.facebook),
      };
    } catch (error) {
      return {
        ...fallback,
        telegram: `${fallback.telegram}\n\n<blockquote>DeepSeek fallback: ${this.EscapeHtml(HttpHelper.ErrorMessage(error))}</blockquote>`,
      };
    }
  }

  static Fallback(text: string): PreparedText {
    const clean = text.trim();
    return {
      telegram: clean,
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

  static EscapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

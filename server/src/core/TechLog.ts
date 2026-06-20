import { TelegramPublisher } from "../publishers/TelegramPublisher";
import { AiTextHelper } from "./AiTextHelper";
import { HttpHelper } from "./HttpHelper";

export class TechLog {
  static LastStatusMessageId = "";

  static async Message(text: string) {
    try {
      return await TelegramPublisher.SendTechMessage(text);
    } catch (error) {
      console.error("[tech-log]", HttpHelper.ErrorMessage(error));
      return { ok: false, platform: "telegram-tech" as const, message: HttpHelper.ErrorMessage(error) };
    }
  }

  static async Error(title: string, error: unknown) {
    return this.Message(`<b>${AiTextHelper.EscapeHtml(title)}</b>\n<pre>${AiTextHelper.EscapeHtml(HttpHelper.ErrorMessage(error))}</pre>`);
  }

  static async Status(text: string) {
    const safeText = AiTextHelper.EscapeHtml(text);
    try {
      if (this.LastStatusMessageId) {
        await TelegramPublisher.EditTechMessage(this.LastStatusMessageId, `<b>Server status</b>\n${safeText}`);
        return;
      }

      const result = await TelegramPublisher.SendTechMessage(`<b>Server status</b>\n${safeText}`);
      if (result.id) this.LastStatusMessageId = result.id;
    } catch (error) {
      console.error("[tech-status]", HttpHelper.ErrorMessage(error));
    }
  }
}

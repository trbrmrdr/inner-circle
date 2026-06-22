import fs from "fs";
import path from "path";
import { ServerConfig } from "../config/ServerConfig";
import { TelegramPublisher } from "../publishers/TelegramPublisher";
import { AiTextHelper } from "./AiTextHelper";
import { HttpHelper } from "./HttpHelper";

interface TechLogState {
  statusMessageId?: string;
  lastMessageId?: string;
}

export class TechLog {
  static LastStatusMessageId = "";
  static LastMessageId = "";
  static StateLoaded = false;
  static ShouldRefreshPersistedStatus = false;
  static StatePath = path.join(ServerConfig.TMP_DIR, "tech-log-state.json");

  static async Message(text: string) {
    try {
      const result = await TelegramPublisher.SendTechMessage(text);
      this.TrackMessage(result.id || "");
      return result;
    } catch (error) {
      console.error("[tech-log]", HttpHelper.ErrorMessage(error));
      return { ok: false, platform: "telegram-tech" as const, message: HttpHelper.ErrorMessage(error) };
    }
  }

  static async Error(title: string, error: unknown) {
    return this.Message(`<b>${AiTextHelper.EscapeHtml(title)}</b>\n<pre>${AiTextHelper.EscapeHtml(HttpHelper.ErrorMessage(error))}</pre>`);
  }

  static async Status(text: string) {
    this.LoadState();
    const safeText = AiTextHelper.EscapeHtml(text);
    const statusText = `<b>Server status</b>\n${safeText}`;

    try {
      if (this.ShouldCreateFreshStatus()) {
        await this.CreateFreshStatus(statusText, true);
        return;
      }

      if (this.LastStatusMessageId) {
        try {
          await TelegramPublisher.EditTechMessage(this.LastStatusMessageId, statusText);
          return;
        } catch (error) {
          if (this.IsNotModified(error)) return;
          await this.CreateFreshStatus(statusText, true);
          return;
        }
      }

      await this.CreateFreshStatus(statusText, false);
    } catch (error) {
      console.error("[tech-status]", HttpHelper.ErrorMessage(error));
    }
  }

  static ShouldCreateFreshStatus() {
    if (this.ShouldRefreshPersistedStatus) {
      this.ShouldRefreshPersistedStatus = false;
      return true;
    }

    if (!this.LastStatusMessageId) return true;
    if (!this.LastMessageId) return false;
    return this.LastMessageId !== this.LastStatusMessageId;
  }

  static async CreateFreshStatus(text: string, deletePrevious: boolean) {
    const previousStatusId = this.LastStatusMessageId;
    const result = await TelegramPublisher.SendTechMessage(text);

    if (result.id) {
      this.LastStatusMessageId = result.id;
      this.LastMessageId = result.id;
      this.SaveState();
    }

    if (deletePrevious && previousStatusId && previousStatusId !== this.LastStatusMessageId) {
      await this.DeleteOldStatus(previousStatusId);
    }
  }

  static async DeleteOldStatus(messageId: string) {
    try {
      await TelegramPublisher.DeleteTechMessage(messageId);
    } catch {
      // The message may already be deleted or too old. A fresh status exists, so ignore this.
    }
  }

  static TrackMessage(messageId: string) {
    this.LoadState();
    if (!messageId) return;
    this.LastMessageId = messageId;
    this.SaveState();
  }

  static LoadState() {
    if (this.StateLoaded) return;
    this.StateLoaded = true;

    try {
      const parsed = JSON.parse(fs.readFileSync(this.StatePath, "utf8")) as TechLogState;
      this.LastStatusMessageId = parsed.statusMessageId || "";
      this.LastMessageId = parsed.lastMessageId || "";
      this.ShouldRefreshPersistedStatus = Boolean(this.LastStatusMessageId);
    } catch {
      this.LastStatusMessageId = "";
      this.LastMessageId = "";
      this.ShouldRefreshPersistedStatus = false;
    }
  }

  static SaveState() {
    try {
      fs.mkdirSync(path.dirname(this.StatePath), { recursive: true });
      fs.writeFileSync(this.StatePath, JSON.stringify({
        statusMessageId: this.LastStatusMessageId,
        lastMessageId: this.LastMessageId,
      }, null, 2));
    } catch (error) {
      console.error("[tech-status-state]", HttpHelper.ErrorMessage(error));
    }
  }

  static IsNotModified(error: unknown) {
    return HttpHelper.ErrorMessage(error).includes("message is not modified");
  }
}

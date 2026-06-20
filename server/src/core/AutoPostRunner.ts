import { ServerConfig } from "../config/ServerConfig";
import { FacebookPublisher } from "../publishers/FacebookPublisher";
import { InstagramPublisher } from "../publishers/InstagramPublisher";
import { TelegramPublisher } from "../publishers/TelegramPublisher";
import { VkPublisher } from "../publishers/VkPublisher";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";
import { Platform, PostTask, PublishResult } from "../types/autopost";
import { AiTextHelper } from "./AiTextHelper";
import { HttpHelper } from "./HttpHelper";
import { TechLog } from "./TechLog";

export class AutoPostRunner {
  static Timer: NodeJS.Timeout | null = null;
  static IsRunning = false;
  static LastRunAt = "";
  static LastResult: unknown = null;

  static Start() {
    if (this.Timer) return;
    this.Timer = setInterval(() => {
      this.RunOnce().catch((error) => TechLog.Error("Autopost run error", error));
    }, ServerConfig.AUTOPOST_INTERVAL_MS);

    this.RunOnce().catch((error) => TechLog.Error("Autopost first run error", error));
  }

  static Stop() {
    if (!this.Timer) return;
    clearInterval(this.Timer);
    this.Timer = null;
  }

  static Status() {
    return {
      enabled: ServerConfig.AUTOPOST_ENABLED,
      timer: Boolean(this.Timer),
      running: this.IsRunning,
      lastRunAt: this.LastRunAt,
      intervalMs: ServerConfig.AUTOPOST_INTERVAL_MS,
      lastResult: this.LastResult,
    };
  }

  static async RunOnce() {
    if (this.IsRunning) {
      return { ok: false, skipped: true, message: "Autopost is already running" };
    }

    this.IsRunning = true;
    this.LastRunAt = new Date().toISOString();

    try {
      const tasks = await GoogleSheetsService.ReadReadyPosts(ServerConfig.AUTOPOST_BATCH_LIMIT);
      if (tasks.length === 0) {
        const result = { ok: true, processed: 0, message: "No ready posts" };
        this.LastResult = result;
        await TechLog.Status(`Проверка автопостинга: новых постов нет.\nВремя: ${this.LastRunAt}`);
        return result;
      }

      const processed = [];
      for (const task of tasks) {
        processed.push(await this.ProcessTask(task));
      }

      const result = { ok: true, processed: processed.length, items: processed };
      this.LastResult = result;
      return result;
    } finally {
      this.IsRunning = false;
    }
  }

  static async ProcessTask(task: PostTask) {
    await GoogleSheetsService.MarkPostProcessing(task);
    await TechLog.Message(`<b>Автопостинг стартовал</b>\nUID: ${AiTextHelper.EscapeHtml(task.post_uid)}`);

    try {
      const texts = await AiTextHelper.PreparePostText(task);
      const results: PublishResult[] = [];

      for (const platform of task.platforms) {
        if (this.AlreadyPublished(task, platform)) {
          results.push({ ok: true, skipped: true, platform, message: "Already has published id" });
          continue;
        }

        results.push(await this.Publish(platform, task, texts[platform]));
      }

      const successResults = results.filter((result) => result.ok || result.skipped);
      const status = this.ResolveStatus(results, successResults.length);
      const fields = this.ResultFields(results);
      if (status === "error") fields.last_error = results.map((result) => result.message).filter(Boolean).join("\n");

      await GoogleSheetsService.MarkPostResult(task, status, fields);
      await GoogleSheetsService.AppendLog(status, `Autopost ${task.post_uid}`, results).catch(() => undefined);
      await TechLog.Message(this.ResultText(task, status, results));

      return { post_uid: task.post_uid, status, results };
    } catch (error) {
      const message = HttpHelper.ErrorMessage(error);
      await GoogleSheetsService.MarkPostResult(task, "error", { last_error: message });
      await TechLog.Error(`Autopost failed: ${task.post_uid}`, error);
      return { post_uid: task.post_uid, status: "error", error: message };
    }
  }

  static async Publish(platform: Platform, task: PostTask, text: string): Promise<PublishResult> {
    try {
      if (platform === "telegram") return await TelegramPublisher.PublishPost(task, text);
      if (platform === "vk") return await VkPublisher.PublishPost(task, text);
      if (platform === "instagram") return await InstagramPublisher.PublishPost(task, text);
      if (platform === "facebook") return await FacebookPublisher.PublishPost(task, text);
      return { ok: false, platform, message: `Unsupported platform: ${platform}` };
    } catch (error) {
      return {
        ok: false,
        platform,
        message: HttpHelper.ErrorMessage(error),
      };
    }
  }

  static AlreadyPublished(task: PostTask, platform: Platform) {
    if (platform === "telegram") return Boolean(task.telegram_message_id);
    if (platform === "vk") return Boolean(task.vk_post_id);
    if (platform === "instagram") return Boolean(task.instagram_media_id);
    if (platform === "facebook") return Boolean(task.facebook_post_id);
    return false;
  }

  static ResultFields(results: PublishResult[]) {
    const fields: Record<string, string> = {
      last_response: JSON.stringify(results).slice(0, 45_000),
    };
    results.forEach((result) => {
      if (!result.id) return;
      if (result.platform === "telegram") fields.telegram_message_id = result.id;
      if (result.platform === "vk") fields.vk_post_id = result.id;
      if (result.platform === "instagram") fields.instagram_media_id = result.id;
      if (result.platform === "facebook") fields.facebook_post_id = result.id;
    });
    return fields;
  }

  static ResolveStatus(results: PublishResult[], successCount: number) {
    if (results.length === 0) return "error";
    if (successCount === results.length) return "posted";
    if (successCount > 0) return "partial";
    return "error";
  }

  static ResultText(task: PostTask, status: string, results: PublishResult[]) {
    const lines = results.map((result) => {
      const state = result.ok ? "ok" : result.disabled ? "disabled" : result.skipped ? "skipped" : "error";
      return `${result.platform}: ${state}${result.id ? ` ${result.id}` : ""}${result.message ? ` ${result.message}` : ""}`;
    });

    return [
      `<b>Автопостинг завершен</b>`,
      `UID: ${AiTextHelper.EscapeHtml(task.post_uid)}`,
      `Status: ${AiTextHelper.EscapeHtml(status)}`,
      "",
      `<pre>${AiTextHelper.EscapeHtml(lines.join("\n"))}</pre>`,
    ].join("\n");
  }
}

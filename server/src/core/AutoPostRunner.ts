import { ServerConfig } from "../config/ServerConfig";
import { FacebookPublisher } from "../publishers/FacebookPublisher";
import { FacebookConfig } from "../config/FacebookConfig";
import { InstagramConfig } from "../config/InstagramConfig";
import { InstagramPublisher } from "../publishers/InstagramPublisher";
import { TelegramConfig } from "../config/TelegramConfig";
import { TelegramPublisher } from "../publishers/TelegramPublisher";
import { VkConfig } from "../config/VkConfig";
import { VkPublisher } from "../publishers/VkPublisher";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";
import { Platform, PostTask, PublishResult } from "../types/autopost";
import { AiTextHelper } from "./AiTextHelper";
import { AutoPostRuntimeSettings, AutoPostSettings } from "./AutoPostSettings";
import { HttpHelper } from "./HttpHelper";
import { TechLog } from "./TechLog";
import { TimeHelper } from "./TimeHelper";

export class AutoPostRunner {
  static RequiredPostColumnsByPlatform: Record<Platform, string[]> = {
    telegram: [
      "telegram_status",
      "telegram_lock_until",
      "telegram_published_at",
      "telegram_message_id",
      "telegram_url",
      "telegram_error",
      "telegram_response",
    ],
    vk: [
      "vk_status",
      "vk_lock_until",
      "vk_published_at",
      "vk_post_id",
      "vk_url",
      "vk_error",
      "vk_response",
    ],
    instagram: [],
    facebook: [],
  };
  static Timer: NodeJS.Timeout | null = null;
  static IsStarted = false;
  static IsRunning = false;
  static LastRunAt = "";
  static LastResult: unknown = null;
  static LastSettings: AutoPostRuntimeSettings | null = null;

  static Start() {
    if (this.IsStarted) return;
    this.IsStarted = true;
    this.ScheduleNext(0);
  }

  static Stop() {
    this.IsStarted = false;
    if (this.Timer) clearTimeout(this.Timer);
    this.Timer = null;
  }

  static ScheduleNext(delayMs: number) {
    if (!this.IsStarted) return;
    this.Timer = setTimeout(async () => {
      this.Timer = null;
      try {
        await this.RunOnce();
      } catch (error) {
        await TechLog.Error("Autopost run error", error);
      } finally {
        const intervalMs = this.LastSettings?.intervalMs || ServerConfig.AUTOPOST_INTERVAL_MS;
        this.ScheduleNext(intervalMs);
      }
    }, delayMs);
  }

  static Status() {
    return {
      enabled: ServerConfig.AUTOPOST_ENABLED,
      settingsEnabled: this.LastSettings?.settingsEnabled,
      active: Boolean(this.LastSettings?.enabled),
      timer: this.IsStarted,
      running: this.IsRunning,
      nowAt: new Date().toISOString(),
      nowAtLocal: TimeHelper.NowLocal(),
      lastRunAt: this.LastRunAt,
      lastRunAtLocal: this.LastRunAt ? TimeHelper.Local(this.LastRunAt) : "",
      intervalMs: this.LastSettings?.intervalMs || ServerConfig.AUTOPOST_INTERVAL_MS,
      publishWindowMinutes: this.LastSettings?.publishWindowMinutes || ServerConfig.AUTOPOST_PUBLISH_WINDOW_MINUTES,
      futureGraceSeconds: this.LastSettings?.futureGraceSeconds || ServerConfig.AUTOPOST_FUTURE_GRACE_SECONDS,
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
      const settings = await AutoPostSettings.Load();
      this.LastSettings = settings;

      if (!settings.enabled) {
        const result = {
          ok: true,
          skipped: true,
          message: "Autopost disabled by env or Google SETTINGS",
          settings,
        };
        this.LastResult = result;
        await TechLog.Status([
          "Проверка автопостинга: выключен.",
          `Env AUTOPOST_ENABLED: ${settings.envEnabled ? "true" : "false"}`,
          `Google autopost.enabled: ${settings.settingsEnabled ? "true" : "false"}`,
        ].join("\n"));
        return result;
      }

      const missingColumns = await GoogleSheetsService.MissingPostColumns(this.RequiredPostColumns());
      if (missingColumns.length > 0) {
        const result = {
          ok: false,
          processed: 0,
          message: "Google Sheets POSTS is missing required columns for enabled posting platforms. Run npm run sheets:sync before enabling these platforms.",
          missingColumns,
        };
        this.LastResult = result;
        await TechLog.Status([
          "Автопостинг не запущен: в POSTS нет обязательных колонок включенных платформ.",
          `Нет колонок: ${missingColumns.join(", ")}`,
          "Запусти: npm run sheets:sync",
        ].join("\n"));
        return result;
      }

      const dueTasks = await GoogleSheetsService.ReadDuePosts(settings);
      const tasks = dueTasks.filter((task) => this.HasRunnablePlatform(task));
      if (tasks.length === 0) {
        const result = {
          ok: true,
          processed: 0,
          message: "No due posts in publish window",
          due: dueTasks.length,
          checkedAt: this.LastRunAt,
          checkedAtLocal: TimeHelper.Local(this.LastRunAt),
          window: {
            publishWindowMinutes: settings.publishWindowMinutes,
            futureGraceSeconds: settings.futureGraceSeconds,
          },
        };
        this.LastResult = result;
        await TechLog.Status([
          "Проверка автопостинга: новых постов в окне нет.",
          `Время: ${TimeHelper.Local(this.LastRunAt)}`,
          `UTC: ${this.LastRunAt}`,
          `Окно назад: ${settings.publishWindowMinutes} мин.`,
          `Допуск вперед: ${settings.futureGraceSeconds} сек.`,
        ].join("\n"));
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
    await TechLog.Message(this.StartText(task));

    try {
      const results = await this.PublishAllPlatforms(task);

      const status = this.ResolveStatus(results);
      const fields = this.ResultFields(results);

      await GoogleSheetsService.MarkPostResult(task, status, fields);
      await GoogleSheetsService.AppendLog(status, `Autopost ${task.post_uid}`, results).catch(() => undefined);
      await this.SendPlatformResultMessages(task, results);

      return { post_uid: task.post_uid, status, results };
    } catch (error) {
      const message = HttpHelper.ErrorMessage(error);
      const fields = task.platforms.includes("telegram")
        ? { telegram_status: "error", telegram_error: message, telegram_lock_until: "" }
        : {};
      await GoogleSheetsService.MarkPostResult(task, "error", fields);
      await TechLog.Error(`Autopost failed: ${task.post_uid}`, error);
      return { post_uid: task.post_uid, status: "error", error: message };
    }
  }

  static async PublishAllPlatforms(task: PostTask) {
    const preparedText = await AiTextHelper.PreparePostText(task);
    const platformJobs: Array<Promise<PublishResult | null>> = [
      this.PublishPlatform("instagram", task, () => InstagramPublisher.PublishPost(task, preparedText.instagram)),
      this.PublishPlatform("facebook", task, () => FacebookPublisher.PublishPost(task, preparedText.facebook)),
      this.PublishPlatform("vk", task, () => VkPublisher.PublishPost(task, preparedText.vk)),
      this.PublishPlatform("telegram", task, () => TelegramPublisher.PublishPost(task, preparedText.telegram)),
    ];

    const results = await Promise.all(platformJobs);
    return results.filter((result): result is PublishResult => Boolean(result));
  }

  static async PublishPlatform(
    platform: Platform,
    task: PostTask,
    publish: () => Promise<PublishResult>,
  ): Promise<PublishResult | null> {
    if (!task.platforms.includes(platform)) return null;

    if (this.AlreadyPublished(task, platform)) {
      return { ok: true, skipped: true, platform, message: "Already has published id" };
    }

    if (this.PlatformLocked(task, platform)) {
      return { ok: true, skipped: true, platform, message: "Platform is locked by another run" };
    }

    if (!this.PlatformReady(platform)) {
      return null;
    }

    try {
      await GoogleSheetsService.MarkPlatformProcessing(task, platform, this.LockUntil());
      const result = await publish();
      return result;
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

  static HasRunnablePlatform(task: PostTask) {
    return task.platforms.some((platform) => (
      !this.AlreadyPublished(task, platform)
      && !this.PlatformLocked(task, platform)
      && this.PlatformReady(platform)
    ));
  }

  static PlatformReady(platform: Platform) {
    if (platform === "telegram") return Boolean(TelegramConfig.IsBotReady() && TelegramConfig.PUBLIC_CHAT_ID);
    if (platform === "vk") return VkConfig.IsReady();
    if (platform === "instagram") return InstagramConfig.IsReady();
    if (platform === "facebook") return FacebookConfig.IsReady();
    return false;
  }

  static RequiredPostColumns() {
    const platforms: Platform[] = ["telegram", "vk", "instagram", "facebook"];
    return platforms.flatMap((platform) => (
      this.PlatformReady(platform) ? this.RequiredPostColumnsByPlatform[platform] : []
    ));
  }

  static PlatformLocked(task: PostTask, platform: Platform) {
    const lockUntil = task.raw[`${platform}_lock_until`] || "";
    if (!lockUntil) return false;
    const time = GoogleSheetsService.ParsePublishAt(lockUntil);
    return Number.isFinite(time) && time > Date.now();
  }

  static LockUntil() {
    return new Date(Date.now() + 15 * 60_000).toISOString();
  }

  static ResultFields(results: PublishResult[]) {
    const fields: Record<string, string> = {};
    results.forEach((result) => {
      if (!["telegram", "vk", "instagram", "facebook"].includes(result.platform)) return;
      const platform = result.platform as Platform;
      const platformStatus = this.PlatformResultStatus(result);
      fields[`${platform}_status`] = platformStatus;
      fields[`${platform}_lock_until`] = "";
      fields[`${platform}_response`] = JSON.stringify(result).slice(0, 45_000);

      if (result.ok && !result.skipped && !result.disabled) {
        fields[`${platform}_published_at`] = new Date().toISOString();
        fields[`${platform}_error`] = "";
      }

      if (!result.ok) {
        fields[`${platform}_error`] = result.message || "Unknown platform error";
      }

      if (result.id) {
        if (platform === "telegram") fields.telegram_message_id = result.id;
        if (platform === "vk") fields.vk_post_id = result.id;
      }

      if (result.url) {
        if (platform === "telegram") fields.telegram_url = result.url;
        if (platform === "vk") fields.vk_url = result.url;
      }
    });
    return fields;
  }

  static PlatformResultStatus(result: PublishResult) {
    if (result.disabled) return "disabled";
    if (result.skipped) return "skipped";
    if (result.ok) return "posted";
    return "error";
  }

  static ResolveStatus(results: PublishResult[]) {
    if (results.length === 0) return "error";
    const realPosted = results.filter((result) => result.ok && !result.skipped && !result.disabled);
    const errors = results.filter((result) => !result.ok);
    const disabled = results.filter((result) => result.disabled);
    if (errors.length > 0 && realPosted.length > 0) return "partial";
    if (errors.length > 0) return "error";
    if (disabled.length > 0 && realPosted.length > 0) return "partial";
    if (realPosted.length > 0) return "posted";
    if (results.some((result) => result.skipped || result.disabled)) return "skipped";
    return "error";
  }

  static async SendPlatformResultMessages(task: PostTask, results: PublishResult[]) {
    for (const result of results) {
      const text = this.PlatformResultText(task, result);
      if (text) await TechLog.Message(text);
    }
  }

  static StartText(task: PostTask) {
    const stats = this.TaskMediaStats(task);
    const runnablePlatforms = task.platforms
      .filter((platform) => (
        !this.AlreadyPublished(task, platform)
        && !this.PlatformLocked(task, platform)
        && this.PlatformReady(platform)
      ))
      .map((platform) => this.PlatformTitle(platform));

    const mediaLine = `${stats.mediaCount} всего, ${stats.photoCount} фото, ${stats.videoCount} видео`;
    const otherLine = stats.otherCount > 0 ? `, ${stats.otherCount} другое` : "";
    return [
      `<b>Автопостинг стартовал</b>`,
      `UID: ${AiTextHelper.EscapeHtml(task.post_uid)}`,
      `Строка: ${task.rowNumber}`,
      `Платформы: ${AiTextHelper.EscapeHtml(runnablePlatforms.join(", ") || "-")}`,
      `Плановое время: ${AiTextHelper.EscapeHtml(task.publish_at || "-")}`,
      `Текст: ${task.text.length} символов`,
      `Медиа: ${mediaLine}${otherLine}`,
    ].join("\n");
  }

  static PlatformResultText(task: PostTask, result: PublishResult) {
    if (!this.IsPostPlatform(result.platform)) return "";
    if (result.disabled || result.skipped) return "";
    if (!result.ok) return this.PlatformErrorText(task, result.platform, result.message || "Unknown platform error");
    return this.PlatformSuccessText(task, result);
  }

  static PlatformSuccessText(task: PostTask, result: PublishResult) {
    const platform = result.platform as Platform;
    const fallbackStats = this.TaskMediaStats(task);
    const stats = result.stats || fallbackStats;
    const mediaCount = stats.mediaCount ?? fallbackStats.mediaCount;
    const photoCount = stats.photoCount ?? fallbackStats.photoCount;
    const videoCount = stats.videoCount ?? fallbackStats.videoCount;
    const textLength = stats.textLength ?? task.text.length;
    const warningCount = result.stats?.warningCount || 0;
    const lines = [
      `<b>${this.PlatformTitle(platform)} опубликовано</b>`,
      `UID: ${AiTextHelper.EscapeHtml(task.post_uid)}`,
      result.id ? `${platform === "telegram" ? "ID сообщения" : "ID публикации"}: ${AiTextHelper.EscapeHtml(result.id)}` : "",
      result.url ? `URL: ${AiTextHelper.EscapeHtml(result.url)}` : "",
      `Медиа: ${mediaCount} всего, ${photoCount} фото, ${videoCount} видео`,
      `Текст: ${textLength} символов`,
      result.message ? `Сообщение: ${AiTextHelper.EscapeHtml(result.message)}` : "",
      warningCount ? `Предупреждения: ${warningCount}` : "",
    ].filter(Boolean);

    return lines.join("\n");
  }

  static PlatformErrorText(task: PostTask, platform: Platform, message: string) {
    return [
      `<b>${this.PlatformTitle(platform)} ошибка</b>`,
      `UID: ${AiTextHelper.EscapeHtml(task.post_uid)}`,
      `Строка: ${task.rowNumber}`,
      `<pre>${AiTextHelper.EscapeHtml(message)}</pre>`,
    ].join("\n");
  }

  static TaskMediaStats(task: PostTask) {
    const items = task.media_items.length > 0
      ? task.media_items.map((item) => ({
        name: item.name || item.media_id,
        type: item.type || item.mime_type || "",
      }))
      : task.media_urls.map((url) => ({ name: url, type: "" }));

    let photoCount = 0;
    let videoCount = 0;
    let otherCount = 0;

    items.forEach((item) => {
      if (this.IsVideoMedia(item.name, item.type)) {
        videoCount += 1;
        return;
      }

      if (this.IsPhotoMedia(item.name, item.type)) {
        photoCount += 1;
        return;
      }

      otherCount += 1;
    });

    return {
      textLength: task.text.length,
      mediaCount: items.length,
      photoCount,
      videoCount,
      otherCount,
    };
  }

  static IsPhotoMedia(name: string, type: string) {
    const clean = `${type} ${name}`.toLowerCase();
    return clean.includes("image/") || [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].some((ext) => clean.includes(ext));
  }

  static IsVideoMedia(name: string, type: string) {
    const clean = `${type} ${name}`.toLowerCase();
    return clean.includes("video/") || [".mp4", ".mov", ".m4v", ".webm", ".avi"].some((ext) => clean.includes(ext));
  }

  static IsPostPlatform(platform: string): platform is Platform {
    return ["telegram", "vk", "instagram", "facebook"].includes(platform);
  }

  static PlatformTitle(platform: Platform) {
    if (platform === "telegram") return "Telegram";
    if (platform === "vk") return "VK";
    if (platform === "instagram") return "Instagram";
    if (platform === "facebook") return "Facebook";
    return platform;
  }
}

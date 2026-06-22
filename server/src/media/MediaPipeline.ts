import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ServerConfig } from "../config/ServerConfig";
import { DownloadedMedia, PreparedMedia, PreparedPost, PostTask } from "../types/autopost";
import { HttpHelper } from "../core/HttpHelper";
import { DriveMediaService } from "./DriveMediaService";
import { TelegramMediaPreparer } from "./TelegramMediaPreparer";
import { VkMediaPreparer } from "./VkMediaPreparer";

export class MediaPipeline {
  static async PrepareTelegramPost(task: PostTask, text: string): Promise<PreparedPost> {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    const safePostId = this.SafePathPart(task.post_uid || `row-${task.rowNumber}`);
    const rootDir = path.join(ServerConfig.AUTOPOST_TMP_DIR, safePostId, runId);
    const sourceDir = path.join(rootDir, "source");
    const platformDir = path.join(rootDir, "telegram");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(platformDir, { recursive: true });

    const downloaded: DownloadedMedia[] = [];
    const warnings: string[] = [];
    for (const media of task.media_items || []) {
      try {
        downloaded.push(await DriveMediaService.DownloadMedia(media, sourceDir));
      } catch (error) {
        warnings.push(`media ${media.media_id} skipped: ${HttpHelper.ErrorMessage(error)}`);
      }
    }

    const preparedMedia: PreparedMedia[] = [];
    for (const media of downloaded) {
      try {
        preparedMedia.push(...await TelegramMediaPreparer.Prepare([media], platformDir));
      } catch (error) {
        warnings.push(`media ${media.media.media_id} skipped during Telegram preparation: ${HttpHelper.ErrorMessage(error)}`);
      }
    }
    const manifestPath = path.join(rootDir, "manifest.json");
    const prepared: PreparedPost = {
      task,
      run_id: runId,
      rootDir,
      sourceDir,
      platformDir,
      manifestPath,
      text,
      media: preparedMedia,
      warnings,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(this.Manifest(prepared), null, 2));
    return prepared;
  }

  static async PrepareVkPost(task: PostTask, text: string): Promise<PreparedPost> {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    const safePostId = this.SafePathPart(task.post_uid || `row-${task.rowNumber}`);
    const rootDir = path.join(ServerConfig.AUTOPOST_TMP_DIR, safePostId, runId);
    const sourceDir = path.join(rootDir, "source");
    const platformDir = path.join(rootDir, "vk");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(platformDir, { recursive: true });

    const downloaded: DownloadedMedia[] = [];
    const warnings: string[] = [];
    for (const media of task.media_items || []) {
      try {
        downloaded.push(await DriveMediaService.DownloadMedia(media, sourceDir));
      } catch (error) {
        warnings.push(`media ${media.media_id} skipped: ${HttpHelper.ErrorMessage(error)}`);
      }
    }

    const preparedMedia: PreparedMedia[] = [];
    for (const media of downloaded) {
      try {
        preparedMedia.push(...await VkMediaPreparer.Prepare([media], platformDir));
      } catch (error) {
        warnings.push(`media ${media.media.media_id} skipped during VK preparation: ${HttpHelper.ErrorMessage(error)}`);
      }
    }

    const manifestPath = path.join(rootDir, "manifest.json");
    const prepared: PreparedPost = {
      task,
      run_id: runId,
      rootDir,
      sourceDir,
      platformDir,
      manifestPath,
      text,
      media: preparedMedia,
      warnings,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(this.Manifest(prepared), null, 2));
    return prepared;
  }

  static Manifest(prepared: PreparedPost) {
    return {
      run_id: prepared.run_id,
      post_uid: prepared.task.post_uid,
      rowNumber: prepared.task.rowNumber,
      created_at: new Date().toISOString(),
      rootDir: prepared.rootDir,
      sourceDir: prepared.sourceDir,
      platformDir: prepared.platformDir,
      text_length: prepared.text.length,
      text_mode: path.basename(prepared.platformDir) === "telegram" && prepared.media.length > 0
        ? "media_caption"
        : "text_message",
      warnings: prepared.warnings || [],
      media: prepared.media.map((item) => ({
        media_id: item.media_id,
        originalPath: item.originalPath,
        preparedPath: item.preparedPath,
        filename: item.filename,
        mime_type: item.mime_type,
        asset_type: item.asset_type,
        size: item.size,
        width: item.width,
        height: item.height,
        duration: item.duration,
        thumbnailPath: item.thumbnailPath,
        thumbnailFilename: item.thumbnailFilename,
        converted: item.converted,
        notes: item.notes || [],
      })),
    };
  }

  static SafePathPart(value: string) {
    return value.replace(/[^\w.\-]+/g, "_").slice(0, 100) || "post";
  }

  static Cleanup(prepared: PreparedPost) {
    if (!prepared.rootDir) return;
    fs.rmSync(prepared.rootDir, { recursive: true, force: true });
  }
}

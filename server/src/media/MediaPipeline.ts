import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ServerConfig } from "../config/ServerConfig";
import { PreparedPost, PostTask } from "../types/autopost";
import { DriveMediaService } from "./DriveMediaService";
import { TelegramMediaPreparer } from "./TelegramMediaPreparer";

export class MediaPipeline {
  static async PrepareTelegramPost(task: PostTask, text: string): Promise<PreparedPost> {
    const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    const safePostId = this.SafePathPart(task.post_uid || `row-${task.rowNumber}`);
    const rootDir = path.join(ServerConfig.AUTOPOST_TMP_DIR, safePostId, runId);
    const sourceDir = path.join(rootDir, "source");
    const platformDir = path.join(rootDir, "telegram");

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(platformDir, { recursive: true });

    const downloaded = [];
    for (const media of task.media_items || []) {
      downloaded.push(await DriveMediaService.DownloadMedia(media, sourceDir));
    }

    const preparedMedia = await TelegramMediaPreparer.Prepare(downloaded, platformDir);
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
}

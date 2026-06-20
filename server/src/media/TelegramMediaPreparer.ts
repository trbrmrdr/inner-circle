import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import heicConvert = require("heic-convert");
import { ServerConfig } from "../config/ServerConfig";
import { DownloadedMedia, PreparedMedia } from "../types/autopost";

const ExecFile = promisify(execFile);

type TelegramSourceKind = "image" | "video" | "unsupported";
type TelegramResizeFit = "inside" | "contain";

interface TelegramImageTarget {
  width?: number;
  height?: number;
  fit: TelegramResizeFit;
  resized: boolean;
  padded: boolean;
}

interface TelegramImageWriteResult {
  size: number;
  width?: number;
  height?: number;
  quality: number;
}

interface TelegramVideoInfo {
  width?: number;
  height?: number;
  duration?: number;
}

export class TelegramMediaPreparer {
  static readonly MAX_PHOTO_BYTES = 10 * 1024 * 1024;
  static readonly MAX_VIDEO_THUMB_BYTES = 200 * 1024;
  static readonly MAX_PHOTO_DIMENSION_SUM = 10_000;
  static readonly MAX_PHOTO_ASPECT_RATIO = 20;
  static readonly MAX_VIDEO_BYTES = 50 * 1024 * 1024;
  static readonly JPEG_QUALITIES = [88, 82, 76, 70, 64, 58, 52, 46, 40];

  static async Prepare(downloaded: DownloadedMedia[], targetDir: string): Promise<PreparedMedia[]> {
    fs.mkdirSync(targetDir, { recursive: true });

    const prepared: PreparedMedia[] = [];
    for (const item of downloaded) {
      const kind = this.SourceKind(item.mime_type, item.filename);
      if (kind === "image") {
        prepared.push(await this.PreparePhoto(item, targetDir));
        continue;
      }

      if (kind === "video") {
        prepared.push(await this.PrepareVideo(item, targetDir));
        continue;
      }

      throw new Error(
        `Telegram media ${item.media.media_id || item.filename} has unsupported format ` +
        `${item.mime_type || path.extname(item.filename) || "unknown"}. Autopost does not send documents.`,
      );
    }

    return prepared;
  }

  static async PreparePhoto(item: DownloadedMedia, targetDir: string): Promise<PreparedMedia> {
    const filename = this.PreparedFilename(item, "photo", ".jpg");
    const targetPath = path.join(targetDir, filename);
    const notes = [
      `source_mime:${item.mime_type || "unknown"}`,
      "telegram_photo:jpeg",
    ];
    const readableSourcePath = await this.ReadableImageSourcePath(item, targetDir, notes);
    const metadata = await sharp(readableSourcePath, { limitInputPixels: false }).metadata();
    const size = this.OrientedSize(metadata.width, metadata.height, metadata.orientation);
    const target = this.PhotoTarget(size.width, size.height);

    if (target.resized) notes.push(`resized_to_fit_sum:${TelegramMediaPreparer.MAX_PHOTO_DIMENSION_SUM}`);
    if (target.padded) notes.push(`padded_to_fit_ratio:${TelegramMediaPreparer.MAX_PHOTO_ASPECT_RATIO}`);

    let result: TelegramImageWriteResult | null = null;
    for (const quality of this.JPEG_QUALITIES) {
      result = await this.WriteJpeg(readableSourcePath, targetPath, target, quality);
      if (result.size <= this.MAX_PHOTO_BYTES) break;
    }

    if (!result || result.size > this.MAX_PHOTO_BYTES) {
      result = await this.CompressByResize(readableSourcePath, targetPath, target, result);
    }

    if (result.size > this.MAX_PHOTO_BYTES) {
      throw new Error(
        `Telegram photo ${item.media.media_id || item.filename} is ${(result.size / 1024 / 1024).toFixed(2)} MB ` +
        `after conversion. Limit is 10 MB.`,
      );
    }

    notes.push(`jpeg_quality:${result.quality}`);
    return {
      media_id: item.media.media_id,
      originalPath: item.sourcePath,
      preparedPath: targetPath,
      filename,
      mime_type: "image/jpeg",
      asset_type: "photo",
      size: result.size,
      converted: true,
      width: result.width,
      height: result.height,
      notes,
    };
  }

  static async PrepareVideo(item: DownloadedMedia, targetDir: string): Promise<PreparedMedia> {
    const filename = this.PreparedFilename(item, "video", ".mp4");
    const targetPath = path.join(targetDir, filename);
    const notes = [
      `source_mime:${item.mime_type || "unknown"}`,
      "telegram_video:mp4",
    ];
    const shouldNormalize = !this.IsTelegramVideoCompatible(item.mime_type, item.filename) || item.size > this.MAX_VIDEO_BYTES;

    if (shouldNormalize) {
      await this.NormalizeVideo(item.sourcePath, targetPath);
      notes.push("ffmpeg:normalized");
    } else {
      fs.copyFileSync(item.sourcePath, targetPath);
    }

    const size = fs.statSync(targetPath).size;
    if (size > this.MAX_VIDEO_BYTES) {
      throw new Error(
        `Telegram video ${item.media.media_id || item.filename} is ${(size / 1024 / 1024).toFixed(2)} MB after conversion. ` +
        "Bot API sendVideo limit is 50 MB.",
      );
    }

    const videoInfo = await this.ProbeVideo(targetPath);
    const thumbnail = await this.CreateVideoThumbnail(targetPath, targetDir, item);
    notes.push(`video_size:${videoInfo.width || 0}x${videoInfo.height || 0}`);
    if (videoInfo.duration) notes.push(`duration:${Math.round(videoInfo.duration)}s`);
    if (thumbnail) notes.push("thumbnail:jpeg");

    return {
      media_id: item.media.media_id,
      originalPath: item.sourcePath,
      preparedPath: targetPath,
      filename,
      mime_type: "video/mp4",
      asset_type: "video",
      size,
      converted: shouldNormalize,
      width: videoInfo.width,
      height: videoInfo.height,
      duration: videoInfo.duration,
      thumbnailPath: thumbnail?.path,
      thumbnailFilename: thumbnail?.filename,
      notes,
    };
  }

  static async NormalizeVideo(sourcePath: string, targetPath: string) {
    const scriptPath = path.join(ServerConfig.MEDIA_TOOLS_DIR, "telegram-video-normalize.sh");
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Telegram video normalizer not found: ${scriptPath}`);
    }

    try {
      await ExecFile(scriptPath, [sourcePath, targetPath], {
        timeout: 20 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      });
    } catch (error: any) {
      const stderr = String(error?.stderr || "").trim();
      const stdout = String(error?.stdout || "").trim();
      const details = [stderr, stdout, error?.message].filter(Boolean).join("\n");
      throw new Error(`Telegram video normalization failed: ${details}`);
    }
  }

  static async ProbeVideo(videoPath: string): Promise<TelegramVideoInfo> {
    try {
      const { stdout } = await ExecFile("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration:format=duration",
        "-of", "json",
        videoPath,
      ], {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      const parsed = JSON.parse(stdout);
      const stream = parsed?.streams?.[0] || {};
      const duration = Number(stream.duration || parsed?.format?.duration || 0);
      return {
        width: Number(stream.width || 0) || undefined,
        height: Number(stream.height || 0) || undefined,
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      };
    } catch {
      return {};
    }
  }

  static async CreateVideoThumbnail(videoPath: string, targetDir: string, item: DownloadedMedia) {
    const filename = this.PreparedFilename(item, "photo", ".jpg").replace(/^photo_/, "thumb_");
    const targetPath = path.join(targetDir, filename);

    for (const second of [1, 0, 2]) {
      await ExecFile("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-ss", String(second),
        "-i", videoPath,
        "-frames:v", "1",
        "-vf", "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease",
        "-q:v", "4",
        targetPath,
      ], {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      }).catch(() => undefined);

      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) break;
    }

    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size === 0) return null;
    if (fs.statSync(targetPath).size > this.MAX_VIDEO_THUMB_BYTES) {
      await this.RewriteThumbnailSmaller(targetPath);
    }

    if (fs.statSync(targetPath).size > this.MAX_VIDEO_THUMB_BYTES) return null;
    return { path: targetPath, filename };
  }

  static async RewriteThumbnailSmaller(targetPath: string) {
    const tempPath = `${targetPath}.tmp.jpg`;
    for (const quality of [75, 65, 55, 45]) {
      await sharp(targetPath)
        .jpeg({ quality, mozjpeg: true })
        .toFile(tempPath);
      fs.renameSync(tempPath, targetPath);
      if (fs.statSync(targetPath).size <= this.MAX_VIDEO_THUMB_BYTES) break;
    }
  }

  static async ReadableImageSourcePath(item: DownloadedMedia, targetDir: string, notes: string[]) {
    if (this.IsHeic(item.mime_type, item.filename)) {
      return this.ConvertHeicToJpeg(item, targetDir, notes);
    }

    try {
      await sharp(item.sourcePath, { limitInputPixels: false }).metadata();
      return item.sourcePath;
    } catch (error) {
      throw new Error(
        `Cannot read image ${item.media.media_id || item.filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  static async ConvertHeicToJpeg(item: DownloadedMedia, targetDir: string, notes: string[]) {
    const workDir = path.join(targetDir, "_work");
    fs.mkdirSync(workDir, { recursive: true });
    const fallbackPath = path.join(workDir, this.PreparedFilename(item, "photo", ".heic-source.jpg"));
    const outputBuffer = await heicConvert({
      buffer: fs.readFileSync(item.sourcePath),
      format: "JPEG",
      quality: 0.95,
    });

    fs.writeFileSync(fallbackPath, Buffer.from(outputBuffer));
    notes.push("heic_convert:fallback");
    return fallbackPath;
  }

  static async WriteJpeg(
    sourcePath: string,
    targetPath: string,
    target: TelegramImageTarget,
    quality: number,
  ): Promise<TelegramImageWriteResult> {
    let pipeline = sharp(sourcePath, { limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" });

    if (target.width && target.height) {
      pipeline = pipeline.resize({
        width: target.width,
        height: target.height,
        fit: target.fit,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: target.fit === "inside",
      });
    }

    await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toFile(targetPath);

    return this.ImageResult(targetPath, quality);
  }

  static async CompressByResize(
    sourcePath: string,
    targetPath: string,
    target: TelegramImageTarget,
    lastResult: TelegramImageWriteResult | null,
  ) {
    const baseWidth = lastResult?.width || target.width;
    const baseHeight = lastResult?.height || target.height;
    if (!baseWidth || !baseHeight) return lastResult || this.ImageResult(targetPath, this.JPEG_QUALITIES.at(-1) || 40);

    let result = lastResult || await this.ImageResult(targetPath, this.JPEG_QUALITIES.at(-1) || 40);
    for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      const resized = this.PhotoTarget(Math.max(1, Math.floor(baseWidth * scale)), Math.max(1, Math.floor(baseHeight * scale)));
      result = await this.WriteJpeg(sourcePath, targetPath, resized, 82);
      if (result.size <= this.MAX_PHOTO_BYTES) break;
    }

    return result;
  }

  static async ImageResult(targetPath: string, quality: number): Promise<TelegramImageWriteResult> {
    const metadata = await sharp(targetPath).metadata();
    return {
      size: fs.statSync(targetPath).size,
      width: metadata.width,
      height: metadata.height,
      quality,
    };
  }

  static PhotoTarget(width?: number, height?: number): TelegramImageTarget {
    if (!width || !height) return { fit: "inside", resized: false, padded: false };

    let targetWidth = Math.max(1, Math.floor(width));
    let targetHeight = Math.max(1, Math.floor(height));
    let resized = false;
    let padded = false;

    const dimensionSum = targetWidth + targetHeight;
    if (dimensionSum > this.MAX_PHOTO_DIMENSION_SUM) {
      const scale = this.MAX_PHOTO_DIMENSION_SUM / dimensionSum;
      targetWidth = Math.max(1, Math.floor(targetWidth * scale));
      targetHeight = Math.max(1, Math.floor(targetHeight * scale));
      resized = true;
    }

    const ratio = Math.max(targetWidth, targetHeight) / Math.max(1, Math.min(targetWidth, targetHeight));
    if (ratio > this.MAX_PHOTO_ASPECT_RATIO) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.ceil(targetWidth / this.MAX_PHOTO_ASPECT_RATIO);
      } else {
        targetWidth = Math.ceil(targetHeight / this.MAX_PHOTO_ASPECT_RATIO);
      }
      padded = true;
    }

    return {
      width: targetWidth,
      height: targetHeight,
      fit: padded ? "contain" : "inside",
      resized,
      padded,
    };
  }

  static OrientedSize(width?: number, height?: number, orientation?: number) {
    if (!width || !height) return { width, height };
    if (orientation && orientation >= 5 && orientation <= 8) {
      return { width: height, height: width };
    }

    return { width, height };
  }

  static SourceKind(mimeType: string, filename: string): TelegramSourceKind {
    const cleanMime = mimeType.toLowerCase();
    const ext = path.extname(filename).toLowerCase();

    if (
      cleanMime.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".tif", ".tiff", ".avif"].includes(ext)
    ) {
      return "image";
    }

    if (
      cleanMime.startsWith("video/") ||
      [".mp4", ".m4v", ".mov", ".avi", ".webm", ".mkv"].includes(ext)
    ) {
      return "video";
    }

    return "unsupported";
  }

  static IsTelegramVideoCompatible(mimeType: string, filename: string) {
    const cleanMime = mimeType.toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    return cleanMime === "video/mp4" || ext === ".mp4" || ext === ".m4v";
  }

  static IsHeic(mimeType: string, filename: string) {
    const cleanMime = mimeType.toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    return cleanMime === "image/heic" || cleanMime === "image/heif" || ext === ".heic" || ext === ".heif";
  }

  static PreparedFilename(item: DownloadedMedia, assetType: "photo" | "video", extension: ".jpg" | ".mp4" | ".heic-source.jpg") {
    const originalBase = path.basename(item.filename, path.extname(item.filename));
    const id = item.media.media_id || "media";
    const clean = `${id}_${originalBase}`.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_").slice(0, 120);
    return `${assetType}_${clean || id}${extension}`;
  }
}

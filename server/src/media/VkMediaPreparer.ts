import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import heicConvert = require("heic-convert");
import { ServerConfig } from "../config/ServerConfig";
import { DownloadedMedia, PreparedMedia } from "../types/autopost";

const ExecFile = promisify(execFile);

type VkSourceKind = "image" | "video" | "unsupported";

interface VkVideoInfo {
  width?: number;
  height?: number;
  duration?: number;
}

export class VkMediaPreparer {
  static readonly MAX_PHOTO_DIMENSION = 2560;
  static readonly JPEG_QUALITIES = [90, 84, 78, 72, 66, 60];

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
        `VK media ${item.media.media_id || item.filename} has unsupported format ` +
        `${item.mime_type || path.extname(item.filename) || "unknown"}. VK autopost supports only photo/video media.`,
      );
    }

    return prepared;
  }

  static async PreparePhoto(item: DownloadedMedia, targetDir: string): Promise<PreparedMedia> {
    const filename = this.PreparedFilename(item, "photo", ".jpg");
    const targetPath = path.join(targetDir, filename);
    const notes = [
      `source_mime:${item.mime_type || "unknown"}`,
      "vk_photo:jpeg",
    ];
    const readableSourcePath = await this.ReadableImageSourcePath(item, targetDir, notes);

    const metadata = await sharp(readableSourcePath, { limitInputPixels: false }).metadata();
    const oriented = this.OrientedSize(metadata.width, metadata.height, metadata.orientation);
    const target = this.PhotoTarget(oriented.width, oriented.height);

    let result = await this.WriteJpeg(readableSourcePath, targetPath, target, this.JPEG_QUALITIES[0]);
    for (const quality of this.JPEG_QUALITIES.slice(1)) {
      if (result.size <= 15 * 1024 * 1024) break;
      result = await this.WriteJpeg(readableSourcePath, targetPath, target, quality);
    }

    notes.push(`jpeg_quality:${result.quality}`);
    if (target.width && target.height) notes.push(`image_size:${target.width}x${target.height}`);

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
      "vk_video:mp4_h264_aac",
      "vk_video:preserve_aspect_ratio",
    ];

    await this.NormalizeVideo(item.sourcePath, targetPath);
    const size = fs.statSync(targetPath).size;
    const videoInfo = await this.ProbeVideo(targetPath);
    notes.push(`video_size:${videoInfo.width || 0}x${videoInfo.height || 0}`);
    if (videoInfo.duration) notes.push(`duration:${Math.round(videoInfo.duration)}s`);

    return {
      media_id: item.media.media_id,
      originalPath: item.sourcePath,
      preparedPath: targetPath,
      filename,
      mime_type: "video/mp4",
      asset_type: "video",
      size,
      converted: true,
      width: videoInfo.width,
      height: videoInfo.height,
      duration: videoInfo.duration,
      notes,
    };
  }

  static async NormalizeVideo(sourcePath: string, targetPath: string) {
    const scriptPath = path.join(ServerConfig.MEDIA_TOOLS_DIR, "vk-video-normalize.sh");
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`VK video normalizer not found: ${scriptPath}`);
    }

    try {
      await ExecFile(scriptPath, [sourcePath, targetPath], {
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      });
    } catch (error: any) {
      const stderr = String(error?.stderr || "").trim();
      const stdout = String(error?.stdout || "").trim();
      const details = [stderr, stdout, error?.message].filter(Boolean).join("\n");
      throw new Error(`VK video normalization failed: ${details}`);
    }
  }

  static async ProbeVideo(videoPath: string): Promise<VkVideoInfo> {
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
    target: { width?: number; height?: number },
    quality: number,
  ) {
    let pipeline = sharp(sourcePath, { limitInputPixels: false })
      .rotate()
      .flatten({ background: "#ffffff" });

    if (target.width && target.height) {
      pipeline = pipeline.resize({
        width: target.width,
        height: target.height,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    await pipeline
      .jpeg({ quality, mozjpeg: true })
      .toFile(targetPath);

    const metadata = await sharp(targetPath).metadata();
    return {
      size: fs.statSync(targetPath).size,
      width: metadata.width,
      height: metadata.height,
      quality,
    };
  }

  static PhotoTarget(width?: number, height?: number) {
    if (!width || !height) return {};
    const max = Math.max(width, height);
    if (max <= this.MAX_PHOTO_DIMENSION) return { width, height };

    const scale = this.MAX_PHOTO_DIMENSION / max;
    return {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
  }

  static OrientedSize(width?: number, height?: number, orientation?: number) {
    if (!width || !height) return { width, height };
    if (orientation && orientation >= 5 && orientation <= 8) {
      return { width: height, height: width };
    }

    return { width, height };
  }

  static SourceKind(mimeType: string, filename: string): VkSourceKind {
    const cleanMime = mimeType.toLowerCase();
    const ext = path.extname(filename).toLowerCase();

    if (
      cleanMime.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".tif", ".tiff", ".avif"].includes(ext)
    ) {
      return "image";
    }

    if (
      cleanMime.startsWith("video/") ||
      [".mp4", ".m4v", ".mov", ".avi", ".webm", ".mkv", ".mpeg", ".mpg", ".3gp", ".flv", ".wmv"].includes(ext)
    ) {
      return "video";
    }

    return "unsupported";
  }

  static IsHeic(mimeType: string, filename: string) {
    const cleanMime = mimeType.toLowerCase();
    const ext = path.extname(filename).toLowerCase();
    return cleanMime === "image/heic" || cleanMime === "image/heif" || ext === ".heic" || ext === ".heif";
  }

  static PreparedFilename(item: DownloadedMedia, assetType: "photo" | "video", extension: string) {
    const originalBase = path.basename(item.filename, path.extname(item.filename));
    const id = item.media.media_id || "media";
    const clean = `${id}_${originalBase}`.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_").slice(0, 120);
    return `${assetType}_${clean || id}${extension}`;
  }
}

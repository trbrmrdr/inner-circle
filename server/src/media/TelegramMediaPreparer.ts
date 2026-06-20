import fs from "fs";
import path from "path";
import sharp from "sharp";
import { DownloadedMedia, PreparedMedia } from "../types/autopost";

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

export class TelegramMediaPreparer {
  static readonly MAX_PHOTO_BYTES = 10 * 1024 * 1024;
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
    const metadata = await sharp(item.sourcePath, { limitInputPixels: false }).metadata();
    const size = this.OrientedSize(metadata.width, metadata.height, metadata.orientation);
    const target = this.PhotoTarget(size.width, size.height);
    const notes = [
      `source_mime:${item.mime_type || "unknown"}`,
      "telegram_photo:jpeg",
    ];

    if (target.resized) notes.push(`resized_to_fit_sum:${TelegramMediaPreparer.MAX_PHOTO_DIMENSION_SUM}`);
    if (target.padded) notes.push(`padded_to_fit_ratio:${TelegramMediaPreparer.MAX_PHOTO_ASPECT_RATIO}`);

    let result: TelegramImageWriteResult | null = null;
    for (const quality of this.JPEG_QUALITIES) {
      result = await this.WriteJpeg(item.sourcePath, targetPath, target, quality);
      if (result.size <= this.MAX_PHOTO_BYTES) break;
    }

    if (!result || result.size > this.MAX_PHOTO_BYTES) {
      result = await this.CompressByResize(item.sourcePath, targetPath, target, result);
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
    if (!this.IsTelegramVideoCompatible(item.mime_type, item.filename)) {
      throw new Error(
        `Telegram video ${item.media.media_id || item.filename} must be MP4/MPEG4 before posting. ` +
        "Video conversion will be added through ffmpeg in the next stage; documents are not sent.",
      );
    }

    if (item.size > this.MAX_VIDEO_BYTES) {
      throw new Error(
        `Telegram video ${item.media.media_id || item.filename} is ${(item.size / 1024 / 1024).toFixed(2)} MB. ` +
        "Bot API sendVideo limit is 50 MB.",
      );
    }

    const filename = this.PreparedFilename(item, "video", ".mp4");
    const targetPath = path.join(targetDir, filename);
    fs.copyFileSync(item.sourcePath, targetPath);

    return {
      media_id: item.media.media_id,
      originalPath: item.sourcePath,
      preparedPath: targetPath,
      filename,
      mime_type: "video/mp4",
      asset_type: "video",
      size: fs.statSync(targetPath).size,
      converted: false,
      notes: [
        `source_mime:${item.mime_type || "unknown"}`,
        "telegram_video:mp4",
      ],
    };
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

  static PreparedFilename(item: DownloadedMedia, assetType: "photo" | "video", extension: ".jpg" | ".mp4") {
    const originalBase = path.basename(item.filename, path.extname(item.filename));
    const id = item.media.media_id || "media";
    const clean = `${id}_${originalBase}`.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_").slice(0, 120);
    return `${assetType}_${clean || id}${extension}`;
  }
}

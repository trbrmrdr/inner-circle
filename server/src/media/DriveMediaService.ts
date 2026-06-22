import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import axios from "axios";
import { google } from "googleapis";
import { GoogleConfig } from "../config/GoogleConfig";
import { DownloadedMedia, PostMediaItem } from "../types/autopost";
import { HttpHelper } from "../core/HttpHelper";

export class DriveMediaService {
  static DriveClient: ReturnType<typeof google.drive> | null = null;

  static async DownloadMedia(item: PostMediaItem, targetDir: string): Promise<DownloadedMedia> {
    fs.mkdirSync(targetDir, { recursive: true });

    const filename = this.SafeFilename(item);
    const targetPath = path.join(targetDir, filename);

    if (item.file_id) {
      await this.DownloadDriveFile(item.file_id, targetPath);
    } else if (item.media_url || item.public_url) {
      await this.DownloadUrl(item.media_url || item.public_url || "", targetPath);
    } else {
      throw new Error(`No downloadable source for media_id=${item.media_id}`);
    }

    const stat = fs.statSync(targetPath);
    return {
      media: item,
      sourcePath: targetPath,
      filename,
      mime_type: item.mime_type || this.GuessMimeType(filename),
      size: stat.size,
    };
  }

  static async DownloadDriveFile(fileId: string, targetPath: string) {
    const response = await this.Client().files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );

    await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(targetPath));
  }

  static async DownloadUrl(url: string, targetPath: string) {
    if (!url) throw new Error("Download URL is empty");
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: 60_000,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    await pipeline(response.data, fs.createWriteStream(targetPath));
  }

  static SafeFilename(item: PostMediaItem) {
    const baseName = item.name || item.media_id || item.file_id || "media";
    const cleanBase = baseName
      .replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "media";

    const currentExt = path.extname(cleanBase);
    if (currentExt) return `${item.media_id || "media"}_${cleanBase}`;

    return `${item.media_id || "media"}_${cleanBase}${this.ExtensionFromMime(item.mime_type || "")}`;
  }

  static ExtensionFromMime(mimeType: string) {
    const clean = mimeType.toLowerCase();
    if (clean.includes("jpeg")) return ".jpg";
    if (clean.includes("png")) return ".png";
    if (clean.includes("webp")) return ".webp";
    if (clean.includes("heic")) return ".heic";
    if (clean.includes("heif")) return ".heif";
    if (clean.includes("mp4")) return ".mp4";
    if (clean.includes("quicktime")) return ".mov";
    return "";
  }

  static GuessMimeType(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    if ([".jpg", ".jpeg"].includes(ext)) return "image/jpeg";
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".heic") return "image/heic";
    if (ext === ".heif") return "image/heif";
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".mov") return "video/quicktime";
    return "application/octet-stream";
  }

  static Client() {
    if (this.DriveClient) return this.DriveClient;

    if (!GoogleConfig.IsReady() || !fs.existsSync(GoogleConfig.CREDENTIALS_FILE)) {
      throw new Error(`Google credentials are not configured: ${GoogleConfig.CREDENTIALS_FILE}`);
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: GoogleConfig.CREDENTIALS_FILE,
      scopes: GoogleConfig.SCOPES,
    });

    this.DriveClient = google.drive({ version: "v3", auth });
    return this.DriveClient;
  }

  static ErrorMessage(error: unknown) {
    return HttpHelper.ErrorMessage(error);
  }
}

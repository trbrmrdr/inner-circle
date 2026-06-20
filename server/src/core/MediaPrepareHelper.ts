import path from "path";
import { ServerConfig } from "../config/ServerConfig";
import { PostTask } from "../types/autopost";

export class MediaPrepareHelper {
  static NormalizeUrls(task: PostTask) {
    return task.media_urls
      .map((url) => url.trim())
      .filter(Boolean);
  }

  static RequirePublicUrls(platform: string, task: PostTask) {
    const invalid = this.NormalizeUrls(task).filter((url) => !this.IsHttpUrl(url));
    if (invalid.length === 0) return;

    throw new Error(`${platform} requires public https media URLs: ${invalid.join(", ")}`);
  }

  static IsHttpUrl(value: string) {
    return value.startsWith("http://") || value.startsWith("https://");
  }

  static IsVideo(url: string) {
    const cleanUrl = url.split("?")[0].toLowerCase();
    return [".mp4", ".mov", ".m4v", ".webm"].some((ext) => cleanUrl.endsWith(ext));
  }

  static IsImage(url: string) {
    const cleanUrl = url.split("?")[0].toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp"].some((ext) => cleanUrl.endsWith(ext));
  }

  static TmpFile(name: string) {
    return path.resolve(ServerConfig.TMP_MEDIA_DIR, name);
  }
}

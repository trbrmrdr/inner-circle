import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { VkConfig } from "../config/VkConfig";
import { AiTextHelper } from "../core/AiTextHelper";
import { HttpHelper } from "../core/HttpHelper";
import { VkOAuthService } from "../core/VkOAuthService";
import { MediaPipeline } from "../media/MediaPipeline";
import { PostTask, PreparedMedia, PreparedPost, PublishResult } from "../types/autopost";

export class VkPublisher {
  static async PublishPost(task: PostTask, text = ""): Promise<PublishResult> {
    if (!VkConfig.IsReady()) {
      return { ok: false, disabled: true, platform: "vk", message: "VK is not configured" };
    }

    const preparedText = text.trim()
      ? text
      : task.text.trim()
        ? (await AiTextHelper.PreparePostText(task)).vk
        : "";
    const prepared = await MediaPipeline.PrepareVkPost(task, preparedText);
    const result = this.WithPreparedMeta(await this.PublishPreparedPostToGroup(prepared), prepared);
    if ((prepared.warnings || []).length > 0) {
      result.message = `Published with ${prepared.warnings?.length || 0} media warning(s)`;
    }

    if (result.ok) {
      try {
        MediaPipeline.Cleanup(prepared);
      } catch (error) {
        this.AddRawWarning(result, `temp cleanup failed: ${HttpHelper.ErrorMessage(error)}`);
      }
    }

    return result;
  }

  static async PublishPreparedPostToGroup(prepared: PreparedPost): Promise<PublishResult> {
    const groupId = VkConfig.ResolveGroupId();
    const wallOwnerId = -groupId;
    const text = prepared.text.trim();
    const attachments: string[] = [];

    for (const media of prepared.media.slice(0, VkConfig.ATTACHMENTS_LIMIT)) {
      if (media.asset_type === "photo") {
        attachments.push(await this.UploadWallPhotoFile(media));
        continue;
      }

      if (media.asset_type === "video") {
        attachments.push(await this.UploadVideoFile(media, prepared));
        continue;
      }

      throw new Error(`VK autopost supports only photo/video media. Got ${media.asset_type}.`);
    }

    if (!text && attachments.length === 0) {
      throw new Error("VK post has no text and no prepared media.");
    }

    const result = await this.Method("wall.post", {
      owner_id: wallOwnerId,
      from_group: 1,
      message: text,
      attachments: attachments.filter(Boolean).join(","),
      guid: this.Guid(prepared.task.post_uid),
    });

    const postId = String(result?.response?.post_id || "");
    return {
      ok: Boolean(postId),
      platform: "vk",
      id: postId,
      url: postId ? `https://vk.com/wall${wallOwnerId}_${postId}` : undefined,
      raw: result,
    };
  }

  static async AssertManualPostAccess(task: PostTask) {
    if (!VkConfig.IsConfigured()) {
      throw new Error("VK is not configured. Fill VK_ACCESS_TOKEN and numeric VK_GROUP_ID.");
    }

    if (this.TaskHasPhoto(task)) {
      await this.GetWallPhotoUploadServer();
    }
  }

  static TaskHasPhoto(task: PostTask) {
    return (task.media_items || []).some((item) => {
      const type = `${item.type || ""} ${item.mime_type || ""} ${item.name || ""}`.toLowerCase();
      return !type.includes("video");
    });
  }

  static async UploadWallPhotoFile(media: PreparedMedia) {
    const uploadServer = await this.GetWallPhotoUploadServer();
    const uploadUrl = uploadServer?.response?.upload_url;
    if (!uploadUrl) throw new Error("VK did not return photo upload_url");

    const form = new FormData();
    form.append("photo", fs.createReadStream(media.preparedPath), media.filename);

    const uploaded = await this.UploadForm(uploadUrl, form);

    const saved = await this.Method("photos.saveWallPhoto", {
      group_id: VkConfig.ResolveGroupId(),
      photo: uploaded.photo,
      server: uploaded.server,
      hash: uploaded.hash,
    });

    const photo = saved?.response?.[0];
    if (!photo) throw new Error("VK did not return saved wall photo");

    return `photo${photo.owner_id}_${photo.id}`;
  }

  static async GetWallPhotoUploadServer() {
    return this.Method("photos.getWallUploadServer", {
      group_id: VkConfig.ResolveGroupId(),
    });
  }

  static async UploadVideoFile(media: PreparedMedia, prepared: PreparedPost) {
    const saved = await this.Method("video.save", {
      group_id: VkConfig.ResolveGroupId(),
      name: this.VideoTitle(prepared),
      description: this.LimitText(prepared.text, 5000),
      wallpost: 0,
    });

    const video = saved?.response;
    const uploadUrl = video?.upload_url;
    if (!uploadUrl || !video?.owner_id || !video?.video_id) {
      throw new Error("VK did not return video upload_url or video id");
    }

    const form = new FormData();
    form.append("video_file", fs.createReadStream(media.preparedPath), media.filename);
    await this.UploadForm(uploadUrl, form);

    return `video${video.owner_id}_${video.video_id}`;
  }

  static async UploadForm(url: string, form: FormData) {
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 20 * 60_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status >= 400 || response.data?.error) {
      throw new Error(HttpHelper.ErrorText(response.data, response.status));
    }

    return response.data || {};
  }

  static async Method(method: string, params: Record<string, unknown>) {
    const search = new URLSearchParams();
    search.set("access_token", await VkOAuthService.GetAccessToken());
    search.set("v", VkConfig.API_VERSION);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      search.set(key, String(value));
    });

    const data = await HttpHelper.Json<any>({
      method: "POST",
      url: `${VkConfig.API_URL}/${method}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: search,
    });

    if (data?.error) throw new Error(this.VkErrorText(method, data.error));
    return data;
  }

  static VkErrorText(method: string, error: unknown) {
    const raw = HttpHelper.ErrorText(error);
    const code = typeof error === "object" && error !== null
      ? Number((error as { error_code?: unknown }).error_code || 0)
      : 0;

    if (code === 27 && ["photos.getWallUploadServer", "photos.saveWallPhoto", "video.save"].includes(method)) {
      return [
        raw,
        "VK token type is wrong for media upload: use a USER access token of a community admin/editor with wall/photos/video permissions.",
        "A community/group token can resolve group id, but VK rejects wall media upload methods with error 27.",
      ].join("\n");
    }

    if (code === 27 && method === "wall.post") {
      return [
        raw,
        "VK token type is wrong for wall.post: use a USER access token of a community admin/editor with wall permission.",
      ].join("\n");
    }

    return raw;
  }

  static WithPreparedMeta(result: PublishResult, prepared: PreparedPost) {
    const stats = this.PreparedStats(prepared);
    return {
      ...result,
      stats,
      raw: {
        vk: result.raw,
        warnings: prepared.warnings || [],
        media: prepared.media.map((item) => item.media_id),
        stats,
        manifestPath: prepared.manifestPath,
      },
    };
  }

  static PreparedStats(prepared: PreparedPost) {
    const photoCount = prepared.media.filter((item) => item.asset_type === "photo").length;
    const videoCount = prepared.media.filter((item) => item.asset_type === "video").length;
    return {
      textLength: prepared.text.length,
      mediaCount: prepared.media.length,
      photoCount,
      videoCount,
      warningCount: prepared.warnings?.length || 0,
    };
  }

  static AddRawWarning(result: PublishResult, message: string) {
    if (!result.raw || typeof result.raw !== "object" || Array.isArray(result.raw)) {
      result.raw = { value: result.raw, warnings: [message] };
      return;
    }

    const raw = result.raw as { warnings?: string[] };
    raw.warnings = [...(raw.warnings || []), message];
  }

  static VideoTitle(prepared: PreparedPost) {
    const title = (prepared.task.title || prepared.task.post_uid || "Inner Circle").trim();
    return this.LimitText(title, 128) || "Inner Circle";
  }

  static LimitText(text: string, max: number) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, Math.max(0, max - 3)).trimEnd()}...` : clean;
  }

  static Guid(postUid: string) {
    return `vk:${postUid}`.slice(0, 64);
  }
}

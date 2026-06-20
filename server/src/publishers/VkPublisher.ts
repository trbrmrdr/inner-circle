import FormData from "form-data";
import { VkConfig } from "../config/VkConfig";
import { HttpHelper } from "../core/HttpHelper";
import { MediaPrepareHelper } from "../core/MediaPrepareHelper";
import { PostTask, PublishResult } from "../types/autopost";

export class VkPublisher {
  static async PublishPost(task: PostTask, text: string): Promise<PublishResult> {
    if (!VkConfig.IsReady()) {
      return { ok: false, disabled: true, platform: "vk", message: "VK is not configured" };
    }

    const ownerId = VkConfig.ResolveOwnerId();
    const mediaUrls = MediaPrepareHelper.NormalizeUrls(task);
    const attachments: string[] = [];

    for (const url of mediaUrls.slice(0, 10)) {
      if (MediaPrepareHelper.IsImage(url)) {
        attachments.push(await this.UploadWallPhoto(ownerId, url));
      } else if (MediaPrepareHelper.IsHttpUrl(url)) {
        attachments.push(url);
      }
    }

    const result = await this.Method("wall.post", {
      owner_id: ownerId,
      from_group: ownerId < 0 ? 1 : 0,
      message: text,
      attachments: attachments.filter(Boolean).join(","),
    });

    const postId = String(result?.response?.post_id || "");
    return {
      ok: Boolean(postId),
      platform: "vk",
      id: postId,
      url: postId ? `https://vk.com/wall${ownerId}_${postId}` : undefined,
      raw: result,
    };
  }

  static async UploadWallPhoto(ownerId: number, url: string) {
    const uploadServer = await this.Method("photos.getWallUploadServer", {
      group_id: ownerId < 0 ? Math.abs(ownerId) : undefined,
    });

    const uploadUrl = uploadServer?.response?.upload_url;
    if (!uploadUrl) throw new Error("VK did not return photo upload_url");

    const image = await HttpHelper.Buffer(url);
    const form = new FormData();
    form.append("photo", image, { filename: "photo.jpg" });

    const uploaded = await HttpHelper.Json<any>({
      method: "POST",
      url: uploadUrl,
      headers: form.getHeaders(),
      data: form,
    });

    const saved = await this.Method("photos.saveWallPhoto", {
      group_id: ownerId < 0 ? Math.abs(ownerId) : undefined,
      photo: uploaded.photo,
      server: uploaded.server,
      hash: uploaded.hash,
    });

    const photo = saved?.response?.[0];
    if (!photo) throw new Error("VK did not return saved wall photo");

    return `photo${photo.owner_id}_${photo.id}`;
  }

  static async Method(method: string, params: Record<string, unknown>) {
    const search = new URLSearchParams();
    search.set("access_token", VkConfig.ACCESS_TOKEN);
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

    if (data?.error) throw new Error(HttpHelper.ErrorText(data.error));
    return data;
  }
}

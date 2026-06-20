import { InstagramConfig } from "../config/InstagramConfig";
import { HttpHelper } from "../core/HttpHelper";
import { MediaPrepareHelper } from "../core/MediaPrepareHelper";
import { PostTask, PublishResult } from "../types/autopost";

export class InstagramPublisher {
  static async PublishPost(task: PostTask, text: string): Promise<PublishResult> {
    if (!InstagramConfig.IsReady()) {
      return { ok: false, disabled: true, platform: "instagram", message: "Instagram is not configured" };
    }

    MediaPrepareHelper.RequirePublicUrls("Instagram", task);
    const mediaUrls = MediaPrepareHelper.NormalizeUrls(task);
    if (mediaUrls.length === 0) {
      return { ok: false, platform: "instagram", message: "Instagram requires media URL" };
    }

    const creationId = await this.CreateContainer(task, text, mediaUrls);
    await this.WaitContainer(creationId);
    const published = await this.Graph(`${InstagramConfig.IG_USER_ID}/media_publish`, {
      creation_id: creationId,
    });

    const id = String(published?.id || "");
    return {
      ok: Boolean(id),
      platform: "instagram",
      id,
      raw: published,
    };
  }

  static async CreateContainer(task: PostTask, text: string, mediaUrls: string[]) {
    if (task.post_type === "carousel" || task.post_type === "album" || mediaUrls.length > 1) {
      const children: string[] = [];
      for (const url of mediaUrls.slice(0, 10)) {
        const child = await this.Graph(`${InstagramConfig.IG_USER_ID}/media`, {
          is_carousel_item: true,
          image_url: MediaPrepareHelper.IsVideo(url) ? undefined : url,
          video_url: MediaPrepareHelper.IsVideo(url) ? url : undefined,
          media_type: MediaPrepareHelper.IsVideo(url) ? "VIDEO" : undefined,
        });
        children.push(String(child.id));
      }

      const parent = await this.Graph(`${InstagramConfig.IG_USER_ID}/media`, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: text,
      });
      return String(parent.id);
    }

    const url = mediaUrls[0];
    const isVideo = MediaPrepareHelper.IsVideo(url);
    const isStory = task.post_type === "story";
    const isReel = task.post_type === "reel";
    const container = await this.Graph(`${InstagramConfig.IG_USER_ID}/media`, {
      image_url: !isVideo ? url : undefined,
      video_url: isVideo ? url : undefined,
      media_type: isStory ? "STORIES" : isReel ? "REELS" : isVideo ? "VIDEO" : undefined,
      caption: isStory ? undefined : text,
      share_to_feed: isReel ? true : undefined,
    });

    return String(container.id);
  }

  static async WaitContainer(containerId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await this.Graph(`${containerId}`, {
        fields: "status_code,status",
      }, "GET");

      if (status?.status_code === "FINISHED") return;
      if (status?.status_code === "ERROR") throw new Error(HttpHelper.ErrorText(status));
      await HttpHelper.Delay(5_000);
    }

    throw new Error(`Instagram media container ${containerId} was not ready in time`);
  }

  static async Graph(path: string, params: Record<string, unknown>, method: "GET" | "POST" = "POST") {
    const search = new URLSearchParams();
    search.set("access_token", InstagramConfig.PAGE_ACCESS_TOKEN);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      search.set(key, String(value));
    });

    const url = `${InstagramConfig.GRAPH_URL}/${InstagramConfig.GRAPH_VERSION}/${path}`;
    return HttpHelper.Json<any>({
      method,
      url: method === "GET" ? `${url}?${search.toString()}` : url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: method === "POST" ? search : undefined,
    });
  }
}

import { FacebookConfig } from "../config/FacebookConfig";
import { HttpHelper } from "../core/HttpHelper";
import { MediaPrepareHelper } from "../core/MediaPrepareHelper";
import { PostTask, PublishResult } from "../types/autopost";

export class FacebookPublisher {
  static async PublishPost(task: PostTask, text: string): Promise<PublishResult> {
    if (!FacebookConfig.IsReady()) {
      return { ok: false, disabled: true, platform: "facebook", message: "Facebook is not configured" };
    }

    const mediaUrls = MediaPrepareHelper.NormalizeUrls(task);
    if (mediaUrls.length > 0 && MediaPrepareHelper.IsImage(mediaUrls[0])) {
      const photo = await this.Graph(`${FacebookConfig.PAGE_ID}/photos`, {
        url: mediaUrls[0],
        caption: text,
      });

      return {
        ok: Boolean(photo?.id || photo?.post_id),
        platform: "facebook",
        id: String(photo?.post_id || photo?.id || ""),
        raw: photo,
      };
    }

    const feed = await this.Graph(`${FacebookConfig.PAGE_ID}/feed`, {
      message: text,
      link: mediaUrls[0],
    });

    return {
      ok: Boolean(feed?.id),
      platform: "facebook",
      id: String(feed?.id || ""),
      raw: feed,
    };
  }

  static async Graph(path: string, params: Record<string, unknown>) {
    const search = new URLSearchParams();
    search.set("access_token", FacebookConfig.PAGE_ACCESS_TOKEN);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      search.set(key, String(value));
    });

    return HttpHelper.Json<any>({
      method: "POST",
      url: `${FacebookConfig.GRAPH_URL}/${FacebookConfig.GRAPH_VERSION}/${path}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: search,
    });
  }
}

import { Env } from "./Env";

export class VkConfig {
  static ENABLED = Env.Bool("VK_ENABLED", false);
  static API_VERSION = Env.Str("VK_API_VERSION", "5.199");
  static ACCESS_TOKEN = Env.Str("VK_ACCESS_TOKEN", "");
  static GROUP_ID = Env.Str("VK_GROUP_ID", "");
  static API_URL = Env.Str("VK_API_URL", "https://api.vk.com/method");
  static ATTACHMENTS_LIMIT = Math.max(1, Env.Num("VK_ATTACHMENTS_LIMIT", 10));

  static IsReady() {
    return Boolean(this.ENABLED && this.IsConfigured());
  }

  static IsConfigured() {
    return Boolean(this.ACCESS_TOKEN && this.ResolveGroupId() > 0);
  }

  static ResolveGroupId() {
    const groupId = Number(this.GROUP_ID);
    if (!Number.isFinite(groupId)) return 0;
    return Math.abs(Math.floor(groupId));
  }
}

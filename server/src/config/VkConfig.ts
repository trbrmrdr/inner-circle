import { Env } from "./Env";

export class VkConfig {
  static ENABLED = Env.Bool("VK_ENABLED", false);
  static API_VERSION = Env.Str("VK_API_VERSION", "5.199");
  static ACCESS_TOKEN = Env.Str("VK_ACCESS_TOKEN", "");
  static GROUP_ID = Env.Str("VK_GROUP_ID", "");
  static OWNER_ID = Env.Str("VK_OWNER_ID", "");
  static API_URL = "https://api.vk.com/method";

  static IsReady() {
    return Boolean(this.ENABLED && this.ACCESS_TOKEN && (this.OWNER_ID || this.GROUP_ID));
  }

  static ResolveOwnerId() {
    if (this.OWNER_ID) return Number(this.OWNER_ID);
    if (this.GROUP_ID) return -Math.abs(Number(this.GROUP_ID));
    return 0;
  }
}

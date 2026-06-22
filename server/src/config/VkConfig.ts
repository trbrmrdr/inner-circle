import fs from "fs";
import { Env } from "./Env";
import { ServerConfig } from "./ServerConfig";

export class VkConfig {
  static ENABLED = Env.Bool("VK_ENABLED", false);
  static API_VERSION = Env.Str("VK_API_VERSION", "5.199");
  static ACCESS_TOKEN = Env.Str("VK_ACCESS_TOKEN", "");
  static REFRESH_TOKEN = Env.Str("VK_REFRESH_TOKEN", "");
  static TOKEN_FILE = Env.Str("VK_TOKEN_FILE", `${ServerConfig.ROOT_DIR}/private/vk-token.json`);
  static GROUP_ID = Env.Str("VK_GROUP_ID", "");
  static API_URL = Env.Str("VK_API_URL", "https://api.vk.com/method");
  static ATTACHMENTS_LIMIT = Math.max(1, Env.Num("VK_ATTACHMENTS_LIMIT", 10));
  static OAUTH_CLIENT_ID = Env.Str("VK_OAUTH_CLIENT_ID", "");
  static OAUTH_REDIRECT_URI = Env.Str(
    "VK_OAUTH_REDIRECT_URI",
    ServerConfig.PUBLIC_BASE_URL ? `${ServerConfig.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/vk/oauth/callback` : "",
  );
  static OAUTH_SCOPE = Env.Str("VK_OAUTH_SCOPE", "groups wall photos video");
  static OAUTH_SERVICE_TOKEN = Env.Str("VK_OAUTH_SERVICE_TOKEN", "");
  static OAUTH_ADMIN_TOKEN = Env.Str("VK_OAUTH_ADMIN_TOKEN", "");
  static OAUTH_URL = Env.Str("VK_OAUTH_URL", "https://id.vk.ru");

  static IsReady() {
    return Boolean(this.ENABLED && this.IsConfigured());
  }

  static IsConfigured() {
    return Boolean((this.ACCESS_TOKEN || this.REFRESH_TOKEN || fs.existsSync(this.TOKEN_FILE)) && this.ResolveGroupId() > 0);
  }

  static IsOAuthConfigured() {
    return Boolean(this.ENABLED && this.OAUTH_CLIENT_ID && this.OAUTH_REDIRECT_URI);
  }

  static ResolveGroupId() {
    const groupId = Number(this.GROUP_ID);
    if (!Number.isFinite(groupId)) return 0;
    return Math.abs(Math.floor(groupId));
  }
}

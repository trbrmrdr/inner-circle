import fs from "fs";
import path from "path";
import { VkConfig } from "../config/VkConfig";

export interface VkPendingOAuth {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  scope: string;
  createdAt: string;
}

export interface VkStoredToken {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: string;
  user_id?: number | string;
  scope?: string;
  device_id?: string;
  state?: string;
  updated_at?: string;
}

export interface VkTokenFile {
  token?: VkStoredToken;
  pending?: VkPendingOAuth;
}

export class VkTokenStore {
  static FilePath() {
    return VkConfig.TOKEN_FILE;
  }

  static Read(): VkTokenFile {
    const filePath = this.FilePath();
    if (!fs.existsSync(filePath)) return {};

    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return {};

    return JSON.parse(raw) as VkTokenFile;
  }

  static Write(data: VkTokenFile) {
    const filePath = this.FilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  }

  static Pending() {
    return this.Read().pending;
  }

  static SavePending(pending: VkPendingOAuth) {
    this.Write({ ...this.Read(), pending });
  }

  static Token() {
    return this.Read().token;
  }

  static SaveToken(token: VkStoredToken) {
    const current = this.Read();
    this.Write({
      ...current,
      pending: undefined,
      token: {
        ...current.token,
        ...token,
        updated_at: new Date().toISOString(),
      },
    });
  }

  static Status() {
    const data = this.Read();
    const token = data.token;
    const pending = data.pending;

    return {
      tokenFile: this.FilePath(),
      hasAccessToken: Boolean(token?.access_token || VkConfig.ACCESS_TOKEN),
      hasRefreshToken: Boolean(token?.refresh_token || VkConfig.REFRESH_TOKEN),
      expiresAt: token?.expires_at || "",
      userId: token?.user_id || "",
      scope: token?.scope || "",
      deviceId: token?.device_id ? "set" : "",
      pending: pending
        ? {
            state: pending.state,
            createdAt: pending.createdAt,
            redirectUri: pending.redirectUri,
            scope: pending.scope,
          }
        : null,
    };
  }
}

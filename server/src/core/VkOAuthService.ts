import crypto from "crypto";
import { VkConfig } from "../config/VkConfig";
import { HttpHelper } from "./HttpHelper";
import { VkStoredToken, VkTokenStore } from "./VkTokenStore";

export class VkOAuthService {
  static TokenRefreshSkewMs = 10 * 60_000;

  static StartAuthorization() {
    if (!VkConfig.IsOAuthConfigured()) {
      throw new Error("VK OAuth is not configured. Fill VK_OAUTH_CLIENT_ID and VK_OAUTH_REDIRECT_URI.");
    }

    const codeVerifier = this.RandomUrlString(64);
    const codeChallenge = this.CodeChallenge(codeVerifier);
    const state = this.RandomUrlString(24);
    const redirectUri = VkConfig.OAUTH_REDIRECT_URI;
    const scope = VkConfig.OAUTH_SCOPE;

    VkTokenStore.SavePending({
      state,
      codeVerifier,
      codeChallenge,
      redirectUri,
      scope,
      createdAt: new Date().toISOString(),
    });

    const url = new URL("/authorize", VkConfig.OAUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", VkConfig.OAUTH_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (scope.trim()) url.searchParams.set("scope", scope.trim());

    return {
      ok: true,
      authorizeUrl: url.toString(),
      redirectUri,
      scope,
      state,
      tokenFile: VkTokenStore.FilePath(),
    };
  }

  static async CompleteAuthorization(input: { code: string; state: string; deviceId: string }) {
    const pending = VkTokenStore.Pending();
    if (!pending) throw new Error("VK OAuth pending state not found. Start OAuth first.");
    if (!input.state || input.state !== pending.state) throw new Error("VK OAuth state mismatch.");
    if (!input.code) throw new Error("VK OAuth callback has no code.");
    if (!input.deviceId) throw new Error("VK OAuth callback has no device_id.");

    const response = await this.PostOAuth("authorization_code", {
      code_verifier: pending.codeVerifier,
      redirect_uri: pending.redirectUri,
      code: input.code,
      device_id: input.deviceId,
      state: input.state,
    });

    const token = this.NormalizeToken(response, input.deviceId, input.state);
    VkTokenStore.SaveToken(token);

    return {
      ok: true,
      token: this.SafeTokenStatus(token),
      tokenFile: VkTokenStore.FilePath(),
    };
  }

  static async GetAccessToken() {
    const stored = VkTokenStore.Token();
    if (stored?.access_token && !this.ShouldRefresh(stored)) return stored.access_token;

    const refreshToken = stored?.refresh_token || VkConfig.REFRESH_TOKEN;
    const deviceId = stored?.device_id || "";
    if (refreshToken && deviceId) {
      return (await this.RefreshAccessToken()).access_token;
    }

    if (VkConfig.ACCESS_TOKEN) return VkConfig.ACCESS_TOKEN;

    throw new Error("VK access token is not configured. Run VK OAuth first or fill VK_ACCESS_TOKEN.");
  }

  static async RefreshAccessToken() {
    const stored = VkTokenStore.Token();
    const refreshToken = stored?.refresh_token || VkConfig.REFRESH_TOKEN;
    const deviceId = stored?.device_id || "";
    if (!refreshToken) throw new Error("VK refresh token is not configured.");
    if (!deviceId) throw new Error("VK device_id is not stored. Re-run VK OAuth.");

    const state = this.RandomUrlString(24);
    const response = await this.PostOAuth("refresh_token", {
      refresh_token: refreshToken,
      device_id: deviceId,
      state,
      scope: stored?.scope || VkConfig.OAUTH_SCOPE,
    });

    const token = this.NormalizeToken(response, deviceId, state);
    VkTokenStore.SaveToken(token);
    return token;
  }

  static ShouldRefresh(token: VkStoredToken) {
    if (!token.expires_at) return false;
    const expiresAt = Date.parse(token.expires_at);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt - Date.now() <= this.TokenRefreshSkewMs;
  }

  static async PostOAuth(grantType: "authorization_code" | "refresh_token", params: Record<string, string>) {
    const body = new URLSearchParams();
    body.set("grant_type", grantType);
    body.set("client_id", VkConfig.OAUTH_CLIENT_ID);
    if (VkConfig.OAUTH_SERVICE_TOKEN) body.set("service_token", VkConfig.OAUTH_SERVICE_TOKEN);

    Object.entries(params).forEach(([key, value]) => {
      if (value) body.set(key, value);
    });

    return HttpHelper.Json<Record<string, any>>({
      method: "POST",
      url: `${VkConfig.OAUTH_URL.replace(/\/$/, "")}/oauth2/auth`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: body,
    }, 0);
  }

  static NormalizeToken(response: Record<string, any>, deviceId: string, state: string): VkStoredToken {
    if (response.error) throw new Error(HttpHelper.ErrorText(response));
    if (!response.access_token) throw new Error(`VK OAuth did not return access_token: ${HttpHelper.ErrorText(response)}`);

    const expiresIn = Number(response.expires_in || 0);
    const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : "";

    return {
      access_token: String(response.access_token),
      refresh_token: response.refresh_token ? String(response.refresh_token) : undefined,
      token_type: response.token_type ? String(response.token_type) : undefined,
      expires_in: Number.isFinite(expiresIn) ? expiresIn : undefined,
      expires_at: expiresAt,
      user_id: response.user_id,
      scope: response.scope ? String(response.scope) : undefined,
      device_id: deviceId,
      state,
    };
  }

  static SafeTokenStatus(token: VkStoredToken) {
    return {
      hasAccessToken: Boolean(token.access_token),
      hasRefreshToken: Boolean(token.refresh_token),
      tokenType: token.token_type || "",
      expiresIn: token.expires_in || 0,
      expiresAt: token.expires_at || "",
      userId: token.user_id || "",
      scope: token.scope || "",
      deviceId: token.device_id ? "set" : "",
    };
  }

  static RandomUrlString(bytes: number) {
    return crypto.randomBytes(bytes).toString("base64url");
  }

  static CodeChallenge(codeVerifier: string) {
    return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }
}

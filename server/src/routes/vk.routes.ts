import { Router } from "express";
import { VkConfig } from "../config/VkConfig";
import { HttpHelper } from "../core/HttpHelper";
import { VkOAuthService } from "../core/VkOAuthService";
import { VkTokenStore } from "../core/VkTokenStore";

export const VkRoutes = Router();

VkRoutes.get("/oauth/start", (req, res) => {
  if (!AllowAdmin(req)) {
    res.status(403).json({ ok: false, message: "VK OAuth admin token is invalid" });
    return;
  }

  try {
    const result = VkOAuthService.StartAuthorization();
    res.json({
      ...result,
      adminTokenProtection: VkConfig.OAUTH_ADMIN_TOKEN ? "on" : "off",
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: HttpHelper.ErrorMessage(error) });
  }
});

VkRoutes.get("/oauth/status", (req, res) => {
  if (!AllowAdmin(req)) {
    res.status(403).json({ ok: false, message: "VK OAuth admin token is invalid" });
    return;
  }

  res.json({ ok: true, oauthConfigured: VkConfig.IsOAuthConfigured(), store: VkTokenStore.Status() });
});

VkRoutes.post("/oauth/refresh", async (req, res) => {
  if (!AllowAdmin(req)) {
    res.status(403).json({ ok: false, message: "VK OAuth admin token is invalid" });
    return;
  }

  try {
    const token = await VkOAuthService.RefreshAccessToken();
    res.json({ ok: true, token: VkOAuthService.SafeTokenStatus(token), store: VkTokenStore.Status() });
  } catch (error) {
    res.status(500).json({ ok: false, message: HttpHelper.ErrorMessage(error) });
  }
});

VkRoutes.get("/oauth/callback", async (req, res) => {
  const error = Query(req.query.error);
  if (error) {
    res.status(400).type("text/plain").send([
      "VK OAuth failed.",
      `error: ${error}`,
      `description: ${Query(req.query.error_description) || "-"}`,
    ].join("\n"));
    return;
  }

  try {
    const result = await VkOAuthService.CompleteAuthorization({
      code: Query(req.query.code),
      state: Query(req.query.state),
      deviceId: Query(req.query.device_id),
    });

    res.type("text/plain").send([
      "VK OAuth completed.",
      `token_file: ${result.tokenFile}`,
      `has_access_token: ${result.token.hasAccessToken ? "yes" : "no"}`,
      `has_refresh_token: ${result.token.hasRefreshToken ? "yes" : "no"}`,
      `expires_at: ${result.token.expiresAt || "-"}`,
      `user_id: ${result.token.userId || "-"}`,
      `scope: ${result.token.scope || "-"}`,
      "",
      "You can close this page.",
    ].join("\n"));
  } catch (callbackError) {
    res.status(500).type("text/plain").send(`VK OAuth callback failed.\n${HttpHelper.ErrorMessage(callbackError)}`);
  }
});

function AllowAdmin(req: { query: Record<string, unknown>; headers: Record<string, unknown> }) {
  if (!VkConfig.OAUTH_ADMIN_TOKEN) return true;

  const queryToken = Query(req.query.token);
  const headerToken = Query(req.headers["x-vk-oauth-token"]);
  const authHeader = Query(req.headers.authorization);
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  return [queryToken, headerToken, bearerToken].includes(VkConfig.OAUTH_ADMIN_TOKEN);
}

function Query(value: unknown) {
  if (Array.isArray(value)) return Query(value[0]);
  return value === undefined || value === null ? "" : String(value);
}

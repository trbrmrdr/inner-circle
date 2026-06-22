import express from "express";
import fs from "fs";
import { DeepSeekConfig } from "./config/DeepSeekConfig";
import { EmailConfig } from "./config/EmailConfig";
import { FacebookConfig } from "./config/FacebookConfig";
import { GoogleConfig } from "./config/GoogleConfig";
import { InstagramConfig } from "./config/InstagramConfig";
import { ServerConfig } from "./config/ServerConfig";
import { TelegramConfig } from "./config/TelegramConfig";
import { VkConfig } from "./config/VkConfig";
import { AutoPostRunner } from "./core/AutoPostRunner";
import { HttpHelper } from "./core/HttpHelper";
import { TechLog } from "./core/TechLog";
import { TimeHelper } from "./core/TimeHelper";
import { ApiRoutes } from "./routes";

[
  ServerConfig.TMP_MEDIA_DIR,
  ServerConfig.AUTOPOST_TMP_DIR,
  ServerConfig.MEDIA_WORK_DIR,
].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-lead-token, x-vk-oauth-token, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "inner-circle-server",
    autopost: AutoPostRunner.Status(),
  });
});

app.use("/api", ApiRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = HttpHelper.ErrorMessage(error);
  console.error("[server-error]", message);
  res.status(500).json({ ok: false, message });
});

app.listen(ServerConfig.PORT, () => {
  console.log(`[server] listening on ${ServerConfig.PORT}`);
  if (ServerConfig.AUTOPOST_ENABLED) AutoPostRunner.Start();
  if (TelegramConfig.STARTUP_STATUS_ENABLED) {
    TechLog.Status(StartupStatusText()).catch(() => undefined);
  }
});

function StartupStatusText() {
  const readyEmailProviders = EmailConfig.ReadyProviders().map((provider) => provider.name).join(", ") || "-";

  return [
    "Сервер запущен.",
    `Node env: ${ServerConfig.NODE_ENV}`,
    `Timezone: ${ServerConfig.TIMEZONE}`,
    `Local time: ${TimeHelper.NowLocal()}`,
    `Public URL: ${ServerConfig.PUBLIC_BASE_URL || "-"}`,
    `Public host: ${ServerConfig.PUBLIC_HOST || "-"}`,
    `Port: ${ServerConfig.PORT}`,
    "",
    `Autopost worker: ${ServerConfig.AUTOPOST_ENABLED ? "on" : "off"}`,
    `Autopost interval default: ${ServerConfig.AUTOPOST_INTERVAL_MS} ms`,
    `Autopost publish window default: ${ServerConfig.AUTOPOST_PUBLISH_WINDOW_MINUTES} min`,
    `Autopost future grace default: ${ServerConfig.AUTOPOST_FUTURE_GRACE_SECONDS} sec`,
    `Google Sheets: ${GoogleConfig.IsReady() ? "ready" : "off/not ready"}`,
    "",
    `Telegram tech: ${TelegramConfig.IsTechReady() ? "ready" : "off/not ready"}`,
    `Telegram startup status: ${TelegramConfig.STARTUP_STATUS_ENABLED ? "on" : "off"}`,
    `Telegram public posting: ${TelegramConfig.IsBotReady() && TelegramConfig.PUBLIC_CHAT_ID ? "ready" : "off/not ready"}`,
    `Email: ${EmailConfig.IsReady() ? `ready (${readyEmailProviders})` : "off/not ready"}`,
    `DeepSeek: ${DeepSeekConfig.IsReady() ? "ready" : "off/not ready"}`,
    "",
    `VK: ${VkConfig.IsReady() ? "ready" : "off/not ready"}`,
    `Instagram: ${InstagramConfig.IsReady() ? "ready" : "off/not ready"}`,
    `Facebook: ${FacebookConfig.IsReady() ? "ready" : "off/not ready"}`,
  ].join("\n");
}

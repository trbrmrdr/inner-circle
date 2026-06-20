import express from "express";
import fs from "fs";
import { ServerConfig } from "./config/ServerConfig";
import { AutoPostRunner } from "./core/AutoPostRunner";
import { HttpHelper } from "./core/HttpHelper";
import { TechLog } from "./core/TechLog";
import { ApiRoutes } from "./routes";

fs.mkdirSync(ServerConfig.TMP_MEDIA_DIR, { recursive: true });

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-lead-token");
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
  TechLog.Status(`Сервер запущен.\nPort: ${ServerConfig.PORT}\nAutopost: ${ServerConfig.AUTOPOST_ENABLED ? "on" : "off"}`).catch(() => undefined);
});

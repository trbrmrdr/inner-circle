import { Router } from "express";
import { ServerConfig } from "../config/ServerConfig";
import { AutoPostRunner } from "../core/AutoPostRunner";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";

export const AutoPostRoutes = Router();

AutoPostRoutes.get("/health", (_req, res) => {
  res.json({
    ok: true,
    sheetsReady: GoogleSheetsService.IsReady(),
    autopost: AutoPostRunner.Status(),
  });
});

AutoPostRoutes.get("/status", (_req, res) => {
  res.json({
    ok: true,
    status: AutoPostRunner.Status(),
  });
});

AutoPostRoutes.post("/run", async (_req, res) => {
  if (!ServerConfig.AUTOPOST_ENABLED) {
    res.status(409).json({ ok: false, disabled: true, message: "Autopost is disabled by AUTOPOST_ENABLED=false" });
    return;
  }

  const result = await AutoPostRunner.RunOnce();
  res.json(result);
});

AutoPostRoutes.post("/start", (_req, res) => {
  if (!ServerConfig.AUTOPOST_ENABLED) {
    res.status(409).json({ ok: false, disabled: true, message: "Autopost is disabled by AUTOPOST_ENABLED=false" });
    return;
  }

  AutoPostRunner.Start();
  res.json({ ok: true, status: AutoPostRunner.Status() });
});

AutoPostRoutes.post("/stop", (_req, res) => {
  AutoPostRunner.Stop();
  res.json({ ok: true, status: AutoPostRunner.Status() });
});

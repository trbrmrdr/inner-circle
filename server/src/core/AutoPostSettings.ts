import { ServerConfig } from "../config/ServerConfig";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";

export interface AutoPostRuntimeSettings {
  envEnabled: boolean;
  settingsEnabled: boolean;
  enabled: boolean;
  intervalMs: number;
  publishWindowMinutes: number;
  futureGraceSeconds: number;
}

export class AutoPostSettings {
  static async Load(): Promise<AutoPostRuntimeSettings> {
    const settings = await GoogleSheetsService.ReadSettings();
    const settingsEnabled = this.Bool(settings, "autopost.enabled", ServerConfig.AUTOPOST_ENABLED);

    return {
      envEnabled: ServerConfig.AUTOPOST_ENABLED,
      settingsEnabled,
      enabled: ServerConfig.AUTOPOST_ENABLED && settingsEnabled,
      intervalMs: this.Num(settings, "autopost.interval_ms", ServerConfig.AUTOPOST_INTERVAL_MS, 1_000),
      publishWindowMinutes: this.Num(
        settings,
        "autopost.publish_window_minutes",
        ServerConfig.AUTOPOST_PUBLISH_WINDOW_MINUTES,
        1,
      ),
      futureGraceSeconds: this.Num(
        settings,
        "autopost.future_grace_seconds",
        ServerConfig.AUTOPOST_FUTURE_GRACE_SECONDS,
        0,
      ),
    };
  }

  static Bool(settings: Map<string, string>, key: string, fallback: boolean) {
    const raw = settings.get(key);
    if (raw === undefined || raw === "") return fallback;
    return ["1", "true", "yes", "on", "да"].includes(raw.trim().toLowerCase());
  }

  static Num(settings: Map<string, string>, key: string, fallback: number, min: number) {
    const raw = settings.get(key);
    const value = Number(raw === undefined || raw === "" ? fallback : raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.floor(value));
  }
}

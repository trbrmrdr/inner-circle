import path from "path";
import { Env } from "./Env";

function ResolveServerPath(rootDir: string, value: string) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

export class ServerConfig {
  static NODE_ENV = Env.Str("NODE_ENV", "development");
  static TIMEZONE = Env.Str("TZ", Intl.DateTimeFormat().resolvedOptions().timeZone || "system");
  static PORT = Env.Num("SERVER_PORT", 4100);
  static PUBLIC_BASE_URL = Env.Str("PUBLIC_BASE_URL", "");
  static PUBLIC_HOST = Env.Str("PUBLIC_HOST", "");
  static AUTOPOST_ENABLED = Env.Bool("AUTOPOST_ENABLED", false);
  static AUTOPOST_INTERVAL_MS = Env.Num("AUTOPOST_INTERVAL_MS", 60_000);
  static AUTOPOST_PUBLISH_WINDOW_MINUTES = Env.Num("AUTOPOST_PUBLISH_WINDOW_MINUTES", 180);
  static AUTOPOST_FUTURE_GRACE_SECONDS = Env.Num("AUTOPOST_FUTURE_GRACE_SECONDS", 30);
  static LEAD_ROUTE_TOKEN = Env.Str("LEAD_ROUTE_TOKEN", "");
  static ROOT_DIR = path.resolve(__dirname, "../../");
  static TMP_DIR = ResolveServerPath(this.ROOT_DIR, Env.Str("SERVER_TMP_DIR", "./tmp"));
  static TMP_MEDIA_DIR = ResolveServerPath(this.ROOT_DIR, Env.Str("TMP_MEDIA_DIR", path.join(this.TMP_DIR, "media")));
  static AUTOPOST_TMP_DIR = ResolveServerPath(this.ROOT_DIR, Env.Str("AUTOPOST_TMP_DIR", path.join(this.TMP_DIR, "autopost")));
  static MEDIA_WORK_DIR = ResolveServerPath(this.ROOT_DIR, Env.Str("MEDIA_WORK_DIR", path.join(this.TMP_DIR, "work")));
  static MEDIA_TOOLS_DIR = ResolveServerPath(this.ROOT_DIR, Env.Str("MEDIA_TOOLS_DIR", "./scripts/media"));
}

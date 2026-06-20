import path from "path";
import { Env } from "./Env";

export class ServerConfig {
  static NODE_ENV = Env.Str("NODE_ENV", "development");
  static PORT = Env.Num("SERVER_PORT", 4100);
  static PUBLIC_BASE_URL = Env.Str("PUBLIC_BASE_URL", "");
  static AUTOPOST_ENABLED = Env.Bool("AUTOPOST_ENABLED", false);
  static AUTOPOST_INTERVAL_MS = Env.Num("AUTOPOST_INTERVAL_MS", 60_000);
  static AUTOPOST_BATCH_LIMIT = Env.Num("AUTOPOST_BATCH_LIMIT", 3);
  static LEAD_ROUTE_TOKEN = Env.Str("LEAD_ROUTE_TOKEN", "");
  static ROOT_DIR = path.resolve(__dirname, "../../");
  static TMP_MEDIA_DIR = path.resolve(this.ROOT_DIR, "tmp/media");
}

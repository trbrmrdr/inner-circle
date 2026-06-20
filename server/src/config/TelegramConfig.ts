import path from "path";
import { Env } from "./Env";
import { ServerConfig } from "./ServerConfig";

export class TelegramConfig {
  static POST_ENABLED = Env.Bool("TELEGRAM_POST_ENABLED", true);
  static TECH_ENABLED = Env.Bool("TELEGRAM_TECH_ENABLED", true);
  static BOT_TOKEN = Env.Str("TELEGRAM_BOT_TOKEN", "");
  static TECH_CHAT_ID = Env.Str("TELEGRAM_TECH_CHAT_ID", "");
  static PUBLIC_CHAT_ID = Env.Str("TELEGRAM_PUBLIC_CHAT_ID", "");
  static PARSE_MODE = Env.Str("TELEGRAM_PARSE_MODE", "HTML");
  static API_URL = "https://api.telegram.org/bot";

  static MTPROTO_ENABLED = Env.Bool("TELEGRAM_MTPROTO_ENABLED", false);
  static API_ID = Env.Num("TELEGRAM_API_ID", 0);
  static API_HASH = Env.Str("TELEGRAM_API_HASH", "");
  static SESSION_FILE = path.resolve(ServerConfig.ROOT_DIR, Env.Str("TELEGRAM_SESSION_FILE", "./private/tg_sessions/main.session"));

  static IsBotReady() {
    return Boolean(this.POST_ENABLED && this.BOT_TOKEN);
  }

  static IsTechReady() {
    return Boolean(this.TECH_ENABLED && this.BOT_TOKEN && this.TECH_CHAT_ID);
  }
}

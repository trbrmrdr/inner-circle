import path from "path";
import { Env } from "./Env";
import { ServerConfig } from "./ServerConfig";

export class GoogleConfig {
  static ENABLED = Env.Bool("GOOGLE_SHEETS_ENABLED", true);
  static CREDENTIALS_FILE = path.resolve(ServerConfig.ROOT_DIR, Env.Str("GOOGLE_CREDENTIALS_FILE", "./private/google-service-account.json"));
  static SPREADSHEET_ID = Env.Str("GOOGLE_SPREADSHEET_ID", "");
  static POSTS_SHEET = Env.Str("GOOGLE_POSTS_SHEET", "POSTS");
  static MEDIA_SHEET = Env.Str("GOOGLE_MEDIA_SHEET", "MEDIA");
  static LEADS_SHEET = Env.Str("GOOGLE_LEADS_SHEET", "LEADS");
  static LOGS_SHEET = Env.Str("GOOGLE_LOGS_SHEET", "LOGS");
  static SETTINGS_SHEET = Env.Str("GOOGLE_SETTINGS_SHEET", "SETTINGS");
  static SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

  static IsReady() {
    return Boolean(this.ENABLED && this.SPREADSHEET_ID && this.CREDENTIALS_FILE);
  }
}

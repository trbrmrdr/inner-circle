import path from "path";
import { Env } from "./Env";
import { ServerConfig } from "./ServerConfig";

export class GoogleConfig {
  static CREDENTIALS_FILE = path.resolve(ServerConfig.ROOT_DIR, Env.Str("GOOGLE_CREDENTIALS_FILE", "./private/google-service-account.json"));
  static SPREADSHEET_ID = Env.Str("GOOGLE_SPREADSHEET_ID", "");
  static POSTS_SHEET = Env.Str("GOOGLE_POSTS_SHEET", "posts");
  static LEADS_SHEET = Env.Str("GOOGLE_LEADS_SHEET", "leads");
  static LOGS_SHEET = Env.Str("GOOGLE_LOGS_SHEET", "logs");
  static SETTINGS_SHEET = Env.Str("GOOGLE_SETTINGS_SHEET", "settings");
  static SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

  static IsReady() {
    return Boolean(this.SPREADSHEET_ID && this.CREDENTIALS_FILE);
  }
}

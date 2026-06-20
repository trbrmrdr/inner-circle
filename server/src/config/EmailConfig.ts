import { Env } from "./Env";

export class EmailConfig {
  static SMTP_HOST = Env.Str("SMTP_HOST", "");
  static SMTP_PORT = Env.Num("SMTP_PORT", 587);
  static SMTP_SECURE = Env.Bool("SMTP_SECURE", false);
  static SMTP_USER = Env.Str("SMTP_USER", "");
  static SMTP_PASS = Env.Str("SMTP_PASS", "");
  static EMAIL_FROM = Env.Str("EMAIL_FROM", "");
  static EMAIL_TO = Env.Str("EMAIL_TO", "");

  static IsReady() {
    return Boolean(this.SMTP_HOST && this.EMAIL_FROM && this.EMAIL_TO);
  }
}

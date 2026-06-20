import { Env } from "./Env";

export class RecaptchaConfig {
  static ENABLED = Env.Bool("RECAPTCHA_ENABLED", false);
  static SITE_KEY = Env.Str("RECAPTCHA_SITE_KEY", "");
  static SECRET_KEY = Env.Str("RECAPTCHA_SECRET_KEY", "");
  static ALLOWED_HOSTS = Env.Str("RECAPTCHA_ALLOWED_HOSTS", "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  static VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

  static IsReady() {
    return Boolean(this.ENABLED && this.SECRET_KEY);
  }

  static IsAllowedHostname(hostname: string) {
    if (this.ALLOWED_HOSTS.length === 0) return true;
    const cleanHostname = hostname.trim().toLowerCase();
    return this.ALLOWED_HOSTS.includes(cleanHostname);
  }
}

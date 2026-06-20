import { Env } from "./Env";

export interface EmailProviderConfig {
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  authRequired: boolean;
}

export class EmailConfig {
  static ENABLED = Env.Bool("EMAIL_ENABLED", true);
  static EMAIL_FROM = Env.Str("EMAIL_FROM", "");
  static EMAIL_TO = Env.Str("EMAIL_TO", "");
  static EMAIL_SUBJECT_PREFIX = Env.Str("EMAIL_SUBJECT_PREFIX", "Заявка с сайта");

  static SMTP_GOOGLE_ENABLED = Env.Bool("SMTP_GOOGLE_ENABLED", Boolean(Env.Str("SMTP_GOOGLE_USER", "") || Env.Str("SMTP_GOOGLE_FROM", "")));
  static SMTP_GOOGLE_HOST = Env.Str("SMTP_GOOGLE_HOST", "smtp.gmail.com");
  static SMTP_GOOGLE_PORT = Env.Num("SMTP_GOOGLE_PORT", 465);
  static SMTP_GOOGLE_SECURE = Env.Bool("SMTP_GOOGLE_SECURE", true);
  static SMTP_GOOGLE_USER = Env.Str("SMTP_GOOGLE_USER", "");
  static SMTP_GOOGLE_PASS = Env.Str("SMTP_GOOGLE_PASS", "");
  static SMTP_GOOGLE_FROM = Env.Str("SMTP_GOOGLE_FROM", this.EMAIL_FROM || this.SMTP_GOOGLE_USER);

  static SMTP_YANDEX_ENABLED = Env.Bool("SMTP_YANDEX_ENABLED", Boolean(Env.Str("SMTP_YANDEX_USER", "") || Env.Str("SMTP_YANDEX_FROM", "")));
  static SMTP_YANDEX_HOST = Env.Str("SMTP_YANDEX_HOST", "smtp.yandex.ru");
  static SMTP_YANDEX_PORT = Env.Num("SMTP_YANDEX_PORT", 465);
  static SMTP_YANDEX_SECURE = Env.Bool("SMTP_YANDEX_SECURE", true);
  static SMTP_YANDEX_USER = Env.Str("SMTP_YANDEX_USER", "");
  static SMTP_YANDEX_PASS = Env.Str("SMTP_YANDEX_PASS", "");
  static SMTP_YANDEX_FROM = Env.Str("SMTP_YANDEX_FROM", this.EMAIL_FROM || this.SMTP_YANDEX_USER);

  static SMTP_HOST = Env.Str("SMTP_HOST", "");
  static SMTP_PORT = Env.Num("SMTP_PORT", 587);
  static SMTP_SECURE = Env.Bool("SMTP_SECURE", false);
  static SMTP_USER = Env.Str("SMTP_USER", "");
  static SMTP_PASS = Env.Str("SMTP_PASS", "");
  static SMTP_LEGACY_ENABLED = Env.Bool("SMTP_LEGACY_ENABLED", Boolean(this.SMTP_HOST));

  static IsReady() {
    return this.ENABLED && this.ReadyProviders().length > 0;
  }

  static Providers(): EmailProviderConfig[] {
    return [
      {
        name: "google",
        enabled: this.ENABLED && this.SMTP_GOOGLE_ENABLED,
        host: this.SMTP_GOOGLE_HOST,
        port: this.SMTP_GOOGLE_PORT,
        secure: this.SMTP_GOOGLE_SECURE,
        user: this.SMTP_GOOGLE_USER,
        pass: this.SMTP_GOOGLE_PASS,
        from: this.SMTP_GOOGLE_FROM,
        to: this.EMAIL_TO,
        authRequired: true,
      },
      {
        name: "yandex",
        enabled: this.ENABLED && this.SMTP_YANDEX_ENABLED,
        host: this.SMTP_YANDEX_HOST,
        port: this.SMTP_YANDEX_PORT,
        secure: this.SMTP_YANDEX_SECURE,
        user: this.SMTP_YANDEX_USER,
        pass: this.SMTP_YANDEX_PASS,
        from: this.SMTP_YANDEX_FROM,
        to: this.EMAIL_TO,
        authRequired: true,
      },
      {
        name: "legacy",
        enabled: this.ENABLED && this.SMTP_LEGACY_ENABLED,
        host: this.SMTP_HOST,
        port: this.SMTP_PORT,
        secure: this.SMTP_SECURE,
        user: this.SMTP_USER,
        pass: this.SMTP_PASS,
        from: this.EMAIL_FROM,
        to: this.EMAIL_TO,
        authRequired: false,
      },
    ];
  }

  static EnabledProviders() {
    return this.Providers().filter((provider) => provider.enabled);
  }

  static ReadyProviders() {
    return this.EnabledProviders().filter((provider) => this.IsProviderReady(provider));
  }

  static IsProviderReady(provider: EmailProviderConfig) {
    if (!provider.enabled) return false;
    if (!provider.host || !provider.port || !provider.from || !provider.to) return false;
    if (provider.authRequired && (!provider.user || !provider.pass)) return false;
    if (provider.user && !provider.pass) return false;
    return true;
  }
}

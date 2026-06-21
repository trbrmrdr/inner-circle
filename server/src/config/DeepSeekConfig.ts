import { Env } from "./Env";

export class DeepSeekConfig {
  static ENABLED = Env.Bool("DEEPSEEK_ENABLED", false);
  static API_URL = Env.Str("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions");
  static API_KEY = Env.Str("DEEPSEEK_API_KEY", "");
  static MODEL = Env.Str("DEEPSEEK_MODEL", "deepseek-v4-flash");
  static PROMPT_LANGUAGE = Env.Str("DEEPSEEK_PROMPT_LANGUAGE", "en").toLowerCase();

  static IsReady() {
    return Boolean(this.ENABLED && this.API_KEY);
  }
}

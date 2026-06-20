import { Env } from "./Env";

export class InstagramConfig {
  static ENABLED = Env.Bool("INSTAGRAM_ENABLED", false);
  static GRAPH_VERSION = Env.Str("INSTAGRAM_GRAPH_VERSION", "v22.0");
  static PAGE_ACCESS_TOKEN = Env.Str("INSTAGRAM_PAGE_ACCESS_TOKEN", "");
  static IG_USER_ID = Env.Str("INSTAGRAM_IG_USER_ID", "");
  static GRAPH_URL = "https://graph.facebook.com";

  static IsReady() {
    return Boolean(this.ENABLED && this.PAGE_ACCESS_TOKEN && this.IG_USER_ID);
  }
}

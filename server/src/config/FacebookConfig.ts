import { Env } from "./Env";

export class FacebookConfig {
  static ENABLED = Env.Bool("FACEBOOK_ENABLED", false);
  static GRAPH_VERSION = Env.Str("FACEBOOK_GRAPH_VERSION", "v22.0");
  static PAGE_ACCESS_TOKEN = Env.Str("FACEBOOK_PAGE_ACCESS_TOKEN", "");
  static PAGE_ID = Env.Str("FACEBOOK_PAGE_ID", "");
  static GRAPH_URL = "https://graph.facebook.com";

  static IsReady() {
    return Boolean(this.ENABLED && this.PAGE_ACCESS_TOKEN && this.PAGE_ID);
  }
}

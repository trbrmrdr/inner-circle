import { RecaptchaConfig } from "../config/RecaptchaConfig";
import { HttpHelper } from "./HttpHelper";

export interface RecaptchaVerifyResult {
  ok: boolean;
  skipped?: boolean;
  hostname?: string;
  challenge_ts?: string;
  errors?: string[];
  raw?: unknown;
  message?: string;
}

export class RecaptchaService {
  static async Verify(token: string, remoteIp = ""): Promise<RecaptchaVerifyResult> {
    if (!RecaptchaConfig.ENABLED) {
      return { ok: true, skipped: true, message: "reCAPTCHA is disabled" };
    }

    if (!RecaptchaConfig.SECRET_KEY) {
      return { ok: false, message: "reCAPTCHA secret is not configured" };
    }

    if (!token) {
      return { ok: false, message: "reCAPTCHA token is missing" };
    }

    const params = new URLSearchParams();
    params.set("secret", RecaptchaConfig.SECRET_KEY);
    params.set("response", token);
    if (remoteIp) params.set("remoteip", remoteIp);

    try {
      const data = await HttpHelper.Json<any>({
        method: "POST",
        url: RecaptchaConfig.VERIFY_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: params,
      });

      const hostname = String(data?.hostname || "");
      const errors = Array.isArray(data?.["error-codes"]) ? data["error-codes"].map(String) : [];
      if (!data?.success) {
        return { ok: false, hostname, errors, raw: data, message: errors.join(", ") || "reCAPTCHA rejected request" };
      }

      if (hostname && !RecaptchaConfig.IsAllowedHostname(hostname)) {
        return { ok: false, hostname, errors: ["hostname-not-allowed"], raw: data, message: `reCAPTCHA hostname is not allowed: ${hostname}` };
      }

      return {
        ok: true,
        hostname,
        challenge_ts: data?.challenge_ts,
        raw: data,
      };
    } catch (error) {
      return { ok: false, message: HttpHelper.ErrorMessage(error) };
    }
  }
}

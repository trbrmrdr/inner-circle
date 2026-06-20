import { Router } from "express";
import { ServerConfig } from "../config/ServerConfig";
import { LeadProcessor } from "../core/LeadProcessor";
import { RecaptchaService } from "../core/RecaptchaService";

export const LeadRoutes = Router();

LeadRoutes.post("/", async (req, res) => {
  if (ServerConfig.LEAD_ROUTE_TOKEN) {
    const token = String(req.headers["x-lead-token"] || req.query.token || "");
    if (token !== ServerConfig.LEAD_ROUTE_TOKEN) {
      res.status(401).json({ ok: false, message: "Invalid lead token" });
      return;
    }
  }

  const body = req.body || {};
  const captcha = await RecaptchaService.Verify(String(body.captchaToken || body["g-recaptcha-response"] || ""), req.ip);
  if (!captcha.ok) {
    res.status(400).json({
      ok: false,
      accepted: false,
      requiredOk: false,
      shouldFallback: false,
      message: captcha.message || "reCAPTCHA verification failed",
      captcha,
    });
    return;
  }

  const lead = LeadProcessor.Normalize({
    ...body,
    captchaAction: "inner-circle-lead",
    meta: {
      ...(body.meta || {}),
      recaptcha: {
        skipped: Boolean(captcha.skipped),
        hostname: captcha.hostname || "",
        challenge_ts: captcha.challenge_ts || "",
      },
    },
  });
  const validationError = LeadProcessor.Validate(lead);
  if (validationError) {
    res.status(400).json({ ok: false, message: validationError });
    return;
  }

  const result = await LeadProcessor.Handle(lead);
  res.json(result);
});

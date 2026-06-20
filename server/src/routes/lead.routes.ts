import { Router } from "express";
import { ServerConfig } from "../config/ServerConfig";
import { LeadProcessor } from "../core/LeadProcessor";

export const LeadRoutes = Router();

LeadRoutes.post("/", async (req, res) => {
  if (ServerConfig.LEAD_ROUTE_TOKEN) {
    const token = String(req.headers["x-lead-token"] || req.query.token || "");
    if (token !== ServerConfig.LEAD_ROUTE_TOKEN) {
      res.status(401).json({ ok: false, message: "Invalid lead token" });
      return;
    }
  }

  const lead = LeadProcessor.Normalize(req.body || {});
  const validationError = LeadProcessor.Validate(lead);
  if (validationError) {
    res.status(400).json({ ok: false, message: validationError });
    return;
  }

  const result = await LeadProcessor.Handle(lead);
  res.json(result);
});

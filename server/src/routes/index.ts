import { Router } from "express";
import { VkConfig } from "../config/VkConfig";
import { AutoPostRoutes } from "./autopost.routes";
import { LeadRoutes } from "./lead.routes";
import { VkRoutes } from "./vk.routes";

export const ApiRoutes = Router();

ApiRoutes.use("/lead", LeadRoutes);
ApiRoutes.use("/autopost", AutoPostRoutes);

if (VkConfig.ENABLED) {
  ApiRoutes.use("/vk", VkRoutes);
}

import { Router } from "express";
import { AutoPostRoutes } from "./autopost.routes";
import { LeadRoutes } from "./lead.routes";

export const ApiRoutes = Router();

ApiRoutes.use("/lead", LeadRoutes);
ApiRoutes.use("/autopost", AutoPostRoutes);

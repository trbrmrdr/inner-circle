import dotenv from "dotenv";

dotenv.config();

export class Env {
  static Str(name: string, fallback = "") {
    const value = process.env[name];
    return value === undefined || value === null ? fallback : value;
  }

  static Num(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? value : fallback;
  }

  static Bool(name: string, fallback = false) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
  }
}

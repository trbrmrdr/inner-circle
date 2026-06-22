import { ServerConfig } from "../config/ServerConfig";

export class TimeHelper {
  static Local(value: Date | string | number = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return `${new Intl.DateTimeFormat("ru-RU", {
      timeZone: ServerConfig.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date)} ${ServerConfig.TIMEZONE}`;
  }

  static NowLocal() {
    return this.Local(new Date());
  }
}

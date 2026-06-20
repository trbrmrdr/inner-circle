import { LeadRequest, PublishResult } from "../types/autopost";
import { EmailPublisher } from "../publishers/EmailPublisher";
import { TelegramPublisher } from "../publishers/TelegramPublisher";
import { GoogleSheetsService } from "../sheets/GoogleSheetsService";
import { AiTextHelper } from "./AiTextHelper";
import { HttpHelper } from "./HttpHelper";

export class LeadProcessor {
  static async Handle(lead: LeadRequest) {
    const cleanLead = this.Normalize(lead);
    const results: PublishResult[] = [];

    results.push(await this.Safe("sheets", () => GoogleSheetsService.AppendLead(cleanLead)));
    results.push(await this.Safe("email", () => EmailPublisher.SendLead(cleanLead)));
    results.push(await this.Safe("telegram-tech", () => TelegramPublisher.SendTechMessage(this.TelegramText(cleanLead))));

    await GoogleSheetsService.AppendLog("lead", "New lead processed", { lead: cleanLead, results }).catch(() => undefined);

    return {
      ok: results.some((result) => result.ok || result.disabled),
      results,
    };
  }

  static Normalize(lead: LeadRequest): LeadRequest {
    return {
      name: this.Trim(lead.name),
      phone: this.Trim(lead.phone),
      email: this.Trim(lead.email),
      telegram: this.Trim(lead.telegram),
      message: this.Trim(lead.message),
      page: this.Trim(lead.page),
      source: this.Trim(lead.source || "site-form"),
      meta: lead.meta || {},
    };
  }

  static Validate(lead: LeadRequest) {
    const hasContact = Boolean(lead.phone || lead.email || lead.telegram);
    if (!hasContact) return "Нужен хотя бы один контакт: phone, email или telegram";
    return "";
  }

  static TelegramText(lead: LeadRequest) {
    return [
      "<b>Новая заявка с сайта</b>",
      `Имя: ${AiTextHelper.EscapeHtml(lead.name || "-")}`,
      `Телефон: ${AiTextHelper.EscapeHtml(lead.phone || "-")}`,
      `Email: ${AiTextHelper.EscapeHtml(lead.email || "-")}`,
      `Telegram: ${AiTextHelper.EscapeHtml(lead.telegram || "-")}`,
      `Страница: ${AiTextHelper.EscapeHtml(lead.page || "-")}`,
      "",
      AiTextHelper.EscapeHtml(lead.message || "-"),
    ].join("\n");
  }

  static Trim(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  static async Safe(platform: PublishResult["platform"], fn: () => Promise<PublishResult>): Promise<PublishResult> {
    try {
      return await fn();
    } catch (error) {
      return {
        ok: false,
        platform,
        message: HttpHelper.ErrorMessage(error),
      };
    }
  }
}

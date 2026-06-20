import { LeadRequest, PublishResult } from "../types/autopost";
import { EmailConfig } from "../config/EmailConfig";
import { GoogleConfig } from "../config/GoogleConfig";
import { TelegramConfig } from "../config/TelegramConfig";
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
    results.push(...await this.SafeMany("email", () => EmailPublisher.SendLead(cleanLead)));
    results.push(await this.Safe("telegram-tech", () => TelegramPublisher.SendTechMessage(this.TelegramText(cleanLead))));

    await GoogleSheetsService.AppendLog("lead", "New lead processed", { lead: cleanLead, results }).catch(() => undefined);

    const required = this.RequiredStatus(results);
    return {
      ok: required.requiredOk,
      accepted: results.some((result) => result.ok),
      requiredOk: required.requiredOk,
      shouldFallback: !required.requiredOk,
      message: required.requiredOk ? "Lead processed" : "Lead accepted partially or failed on a required channel",
      channels: required.channels,
      results,
    };
  }

  static Normalize(lead: LeadRequest): LeadRequest {
    return {
      name: this.Trim(lead.name),
      phone: this.Trim(lead.phone),
      email: this.Trim(lead.email),
      telegram: this.Trim(lead.telegram),
      lead_uid: this.Trim(lead.lead_uid || lead.leadUid),
      date: this.Trim(lead.date),
      guests: this.Trim(lead.guests),
      scenario: this.Trim(lead.scenario),
      consent: this.NormalizeConsent(lead.consent),
      captchaScore: this.Trim(lead.captchaScore),
      captchaAction: this.Trim(lead.captchaAction),
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
      `Дата: ${AiTextHelper.EscapeHtml(lead.date || "-")}`,
      `Гостей: ${AiTextHelper.EscapeHtml(lead.guests || "-")}`,
      `Сценарий: ${AiTextHelper.EscapeHtml(lead.scenario || "-")}`,
      `Страница: ${AiTextHelper.EscapeHtml(lead.page || "-")}`,
      "",
      AiTextHelper.EscapeHtml(lead.message || "-"),
    ].join("\n");
  }

  static Trim(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  static NormalizeConsent(value: unknown) {
    if (value === true) return "true";
    if (value === false) return "false";
    return this.Trim(value);
  }

  static RequiredStatus(results: PublishResult[]) {
    const emailProviders = EmailConfig.EnabledProviders();
    const channels = {
      sheets: {
        required: GoogleConfig.ENABLED,
        ok: !GoogleConfig.ENABLED || results.some((result) => result.platform === "sheets" && result.ok),
      },
      email: {
        required: EmailConfig.ENABLED,
        ok: !EmailConfig.ENABLED || (emailProviders.length > 0 && emailProviders.every((provider) =>
          results.some((result) => result.platform === `email:${provider.name}` && result.ok),
        )),
      },
      telegramTech: {
        required: TelegramConfig.ENABLED && TelegramConfig.TECH_ENABLED,
        ok: !(TelegramConfig.ENABLED && TelegramConfig.TECH_ENABLED) || results.some((result) => result.platform === "telegram-tech" && result.ok),
      },
    };

    return {
      requiredOk: Object.values(channels).every((channel) => !channel.required || channel.ok),
      channels,
    };
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

  static async SafeMany(platform: PublishResult["platform"], fn: () => Promise<PublishResult[]>): Promise<PublishResult[]> {
    try {
      return await fn();
    } catch (error) {
      return [{
        ok: false,
        platform,
        message: HttpHelper.ErrorMessage(error),
      }];
    }
  }
}

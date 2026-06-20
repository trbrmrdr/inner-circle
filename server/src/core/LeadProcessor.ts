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
    const [sheetsResult, emailResults, telegramTechResult] = await Promise.all([
      this.Safe("sheets", () => GoogleSheetsService.AppendLead(cleanLead)),
      this.SafeMany("email", () => EmailPublisher.SendLead(cleanLead)),
      this.Safe("telegram-tech", () => TelegramPublisher.SendTechMessage(this.TelegramText(cleanLead))),
    ]);
    const results: PublishResult[] = [sheetsResult, ...emailResults, telegramTechResult];

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
      telegram: this.NormalizeTelegram(lead.telegram),
      date: this.Trim(lead.date),
      guests: this.Trim(lead.guests),
      scenario: this.Trim(lead.scenario),
      consent: this.NormalizeConsent(lead.consent),
      captchaScore: this.Trim(lead.captchaScore),
      captchaAction: this.Trim(lead.captchaAction),
      meta: lead.meta || {},
    };
  }

  static Validate(lead: LeadRequest) {
    const hasContact = Boolean(lead.phone || lead.email || lead.telegram);
    if (!lead.name) return "Укажите имя";
    if (!hasContact) return "Укажите телефон, Telegram или почту, чтобы мы могли связаться";
    if (lead.telegram && !this.IsTelegramValid(lead.telegram)) return "Некорректный Telegram username";
    if (!lead.date || !this.IsDateValid(lead.date)) return "Укажите реальную желаемую дату заезда";
    if (this.IsDatePast(lead.date)) return "Дата заезда не может быть в прошлом";
    if (!lead.guests || Number(lead.guests) < 1) return "Укажите количество гостей";
    if (!lead.scenario) return "Опишите сценарий заезда";
    if (lead.consent !== "true") return "Подтвердите согласие на обратную связь по заявке";
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

  static NormalizeTelegram(value: unknown) {
    const raw = this.Trim(value);
    if (!raw) return "";

    const withoutProtocol = raw.replace(/^https?:\/\//i, "");
    const withoutHost = withoutProtocol.replace(/^(t\.me|telegram\.me)\//i, "");
    const withoutAt = withoutHost.replace(/^@/, "");
    const username = withoutAt.split(/[/?#]/)[0].trim();
    return username ? `@${username}` : "";
  }

  static IsTelegramValid(value: string) {
    const username = value.replace(/^@/, "");
    return /^[A-Za-z0-9_]{5,32}$/.test(username);
  }

  static IsDateValid(value: string) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }

  static IsDatePast(value: string) {
    return value < this.TodayDateValue();
  }

  static TodayDateValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
        ok: !EmailConfig.ENABLED || (emailProviders.length > 0 && emailProviders.some((provider) =>
          results.some((result) => result.platform === `email:${provider.name}` && result.ok),
        )),
      },
      telegramTech: {
        required: TelegramConfig.TECH_ENABLED,
        ok: !TelegramConfig.TECH_ENABLED || results.some((result) => result.platform === "telegram-tech" && result.ok),
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

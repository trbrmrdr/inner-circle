import nodemailer, { Transporter } from "nodemailer";
import { EmailConfig, EmailProviderConfig } from "../config/EmailConfig";
import { LeadRequest, PublishResult } from "../types/autopost";
import { HttpHelper } from "../core/HttpHelper";

export class EmailPublisher {
  static Transports = new Map<string, Transporter>();

  static async SendLead(lead: LeadRequest): Promise<PublishResult[]> {
    const subject = `${EmailConfig.EMAIL_SUBJECT_PREFIX}${lead.name ? `: ${lead.name}` : ""}`;
    return this.SendText(subject, this.LeadToText(lead));
  }

  static async SendText(subject: string, text: string, providerName = "", to = EmailConfig.EMAIL_TO): Promise<PublishResult[]> {
    if (!EmailConfig.ENABLED) {
      return [{ ok: false, disabled: true, platform: "email", message: "Email is disabled" }];
    }

    const providers = EmailConfig.EnabledProviders().filter((provider) => !providerName || provider.name === providerName);
    if (providers.length === 0) {
      return [{ ok: false, disabled: true, platform: "email", message: providerName ? `Email provider is not enabled: ${providerName}` : "No email providers enabled" }];
    }

    const results: PublishResult[] = [];
    for (const provider of providers) {
      results.push(await this.SendTextViaProvider(provider, subject, text, to));
    }

    return results;
  }

  static async SendTextViaProvider(provider: EmailProviderConfig, subject: string, text: string, to = provider.to): Promise<PublishResult> {
    const platform = this.Platform(provider);
    if (!EmailConfig.IsProviderReady(provider)) {
      return { ok: false, disabled: true, platform, message: `Email provider is not configured: ${provider.name}` };
    }

    try {
      const transport = this.GetTransport(provider);
      const result = await transport.sendMail({
        from: provider.from,
        to,
        subject,
        text,
      });

      return {
        ok: true,
        platform,
        id: result.messageId,
        raw: result,
      };
    } catch (error) {
      return {
        ok: false,
        platform,
        message: HttpHelper.ErrorMessage(error),
      };
    }
  }

  static GetTransport(provider: EmailProviderConfig) {
    const cached = this.Transports.get(provider.name);
    if (cached) return cached;

    const transport = nodemailer.createTransport({
      host: provider.host,
      port: provider.port,
      secure: provider.secure,
      auth: provider.user
        ? {
            user: provider.user,
            pass: provider.pass,
          }
        : undefined,
    });

    this.Transports.set(provider.name, transport);
    return transport;
  }

  static LeadToText(lead: LeadRequest) {
    return [
      `Имя: ${lead.name || "-"}`,
      `Телефон: ${lead.phone || "-"}`,
      `Email: ${lead.email || "-"}`,
      `Telegram: ${lead.telegram || "-"}`,
      `Дата: ${lead.date || "-"}`,
      `Гостей: ${lead.guests || "-"}`,
      `Сценарий: ${lead.scenario || "-"}`,
      `Согласие: ${lead.consent || "-"}`,
      `Страница: ${lead.page || "-"}`,
      `Источник: ${lead.source || "-"}`,
      "",
      "Сообщение:",
      lead.message || "-",
      "",
      `Meta: ${JSON.stringify(lead.meta || {}, null, 2)}`,
    ].join("\n");
  }

  static Platform(provider: EmailProviderConfig): PublishResult["platform"] {
    return `email:${provider.name}`;
  }
}

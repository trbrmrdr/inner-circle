import nodemailer, { Transporter } from "nodemailer";
import { EmailConfig } from "../config/EmailConfig";
import { LeadRequest, PublishResult } from "../types/autopost";

export class EmailPublisher {
  static Transport: Transporter | null = null;

  static async SendLead(lead: LeadRequest): Promise<PublishResult> {
    if (!EmailConfig.IsReady()) {
      return { ok: false, disabled: true, platform: "email", message: "SMTP is not configured" };
    }

    const transport = this.GetTransport();
    const subject = `Заявка с сайта${lead.name ? `: ${lead.name}` : ""}`;
    const text = this.LeadToText(lead);
    const result = await transport.sendMail({
      from: EmailConfig.EMAIL_FROM,
      to: EmailConfig.EMAIL_TO,
      subject,
      text,
    });

    return {
      ok: true,
      platform: "email",
      id: result.messageId,
      raw: result,
    };
  }

  static GetTransport() {
    if (this.Transport) return this.Transport;

    this.Transport = nodemailer.createTransport({
      host: EmailConfig.SMTP_HOST,
      port: EmailConfig.SMTP_PORT,
      secure: EmailConfig.SMTP_SECURE,
      auth: EmailConfig.SMTP_USER
        ? {
            user: EmailConfig.SMTP_USER,
            pass: EmailConfig.SMTP_PASS,
          }
        : undefined,
    });

    return this.Transport;
  }

  static LeadToText(lead: LeadRequest) {
    return [
      `Имя: ${lead.name || "-"}`,
      `Телефон: ${lead.phone || "-"}`,
      `Email: ${lead.email || "-"}`,
      `Telegram: ${lead.telegram || "-"}`,
      `Страница: ${lead.page || "-"}`,
      `Источник: ${lead.source || "-"}`,
      "",
      "Сообщение:",
      lead.message || "-",
      "",
      `Meta: ${JSON.stringify(lead.meta || {}, null, 2)}`,
    ].join("\n");
  }
}

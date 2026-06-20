import { EmailConfig } from "../src/config/EmailConfig";
import { EmailPublisher } from "../src/publishers/EmailPublisher";

class EmailTestTool {
  static async Run() {
    if (process.argv.includes("--help")) {
      this.PrintHelp();
      return;
    }

    const provider = this.ArgValue("--provider");
    const to = this.ArgValue("--to") || EmailConfig.EMAIL_TO;
    const subject = this.ArgValue("--subject") || "Inner Circle email test";
    const text = this.ArgValue("--text") || [
      "Тестовое письмо от Inner Circle server.",
      `Time: ${new Date().toISOString()}`,
    ].join("\n");

    const results = await EmailPublisher.SendText(subject, text, provider, to);
    console.log(JSON.stringify({
      ok: results.length > 0 && results.every((result) => result.ok),
      provider: provider || "all",
      to: this.MaskRecipients(to),
      results: results.map((result) => ({
        ok: result.ok,
        disabled: result.disabled,
        platform: result.platform,
        id: result.id,
        message: result.message,
      })),
    }, null, 2));
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static MaskRecipients(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((email) => {
        const [name, domain] = email.split("@");
        if (!domain) return "***";
        return `${name.slice(0, 2)}***@${domain}`;
      })
      .join(", ");
  }

  static PrintHelp() {
    console.log([
      "Использование:",
      "  npm run email:test",
      "  npm run email:test -- --provider google",
      "  npm run email:test -- --provider yandex --to target@example.com",
      "",
      "Опции:",
      "  --provider google|yandex|legacy",
      "  --to email1@example.com,email2@example.com",
      "  --subject \"тема\"",
      "  --text \"сообщение\"",
    ].join("\n"));
  }
}

EmailTestTool.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

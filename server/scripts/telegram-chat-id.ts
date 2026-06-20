import axios from "axios";
import { Env } from "../src/config/Env";

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface ChatHit {
  updateId: number;
  source: string;
  chat: TelegramChat;
  text?: string;
}

class TelegramChatIdTool {
  static Command = process.argv[2] || "updates";
  static Token = this.ResolveToken();

  static async Run() {
    if (!this.Token) {
      throw new Error("Telegram bot token is required. Set TELEGRAM_BOT_TOKEN or pass --token-env <ENV_NAME>.");
    }

    if (this.Command === "updates") {
      await this.ShowUpdates();
      return;
    }

    if (this.Command === "get-chat") {
      await this.GetChat();
      return;
    }

    if (this.Command === "send-test") {
      await this.SendTest();
      return;
    }

    this.PrintHelp();
  }

  static ResolveToken() {
    const token = this.ArgValue("--token");
    if (token) return token;

    const tokenEnv = this.ArgValue("--token-env") || "TELEGRAM_BOT_TOKEN";
    return Env.Str(tokenEnv, "");
  }

  static async ShowUpdates() {
    const data = await this.Call("getUpdates", {
      limit: 100,
      allowed_updates: JSON.stringify(["message", "channel_post", "my_chat_member"]),
    });

    const hits = this.ExtractChats(data.result || []);
    const unique = new Map<number, ChatHit>();
    hits.forEach((hit) => {
      if (!unique.has(hit.chat.id)) unique.set(hit.chat.id, hit);
    });

    console.log(JSON.stringify({
      ok: true,
      count: unique.size,
      chats: Array.from(unique.values()).map((hit) => ({
        chat_id: hit.chat.id,
        type: hit.chat.type,
        title: hit.chat.title || [hit.chat.first_name, hit.chat.last_name].filter(Boolean).join(" "),
        username: hit.chat.username ? `@${hit.chat.username}` : "",
        source: hit.source,
        last_text: hit.text || "",
      })),
      nextSteps: [
        "For a group: add the bot to the group and send /chatid or /start in that group, then rerun this command.",
        "For a channel: add the bot as admin and publish one test post, or use get-chat with a public @username.",
      ],
    }, null, 2));
  }

  static async GetChat() {
    const chatId = this.ArgValue("--chat");
    if (!chatId) throw new Error("Pass --chat <chat_id_or_@username>");

    const data = await this.Call("getChat", { chat_id: chatId });
    const chat = data.result;

    console.log(JSON.stringify({
      ok: true,
      chat_id: chat.id,
      type: chat.type,
      title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" "),
      username: chat.username ? `@${chat.username}` : "",
    }, null, 2));
  }

  static async SendTest() {
    const chatId = this.ArgValue("--chat");
    if (!chatId) throw new Error("Pass --chat <chat_id>");

    const text = this.ArgValue("--text") || "Inner Circle server test message";
    const data = await this.Call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    console.log(JSON.stringify({
      ok: Boolean(data.ok),
      chat_id: chatId,
      message_id: data.result?.message_id,
    }, null, 2));
  }

  static ExtractChats(updates: any[]) {
    const hits: ChatHit[] = [];

    for (const update of updates) {
      this.PushChat(hits, update, "message", update.message);
      this.PushChat(hits, update, "channel_post", update.channel_post);
      this.PushChat(hits, update, "my_chat_member", update.my_chat_member);
    }

    return hits;
  }

  static PushChat(hits: ChatHit[], update: any, source: string, item: any) {
    if (!item?.chat) return;

    hits.push({
      updateId: update.update_id,
      source,
      chat: item.chat,
      text: item.text || item.caption || "",
    });
  }

  static async Call(method: string, params: Record<string, string | number>) {
    const response = await axios.get(`https://api.telegram.org/bot${this.Token}/${method}`, {
      params,
      timeout: 20_000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (!response.data?.ok) {
      throw new Error(JSON.stringify(response.data));
    }

    return response.data;
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static PrintHelp() {
    console.log([
      "Usage:",
      "  npm run telegram:updates",
      "  npm run telegram:chat -- --chat @public_channel_or_group",
      "  npm run telegram:test -- --chat <chat_id> --text \"test\"",
      "",
      "Options:",
      "  --token-env TELEGRAM_BOT_TOKEN",
      "  --token <bot-token>",
    ].join("\n"));
  }
}

TelegramChatIdTool.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

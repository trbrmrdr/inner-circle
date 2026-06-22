import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { AiTextHelper } from "../src/core/AiTextHelper";
import { MediaPipeline } from "../src/media/MediaPipeline";
import { TelegramPublisher } from "../src/publishers/TelegramPublisher";
import { GoogleSheetsService } from "../src/sheets/GoogleSheetsService";
import { PostTask } from "../src/types/autopost";

class TelegramAutopostTestCli {
  static async Run() {
    const postIdArg = this.ArgValue("--post-id");
    const yes = process.argv.includes("--yes");
    const prepareOnly = process.argv.includes("--prepare-only");
    const limit = this.ArgNumber("--limit", 50);

    console.log("Loading post candidates from Google Sheets...");
    const posts = await GoogleSheetsService.ReadPostCandidates();
    if (posts.length === 0) {
      throw new Error("No post candidates found in Google Sheets");
    }

    const visiblePosts = posts.slice(0, limit);
    this.PrintPosts(visiblePosts, posts.length);

    const rl = readline.createInterface({ input, output });
    try {
      const task = postIdArg
        ? await this.SelectByValue(posts, postIdArg)
        : await this.AskPost(rl, visiblePosts, posts);

      if (!task) throw new Error("Post was not selected");
      this.PrintSelected(task);

      if (!yes) {
        const answer = await rl.question("Download media and send this post to Telegram tech group? y/N: ");
        if (!["y", "yes", "д", "да"].includes(answer.trim().toLowerCase())) {
          console.log("Canceled. Google Sheets was not changed.");
          return;
        }
      }

      console.log("Preparing Telegram text...");
      const text = (await AiTextHelper.PreparePostText(task)).telegram;
      const telegramTextMode = task.media_items.length > 0 && task.post_type !== "text" ? "media caption" : "text message";
      console.log(`Telegram text: ${text.length} chars | ${telegramTextMode}`);
      console.log(this.OneLine(AiTextHelper.StripHtml(text)).slice(0, 500));
      console.log("");

      console.log("Downloading and preparing media...");
      console.log(`Media IDs: ${task.media_items.map((item) => item.media_id).join(", ") || "-"}`);
      const prepared = await MediaPipeline.PrepareTelegramPost(task, text);

      console.log(`Source dir: ${prepared.sourceDir}`);
      console.log(`Telegram dir: ${prepared.platformDir}`);
      console.log(`Manifest: ${prepared.manifestPath}`);
      this.PrintWarnings(prepared.warnings || []);
      this.PrintPreparedMedia(prepared.media);

      if (prepareOnly) {
        console.log(JSON.stringify({
          ok: true,
          prepareOnly: true,
          post_id: task.post_uid,
          media: prepared.media.length,
          warnings: prepared.warnings || [],
          manifestPath: prepared.manifestPath,
          sheetsChanged: false,
          telegramSent: false,
        }, null, 2));
        return;
      }

      console.log("Sending to Telegram tech group...");
      const result = await TelegramPublisher.PublishPreparedPostToTech(prepared);

      console.log(JSON.stringify({
        ok: result.ok,
        platform: result.platform,
        id: result.id,
        message: result.message,
        sheetsChanged: false,
      }, null, 2));
    } finally {
      rl.close();
    }
  }

  static PrintPosts(posts: PostTask[], total: number) {
    console.log("");
    console.log(`Posts loaded: ${total}. Showing: ${posts.length}.`);
    console.log("");
    posts.forEach((post, index) => {
      const preview = this.OneLine(post.text).slice(0, 90);
      const date = [post.raw.date, post.raw.time].filter(Boolean).join(" ");
      const platforms = post.raw.platforms || post.platforms.join(",") || "-";
      console.log(`${String(index + 1).padStart(2, " ")}. ${post.post_uid} | ${post.status || "-"} | ${date || "-"} | ${platforms} | ${preview}`);
    });
    console.log("");
  }

  static async AskPost(rl: readline.Interface, visiblePosts: PostTask[], allPosts: PostTask[]) {
    const value = (await rl.question("Enter post number or post_id: ")).trim();
    if (!value) return null;

    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= visiblePosts.length) {
      return visiblePosts[number - 1];
    }

    return this.SelectByValue(allPosts, value);
  }

  static async SelectByValue(posts: PostTask[], value: string) {
    const clean = value.trim();
    if (!clean) return null;

    const direct = posts.find((post) => post.post_uid.toLowerCase() === clean.toLowerCase());
    if (direct) return direct;

    return GoogleSheetsService.FindPostById(clean);
  }

  static PrintSelected(task: PostTask) {
    console.log("");
    console.log("Selected post:");
    console.log(`post_id: ${task.post_uid}`);
    console.log(`row: ${task.rowNumber}`);
    console.log(`status: ${task.status || "-"}`);
    console.log(`date/time: ${[task.raw.date, task.raw.time].filter(Boolean).join(" ") || "-"}`);
    console.log(`platforms: ${task.raw.platforms || task.platforms.join(",") || "-"}`);
    console.log(`post_type: ${task.post_type}`);
    console.log(`media: ${task.media_items.length}`);
    console.log("");
    console.log(this.OneLine(task.text).slice(0, 500));
    console.log("");

    if (!task.platforms.includes("telegram")) {
      console.log("Note: this post does not include Telegram in platforms, but test mode can still send it to tech group.");
      console.log("");
    }
  }

  static PrintPreparedMedia(
    media: {
      media_id: string;
      filename: string;
      asset_type: string;
      size: number;
      converted: boolean;
      width?: number;
      height?: number;
      notes?: string[];
    }[],
  ) {
    if (media.length === 0) {
      console.log("Prepared media: none");
      return;
    }

    console.log("Prepared media:");
    media.forEach((item) => {
      const sizeMb = (item.size / 1024 / 1024).toFixed(2);
      const dimensions = item.width && item.height ? ` | ${item.width}x${item.height}` : "";
      const converted = item.converted ? " | converted" : "";
      const notes = item.notes?.length ? ` | ${item.notes.join(",")}` : "";
      console.log(`- ${item.media_id}: ${item.asset_type} | ${item.filename} | ${sizeMb} MB${dimensions}${converted}${notes}`);
    });
  }

  static PrintWarnings(warnings: string[]) {
    if (warnings.length === 0) return;
    console.log("Warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static ArgNumber(name: string, fallback: number) {
    const raw = this.ArgValue(name);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  static OneLine(value: string) {
    return value.replace(/\s+/g, " ").trim();
  }
}

TelegramAutopostTestCli.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

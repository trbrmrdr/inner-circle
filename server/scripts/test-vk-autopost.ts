import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { AiTextHelper } from "../src/core/AiTextHelper";
import { MediaPipeline } from "../src/media/MediaPipeline";
import { VkConfig } from "../src/config/VkConfig";
import { VkPublisher } from "../src/publishers/VkPublisher";
import { GoogleSheetsService } from "../src/sheets/GoogleSheetsService";
import { PostTask } from "../src/types/autopost";

class VkAutopostTestCli {
  static async Run() {
    if (this.HasFlag("--help") || this.HasFlag("-h")) {
      this.PrintHelp();
      return;
    }

    const postIdArg = this.ArgValue("--post-id");
    const yes = this.HasFlag("--yes");
    const prepareOnly = this.HasFlag("--prepare-only");
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
        const answer = await rl.question("Download media and send this post to VK group? y/N: ");
        if (!["y", "yes", "д", "да"].includes(answer.trim().toLowerCase())) {
          console.log("Canceled. Google Sheets was not changed.");
          return;
        }
      }

      if (!prepareOnly) {
        if (!VkConfig.IsConfigured()) {
          throw new Error("VK is not configured. Fill VK_ACCESS_TOKEN and numeric VK_GROUP_ID. VK_ENABLED can stay false for this manual test.");
        }

        console.log("Checking VK token/upload access...");
        await VkPublisher.AssertManualPostAccess(task);
      }

      console.log("Preparing VK text...");
      const text = (await AiTextHelper.PreparePostText(task)).vk;
      console.log(`VK text: ${text.length} chars | wall message`);
      console.log(this.OneLine(text).slice(0, 500));
      console.log("");

      console.log("Downloading and preparing media...");
      console.log(`Media IDs: ${task.media_items.map((item) => item.media_id).join(", ") || "-"}`);
      const prepared = await MediaPipeline.PrepareVkPost(task, text);

      console.log(`Source dir: ${prepared.sourceDir}`);
      console.log(`VK dir: ${prepared.platformDir}`);
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
          vkSent: false,
        }, null, 2));
        return;
      }

      console.log(`Sending to VK group ${VkConfig.ResolveGroupId()}...`);
      const result = await VkPublisher.PublishPreparedPostToGroup(prepared);
      if (result.ok) {
        this.CleanupPrepared(prepared);
      }

      console.log(JSON.stringify({
        ok: result.ok,
        platform: result.platform,
        id: result.id,
        url: result.url,
        message: result.message,
        tempCleaned: result.ok,
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

    if (!task.platforms.includes("vk")) {
      console.log("Note: this post does not include VK in platforms, but test mode can still send it to VK group.");
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

  static CleanupPrepared(prepared: { rootDir: string }) {
    try {
      MediaPipeline.Cleanup(prepared);
    } catch (error) {
      console.log(`Temp cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static HasFlag(name: string) {
    return process.argv.includes(name);
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

  static PrintHelp() {
    console.log([
      "Usage:",
      "  npm run autopost:vk:test",
      "  npm run autopost:vk:test -- --post-id <post_id> --prepare-only --yes",
      "  npm run autopost:vk:test -- --post-id <post_id> --yes",
      "",
      "Options:",
      "  --post-id <post_id>  Select a post without interactive prompt.",
      "  --prepare-only       Download and prepare media, but do not publish.",
      "  --yes                Skip confirmation prompt.",
      "  --limit <number>     Number of post candidates to show.",
      "",
      "VK_ENABLED can stay false. This manual test requires only VK_ACCESS_TOKEN and numeric VK_GROUP_ID.",
      "Google Sheets is not changed by this test command.",
    ].join("\n"));
  }
}

VkAutopostTestCli.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

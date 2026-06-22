import axios from "axios";
import { VkConfig } from "../src/config/VkConfig";
import { HttpHelper } from "../src/core/HttpHelper";

class VkGroupIdCli {
  static async Run() {
    const raw = this.ArgValue("--group") || this.ArgValue("--url") || process.argv[2] || "";
    const value = raw.trim();
    if (!value || ["--help", "-h"].includes(value)) {
      this.PrintHelp();
      return;
    }

    const directId = this.DirectGroupId(value);
    if (directId) {
      this.PrintResult(value, directId, "parsed");
      return;
    }

    if (!VkConfig.ACCESS_TOKEN) {
      throw new Error("VK_ACCESS_TOKEN is required to resolve a short group name. Or pass a wall URL like https://vk.com/wall-123_456.");
    }

    const screenName = this.ScreenName(value);
    const resolved = await this.ResolveScreenName(screenName);
    if (resolved) {
      this.PrintResult(screenName, resolved.groupId, "vk-api", resolved.name);
      return;
    }

    const data = await this.Method("groups.getById", { group_id: screenName });
    const group = data?.response?.groups?.[0] || data?.response?.[0] || data?.response;
    const id = Number(group?.id || 0);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error(`VK did not return group id for "${screenName}": ${JSON.stringify(data).slice(0, 1000)}`);
    }

    this.PrintResult(screenName, id, "vk-api", group?.name);
  }

  static async ResolveScreenName(screenName: string) {
    const data = await this.Method("utils.resolveScreenName", { screen_name: screenName });
    const response = data?.response;
    const objectId = Number(response?.object_id || 0);
    const type = String(response?.type || "").toLowerCase();
    if (!Number.isFinite(objectId) || objectId <= 0) return null;
    if (!["group", "page", "public"].includes(type)) {
      throw new Error(`VK screen name "${screenName}" resolved to "${type}", not to a group/page.`);
    }

    return {
      groupId: objectId,
      name: response?.screen_name || "",
    };
  }

  static async Method(method: string, params: Record<string, string>) {
    const search = new URLSearchParams();
    search.set("access_token", VkConfig.ACCESS_TOKEN);
    search.set("v", VkConfig.API_VERSION);
    Object.entries(params).forEach(([key, value]) => search.set(key, value));

    const response = await axios.post(`${VkConfig.API_URL}/${method}`, search, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 30_000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (response.status >= 400 || response.data?.error) {
      throw new Error(HttpHelper.ErrorText(response.data, response.status));
    }

    return response.data;
  }

  static DirectGroupId(value: string) {
    const clean = value.trim();
    const wall = clean.match(/wall-(\d+)_\d+/i);
    if (wall) return Number(wall[1]);

    const club = clean.match(/(?:club|public|event)(\d+)/i);
    if (club) return Number(club[1]);

    if (/^\d+$/.test(clean)) return Number(clean);
    return 0;
  }

  static ScreenName(value: string) {
    const withoutQuery = value.split(/[?#]/)[0] || value;
    const trimmed = withoutQuery.replace(/\/+$/, "");
    const lastPart = trimmed.split("/").filter(Boolean).pop() || trimmed;
    return lastPart.replace(/^@/, "").trim();
  }

  static PrintResult(inputValue: string, groupId: number, source: string, name = "") {
    console.log(JSON.stringify({
      ok: true,
      source,
      input: inputValue,
      name,
      VK_GROUP_ID: String(groupId),
      env: `VK_GROUP_ID=${groupId}`,
    }, null, 2));
  }

  static ArgValue(name: string) {
    const index = process.argv.indexOf(name);
    if (index === -1) return "";
    return process.argv[index + 1] || "";
  }

  static PrintHelp() {
    console.log([
      "Usage:",
      "  npm run vk:group-id -- --group <short_name_or_url>",
      "  npm run vk:group-id -- --group https://vk.com/wall-123456_789",
      "",
      "Notes:",
      "  - wall/club/public URLs can be parsed without a VK token.",
      "  - short names require VK_ACCESS_TOKEN in ENV_FILE.",
      "  - Put the positive numeric result into VK_GROUP_ID.",
    ].join("\n"));
  }
}

VkGroupIdCli.Run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { google } from "googleapis";

const DEFAULT_SCRIPT_ID = "1gzxdR2rldUXXqP0ha5p0dH8lSW48mZ-1lLHLybOdm1uQ57hhjMXmakAQ";
const APPS_SCRIPT_SCOPES = ["https://www.googleapis.com/auth/script.projects"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const defaultSourceDir = path.join(__dirname, "apps-script");
const defaultOAuthTokenPath = path.join(repoRoot, "secrets", "apps-script-oauth-token.json");
const versionPattern = /const\s+CONTENT_PLANNER_VERSION\s*=\s*['"]([^'"]+)['"]\s*;/;

function parseArgs(argv) {
  const args = {
    command: argv[2] || "",
    scriptId: process.env.INNER_CIRCLE_APPS_SCRIPT_ID || DEFAULT_SCRIPT_ID,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    oauthCredentialsPath: process.env.GOOGLE_OAUTH_CLIENT_CREDENTIALS || "",
    oauthTokenPath: process.env.GOOGLE_OAUTH_TOKEN_PATH || defaultOAuthTokenPath,
    sourceDir: defaultSourceDir,
    dryRun: false,
    bump: true,
    version: "",
  };

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--script-id") {
      args.scriptId = argv[index + 1];
      index += 1;
    } else if (arg === "--credentials") {
      args.credentialsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--oauth-credentials") {
      args.oauthCredentialsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--oauth-token") {
      args.oauthTokenPath = argv[index + 1];
      index += 1;
    } else if (arg === "--source-dir") {
      args.sourceDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--no-bump") {
      args.bump = false;
    } else if (arg === "--version") {
      args.version = argv[index + 1];
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run apps:auth
  npm run apps:auth -- --oauth-credentials ../../secrets/apps-script-oauth-client.json
  npm run apps:pull
  npm run apps:diff
  npm run apps:push -- --dry-run
  npm run apps:push -- --no-bump
  npm run apps:push -- --version 1.3.0

Environment:
  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
  GOOGLE_OAUTH_CLIENT_CREDENTIALS=/absolute/path/to/oauth-desktop-client.json
  GOOGLE_OAUTH_TOKEN_PATH=/absolute/path/to/apps-script-oauth-token.json
  INNER_CIRCLE_APPS_SCRIPT_ID=<script id>
`);
}

function findDefaultCredentialsPath() {
  for (const dir of [path.join(repoRoot, "secrets"), path.join(repoRoot, ".secrets")]) {
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(dir, name);

      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed.type === "service_account" && parsed.client_email) return filePath;
      } catch {
        // Ignore unrelated JSON files.
      }
    }
  }

  return "";
}

function findDefaultOAuthCredentialsPath() {
  for (const dir of [path.join(repoRoot, "secrets"), path.join(repoRoot, ".secrets")]) {
    if (!fs.existsSync(dir)) continue;

    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(dir, name);

      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed.installed?.client_id || parsed.web?.client_id) return filePath;
      } catch {
        // Ignore unrelated JSON files.
      }
    }
  }

  return "";
}

function loadServiceAccountInfo(credentialsPath) {
  const parsed = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

  if (parsed.type !== "service_account" || !parsed.client_email) {
    throw new Error("The credentials file does not look like a Google service account JSON key.");
  }

  return {
    clientEmail: parsed.client_email,
    projectId: parsed.project_id,
  };
}

async function getScriptClient(credentialsPath, writeEnabled) {
  const scopes = [
    writeEnabled
      ? "https://www.googleapis.com/auth/script.projects"
      : "https://www.googleapis.com/auth/script.projects.readonly",
  ];

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes,
  });

  return google.script({ version: "v1", auth });
}

function loadOAuthClientInfo(credentialsPath) {
  const parsed = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const client = parsed.installed || parsed.web;

  if (!client?.client_id || !client?.client_secret) {
    throw new Error(
      "OAuth credentials must be a Google OAuth Client ID JSON for a Desktop app.",
    );
  }

  return client;
}

function getOAuth2Client(oauthCredentialsPath, redirectUri) {
  const client = loadOAuthClientInfo(oauthCredentialsPath);

  return new google.auth.OAuth2(
    client.client_id,
    client.client_secret,
    redirectUri || "http://127.0.0.1",
  );
}

function openInBrowser(url) {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  spawnSync(command, args, { stdio: "ignore" });
}

function waitForOAuthCode(server) {
  return new Promise((resolve, reject) => {
    server.on("request", (request, response) => {
      try {
        const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

        if (requestUrl.pathname !== "/oauth2callback") {
          response.writeHead(404);
          response.end("Not found.");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        if (error) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(`OAuth failed: ${error}`);
          reject(new Error(`OAuth failed: ${error}`));
          return;
        }

        const code = requestUrl.searchParams.get("code");
        if (!code) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("OAuth callback did not include a code.");
          reject(new Error("OAuth callback did not include a code."));
          return;
        }

        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Apps Script authorization completed. You can close this tab.");
        resolve(code);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function runOAuthFlow(oauthCredentialsPath, oauthTokenPath) {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const port = server.address().port;
    const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
    const oauth2Client = getOAuth2Client(oauthCredentialsPath, redirectUri);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: APPS_SCRIPT_SCOPES,
    });

    console.log(`Open this URL if the browser does not open automatically:\n${authUrl}\n`);
    openInBrowser(authUrl);

    const code = await waitForOAuthCode(server);
    const tokenResponse = await oauth2Client.getToken(code);
    const tokens = tokenResponse.tokens;

    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Re-run apps:auth and approve offline access.",
      );
    }

    fs.mkdirSync(path.dirname(oauthTokenPath), { recursive: true });
    fs.writeFileSync(oauthTokenPath, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });

    return tokens;
  } finally {
    server.close();
  }
}

async function getUserOAuthScriptClient(args, allowInteractive) {
  const oauthCredentialsCandidate = args.oauthCredentialsPath || findDefaultOAuthCredentialsPath();
  const oauthCredentialsPath = oauthCredentialsCandidate
    ? path.resolve(oauthCredentialsCandidate)
    : "";

  if (!oauthCredentialsPath || !fs.existsSync(oauthCredentialsPath)) {
    throw new Error(
      [
        "Google OAuth Desktop client JSON was not found.",
        "Create OAuth Client ID -> Desktop app in Google Cloud, download JSON,",
        "save it under secrets/, then run:",
        "npm run apps:auth",
        "or: npm run apps:auth -- --oauth-credentials ../../secrets/<oauth-client>.json",
      ].join(" "),
    );
  }

  const oauthTokenPath = path.resolve(args.oauthTokenPath);

  if (!fs.existsSync(oauthTokenPath)) {
    if (!allowInteractive) {
      throw new Error(
        `OAuth token was not found at ${oauthTokenPath}. Run npm run apps:auth first.`,
      );
    }

    await runOAuthFlow(oauthCredentialsPath, oauthTokenPath);
  }

  const oauth2Client = getOAuth2Client(oauthCredentialsPath);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(oauthTokenPath, "utf8")));

  return google.script({ version: "v1", auth: oauth2Client });
}

function extensionForType(type) {
  if (type === "JSON") return ".json";
  if (type === "HTML") return ".html";
  return ".gs";
}

function typeForFileName(fileName) {
  if (fileName === "appsscript.json") return "JSON";
  if (fileName.endsWith(".html")) return "HTML";
  return "SERVER_JS";
}

function fileNameForApiFile(file) {
  if (file.name === "appsscript" && file.type === "JSON") return "appsscript.json";
  return `${file.name}${extensionForType(file.type)}`;
}

function apiNameForFile(fileName) {
  if (fileName === "appsscript.json") return "appsscript";
  return fileName.replace(/\.(gs|html|json)$/i, "");
}

function listSourceFiles(sourceDir) {
  if (!fs.existsSync(sourceDir)) return [];

  return fs
    .readdirSync(sourceDir)
    .filter((fileName) => [".gs", ".html", ".json"].includes(path.extname(fileName)))
    .sort((a, b) => {
      if (a === "appsscript.json") return -1;
      if (b === "appsscript.json") return 1;
      return a.localeCompare(b);
    });
}

function readLocalFiles(sourceDir) {
  const fileNames = listSourceFiles(sourceDir);

  if (!fileNames.length) {
    throw new Error(`No Apps Script source files found in ${sourceDir}`);
  }

  return fileNames.map((fileName) => ({
    name: apiNameForFile(fileName),
    type: typeForFileName(fileName),
    source: fs.readFileSync(path.join(sourceDir, fileName), "utf8"),
  }));
}

async function fetchRemoteFiles(script, scriptId) {
  const response = await script.projects.getContent({ scriptId });
  return response.data.files || [];
}

function writeApiFiles(sourceDir, files) {
  fs.mkdirSync(sourceDir, { recursive: true });

  for (const fileName of listSourceFiles(sourceDir)) {
    fs.unlinkSync(path.join(sourceDir, fileName));
  }

  for (const file of files) {
    fs.writeFileSync(path.join(sourceDir, fileNameForApiFile(file)), file.source || "");
  }
}

function parseVersion(value) {
  const match = String(value || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function incrementPatch(version) {
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error(`CONTENT_PLANNER_VERSION must use major.minor.patch format, got: ${version}`);
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function bumpVersion(sourceDir, explicitVersion) {
  const configPath = path.join(sourceDir, "Config.gs");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config.gs was not found in ${sourceDir}`);
  }

  const source = fs.readFileSync(configPath, "utf8");
  const match = source.match(versionPattern);

  if (!match) {
    throw new Error("CONTENT_PLANNER_VERSION was not found in Config.gs");
  }

  const previousVersion = match[1];
  const nextVersion = explicitVersion || incrementPatch(previousVersion);
  const nextSource = source.replace(versionPattern, `const CONTENT_PLANNER_VERSION = '${nextVersion}';`);
  fs.writeFileSync(configPath, nextSource);

  return { previousVersion, nextVersion };
}

function setVersion(sourceDir, version) {
  const configPath = path.join(sourceDir, "Config.gs");
  const source = fs.readFileSync(configPath, "utf8");

  if (!source.match(versionPattern)) {
    throw new Error("CONTENT_PLANNER_VERSION was not found in Config.gs");
  }

  fs.writeFileSync(
    configPath,
    source.replace(versionPattern, `const CONTENT_PLANNER_VERSION = '${version}';`),
  );
}

function printDiff(remoteDir, sourceDir) {
  const result = spawnSync("git", ["diff", "--no-index", "--", remoteDir, sourceDir], {
    encoding: "utf8",
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (output) console.log(output);

  return result.status || 0;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.command || !["auth", "pull", "diff", "push"].includes(args.command)) {
    printHelp();
    process.exit(args.command ? 1 : 0);
  }

  const credentialsPath = path.resolve(args.credentialsPath || findDefaultCredentialsPath());
  if (args.command !== "auth" && (!credentialsPath || !fs.existsSync(credentialsPath))) {
    throw new Error("Google service account JSON key was not found.");
  }

  const serviceAccount = args.command === "auth" ? null : loadServiceAccountInfo(credentialsPath);

  if (args.command === "auth") {
    const oauthCredentialsCandidate = args.oauthCredentialsPath || findDefaultOAuthCredentialsPath();
    const oauthCredentialsPath = oauthCredentialsCandidate
      ? path.resolve(oauthCredentialsCandidate)
      : "";

    if (!oauthCredentialsPath || !fs.existsSync(oauthCredentialsPath)) {
      throw new Error(
        "Pass --oauth-credentials with a Google OAuth Desktop client JSON file.",
      );
    }

    const oauthTokenPath = path.resolve(args.oauthTokenPath);
    await runOAuthFlow(oauthCredentialsPath, oauthTokenPath);
    console.log(JSON.stringify({ ok: true, command: "auth", tokenPath: oauthTokenPath }, null, 2));
    return;
  }

  if (args.command === "pull") {
    const script = await getScriptClient(credentialsPath, false);
    const files = await fetchRemoteFiles(script, args.scriptId);
    writeApiFiles(args.sourceDir, files);
    console.log(JSON.stringify({ ok: true, command: "pull", serviceAccount, files: files.length }, null, 2));
    return;
  }

  if (args.command === "diff") {
    const script = await getScriptClient(credentialsPath, false);
    const files = await fetchRemoteFiles(script, args.scriptId);
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), "inner-circle-apps-script-"));
    writeApiFiles(remoteDir, files);
    const status = printDiff(remoteDir, args.sourceDir);
    console.log(JSON.stringify({ ok: true, command: "diff", different: status !== 0 }, null, 2));
    return;
  }

  let version = null;
  let files = readLocalFiles(args.sourceDir);
  const summary = {
    ok: true,
    command: "push",
    dryRun: args.dryRun,
    serviceAccount,
    scriptId: args.scriptId,
    sourceDir: args.sourceDir,
    version,
    files: files.map((file) => ({
      name: file.name,
      type: file.type,
      sourceChars: file.source.length,
    })),
  };

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const script = await getUserOAuthScriptClient(args, false);

  if (args.version || args.bump) {
    version = bumpVersion(args.sourceDir, args.version);
    files = readLocalFiles(args.sourceDir);
    summary.version = version;
    summary.files = files.map((file) => ({
      name: file.name,
      type: file.type,
      sourceChars: file.source.length,
    }));
  }

  try {
    await script.projects.updateContent({
      scriptId: args.scriptId,
      requestBody: { files },
    });
  } catch (error) {
    if (version) {
      setVersion(args.sourceDir, version.previousVersion);
    }
    throw error;
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error?.response?.data?.error || error?.message || String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});

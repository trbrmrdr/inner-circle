import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = {
    scriptId: process.env.INNER_CIRCLE_APPS_SCRIPT_ID || "",
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    includeSource: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--script-id") {
      args.scriptId = argv[index + 1];
      index += 1;
    } else if (arg === "--credentials") {
      args.credentialsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--source") {
      args.includeSource = true;
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
  node inspect-apps-script.mjs --script-id <script project id>
  INNER_CIRCLE_APPS_SCRIPT_ID=<id> npm run inspect:apps-script

How to find script id:
  Google Sheet -> Extensions -> Apps Script -> copy the id from:
  https://script.google.com/home/projects/<script-id>/edit
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
        if (parsed.type === "service_account" && parsed.client_email) {
          return filePath;
        }
      } catch {
        // Ignore unrelated JSON files.
      }
    }
  }

  return "";
}

function loadServiceAccountInfo(credentialsPath) {
  const parsed = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  return {
    clientEmail: parsed.client_email,
    projectId: parsed.project_id,
  };
}

function summarizeFile(file, includeSource) {
  const summary = {
    name: file.name,
    type: file.type,
    functionNames: file.functionSet?.values?.map((fn) => fn.name).filter(Boolean) || [],
    sourceChars: String(file.source || "").length,
  };

  if (includeSource) {
    summary.source = file.source || "";
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.scriptId) {
    throw new Error("Pass --script-id or set INNER_CIRCLE_APPS_SCRIPT_ID.");
  }

  const credentialsPath = path.resolve(args.credentialsPath || findDefaultCredentialsPath());
  if (!credentialsPath || !fs.existsSync(credentialsPath)) {
    throw new Error("Google service account JSON key was not found.");
  }

  const serviceAccountInfo = loadServiceAccountInfo(credentialsPath);
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/script.projects.readonly"],
  });
  const script = google.script({ version: "v1", auth });
  const response = await script.projects.getContent({
    scriptId: args.scriptId,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        serviceAccount: serviceAccountInfo,
        scriptId: response.data.scriptId,
        files: (response.data.files || []).map((file) => summarizeFile(file, args.includeSource)),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error?.response?.data?.error || error?.message || String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
});

import { createServer } from "node:http";
import { promises as fs, watch } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const distDir = path.join(appRoot, "dist");
const noWatch = process.argv.includes("--no-watch");
const requestedPort = Number(process.env.PORT || 4177);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

let building = false;
let pending = false;

function runBuild() {
  if (building) {
    pending = true;
    return;
  }

  building = true;
  const child = spawn(process.execPath, ["scripts/build-site.mjs"], {
    cwd: appRoot,
    stdio: "inherit"
  });

  child.on("exit", code => {
    building = false;

    if (code !== 0) {
      console.error(`Build failed with exit code ${code}`);
    }

    if (pending) {
      pending = false;
      runBuild();
    }
  });
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveRequestPath(urlPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    decodedPath = "/";
  }

  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safePath);

  if (decodedPath.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }

  if (await fileExists(filePath)) {
    return filePath;
  }

  const indexPath = path.join(filePath, "index.html");
  if (await fileExists(indexPath)) {
    return indexPath;
  }

  return path.join(distDir, "index.html");
}

function startServer(port) {
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const filePath = await resolveRequestPath(requestUrl.pathname);
    const extension = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes.get(extension) || "application/octet-stream";

    try {
      const body = await fs.readFile(filePath);
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  server.on("error", error => {
    if (error.code === "EADDRINUSE") {
      startServer(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Inner Circle dev server: http://127.0.0.1:${port}/ru/`);
  });
}

runBuild();
startServer(requestedPort);

if (!noWatch) {
  const watcher = watch(path.join(appRoot, "src"), { recursive: true }, () => runBuild());
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

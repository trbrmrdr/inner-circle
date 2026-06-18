import { createServer } from "node:http";
import { promises as fs, watch } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(appRoot, "dist");
const noWatch = process.argv.includes("--no-watch");
const startPort = Number(process.env.PORT || 4177);
const reloadClients = new Set();

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

let building = false;
let pending = false;
let debounceTimer;

function runBuild({ notify = false } = {}) {
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

    if (code === 0 && notify) {
      broadcastReload();
    }

    if (code !== 0) {
      console.error(`Build failed with exit code ${code}`);
    }

    if (pending) {
      pending = false;
      runBuild({ notify: true });
    }
  });
}

function scheduleBuild() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runBuild({ notify: true }), 120);
}

function broadcastReload() {
  for (const response of reloadClients) {
    response.write("event: reload\\ndata: now\\n\\n");
  }
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function resolveRequestPath(urlPath) {
  let decodedPath = "/";

  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    decodedPath = "/";
  }

  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distRoot, safePath);

  if (decodedPath.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }

  if (await fileExists(filePath)) return filePath;

  const indexPath = path.join(filePath, "index.html");
  if (await fileExists(indexPath)) return indexPath;

  return path.join(distRoot, "index.html");
}

async function sendFile(request, response) {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/__reload") {
    response.writeHead(200, {
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "content-type": "text/event-stream"
    });
    response.write("\\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }

  const filePath = await resolveRequestPath(requestUrl.pathname);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension) || "application/octet-stream";

  try {
    let body = await fs.readFile(filePath);

    if (!noWatch && extension === ".html") {
      body = Buffer.from(injectReloadClient(body.toString("utf8")));
    }

    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function injectReloadClient(html) {
  const client = `<script>
(() => {
  const events = new EventSource('/__reload');
  events.addEventListener('reload', () => window.location.reload());
})();
</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${client}\\n</body>`) : `${html}${client}`;
}

function startServer(port) {
  const server = createServer(sendFile);

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

function watchSources() {
  for (const folder of ["src", "public"]) {
    watch(path.join(appRoot, folder), { recursive: true }, scheduleBuild);
  }
}

runBuild();
startServer(startPort);

if (!noWatch) {
  watchSources();
}

import { createServer, request as httpRequest } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(appRoot, "dist");
const noWatch = process.argv.includes("--no-watch");
const startPort = Number(process.env.PORT || 4177);
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:4100";
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
    return Promise.resolve(false);
  }

  building = true;

  return new Promise(resolve => {
    const child = spawn(process.execPath, ["scripts/build-site.mjs"], {
      cwd: appRoot,
      stdio: "inherit"
    });

    child.on("exit", code => {
      building = false;
      const hasPendingBuild = pending;

      if (code !== 0) {
        console.error(`Build failed with exit code ${code}`);
      }

      if (hasPendingBuild) {
        pending = false;
        runBuild({ notify: true });
      } else if (code === 0 && notify) {
        broadcastReload();
      }

      resolve(code === 0);
    });
  });
}

function scheduleBuild() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runBuild({ notify: true }), 180);
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

function preferredLanguage(urlPath, headers) {
  if (urlPath.startsWith("/en/")) return "en";
  if (urlPath.startsWith("/ru/")) return "ru";

  const acceptLanguage = String(headers["accept-language"] || "").toLowerCase();
  if (acceptLanguage.startsWith("en")) return "en";

  return "ru";
}

async function resolveRequestPath(urlPath, headers = {}) {
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

  const htmlPath = `${filePath}.html`;
  if (await fileExists(htmlPath)) return htmlPath;

  const indexPath = path.join(filePath, "index.html");
  if (await fileExists(indexPath)) return indexPath;

  if (path.extname(decodedPath)) return null;

  const language = preferredLanguage(decodedPath, headers);
  return path.join(distRoot, language, "404", "index.html");
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

  if (requestUrl.pathname.startsWith("/api/")) {
    proxyApiRequest(request, response, requestUrl);
    return;
  }

  const filePath = await resolveRequestPath(requestUrl.pathname, request.headers);
  if (!filePath) {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      ...devCacheHeaders()
    });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension) || "application/octet-stream";
  const isFallback404 = /[/\\](ru|en)[/\\]404[/\\]index\.html$/.test(filePath) && requestUrl.pathname !== "/ru/404/" && requestUrl.pathname !== "/en/404/";

  try {
    let body = await fs.readFile(filePath);

    if (!noWatch && extension === ".html") {
      body = Buffer.from(injectReloadClient(body.toString("utf8")));
    }

    response.writeHead(isFallback404 ? 404 : 200, {
      "content-type": contentType,
      ...devCacheHeaders()
    });
    response.end(body);
  } catch {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      ...devCacheHeaders()
    });
    response.end("Not found");
  }
}

function proxyApiRequest(clientRequest, clientResponse, requestUrl) {
  const target = new URL(requestUrl.pathname + requestUrl.search, apiProxyTarget);
  const headers = { ...clientRequest.headers, host: target.host };

  const proxyRequest = httpRequest(target, {
    method: clientRequest.method,
    headers
  }, proxyResponse => {
    clientResponse.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(clientResponse);
  });

  proxyRequest.on("error", error => {
    clientResponse.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      ...devCacheHeaders()
    });
    clientResponse.end(JSON.stringify({
      ok: false,
      message: `Local API proxy failed: ${error.message}`,
      target: target.toString()
    }));
  });

  clientRequest.pipe(proxyRequest);
}

function devCacheHeaders() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "expires": "0",
    "pragma": "no-cache"
  };
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
  const watcher = chokidar.watch([
    path.join(appRoot, "src"),
    path.join(appRoot, "public")
  ], {
    awaitWriteFinish: {
      pollInterval: 50,
      stabilityThreshold: 180
    },
    ignoreInitial: true,
    ignored: [
      path.join(appRoot, ".build.lock"),
      path.join(appRoot, "dist"),
      path.join(appRoot, "node_modules")
    ]
  });

  watcher.on("all", (_event, changedPath) => {
    console.log(`Changed ${path.relative(appRoot, changedPath)}; rebuilding...`);
    scheduleBuild();
  });

  watcher.on("error", error => {
    console.error("Watcher error:", error);
  });

  return watcher;
}

await runBuild();
startServer(startPort);

if (!noWatch) {
  watchSources();
}

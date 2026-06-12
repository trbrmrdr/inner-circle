#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const sitesFile = process.env.SITES_FILE || path.join(rootDir, 'resources/reference-sites.tsv');
const outDir = process.env.OUT_DIR || path.join(rootDir, 'resources/local-sites');
const chromeProfileDir = process.env.CHROME_PROFILE_DIR || path.join(outDir, '_chrome-snapshot-profile');
const waitMs = Number(process.env.WAIT_MS || 7000);
const scrollSteps = Number(process.env.SCROLL_STEPS || 8);
const scrollPauseMs = Number(process.env.SCROLL_PAUSE_MS || 650);
const navTimeoutMs = Number(process.env.NAV_TIMEOUT_MS || 60000);
const captureTimeoutMs = Number(process.env.CAPTURE_TIMEOUT_MS || 30000);
const siteTimeoutMs = Number(process.env.SITE_TIMEOUT_MS || 150000);
const captureMhtml = process.env.CAPTURE_MHTML !== '0';
const fullPageScreenshot = process.env.FULL_PAGE_SCREENSHOT === '1';
const headless = process.env.HEADLESS !== '0';
const dismissCookieBanners = process.env.DISMISS_COOKIES !== '0';
const chromePath = process.env.CHROME_PATH || findChromePath();

const viewports = [
  {
    name: 'desktop',
    width: Number(process.env.DESKTOP_WIDTH || 1440),
    height: Number(process.env.DESKTOP_HEIGHT || 900),
    mobile: false,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  },
  {
    name: 'mobile',
    width: Number(process.env.MOBILE_WIDTH || 390),
    height: Number(process.env.MOBILE_HEIGHT || 844),
    mobile: true,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
];

function usage() {
  console.log(`Usage:
  node scripts/snapshot-reference-sites.mjs [all|core|mechanics|slug]

Environment:
  WAIT_MS=7000              Extra wait after page load.
  SCROLL_STEPS=8            Lazy-load scroll passes.
  SITE_TIMEOUT_MS=150000    Maximum time per site.
  CAPTURE_TIMEOUT_MS=30000  Maximum time for screenshots/MHTML.
  CAPTURE_MHTML=1           Set CAPTURE_MHTML=0 for faster screenshots only.
  FULL_PAGE_SCREENSHOT=0    Set FULL_PAGE_SCREENSHOT=1 for long full-page PNGs.
  HEADLESS=1                Set HEADLESS=0 to watch Chrome.
  DISMISS_COOKIES=1         Try to close common cookie banners.
  CHROME_PATH=/path/chrome  Override Chrome path.

Examples:
  node scripts/snapshot-reference-sites.mjs mas-girbau
  node scripts/snapshot-reference-sites.mjs core
  WAIT_MS=10000 node scripts/snapshot-reference-sites.mjs all`);
}

function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/opt/homebrew/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

async function readSites() {
  const text = await readFile(sitesFile, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [slug, url, title, group] = line.split('\t');
      return { slug, url, title, group };
    });
}

function matchesTarget(site, target) {
  if (target === 'all') return true;
  if (target === 'core' || target === 'mechanics') return site.group === target;
  return site.slug === target;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs) {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result || {});
        return;
      }

      if (message.method) {
        const handlers = this.handlers.get(message.method) || [];
        for (const handler of handlers) handler(message);
      }
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) || [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  async send(method, params = {}, sessionId = undefined) {
    await this.ready;
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;

    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.ws.send(JSON.stringify(message));
    return promise;
  }

  close() {
    this.ws.close();
  }
}

async function launchChrome() {
  if (!chromePath) {
    throw new Error('Google Chrome or Chromium was not found. Set CHROME_PATH to continue.');
  }

  await mkdir(outDir, { recursive: true });
  await rm(chromeProfileDir, { recursive: true, force: true });

  const port = await getFreePort();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${chromeProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--mute-audio',
    'about:blank',
  ];

  if (headless) {
    args.unshift('--headless=new', '--disable-gpu');
  }

  const chrome = spawn(chromePath, args, {
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  chrome.once('exit', (code) => {
    if (code && code !== 0) {
      console.error(`Chrome exited with code ${code}`);
    }
  });

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 20000);
  return { chrome, client: new CdpClient(version.webSocketDebuggerUrl) };
}

async function withPage(client, fn) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  try {
    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Network.enable', { maxTotalBufferSize: 100000000 }, sessionId);
    return await fn(sessionId);
  } finally {
    await client.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function evaluate(client, sessionId, expression, options = {}) {
  const result = await client.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
      ...options,
    },
    sessionId,
  );

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  }

  return result.result?.value;
}

async function navigateAndWait(client, sessionId, url) {
  const loaded = new Promise((resolve) => {
    const timeout = setTimeout(resolve, navTimeoutMs);
    client.on('Page.loadEventFired', (message) => {
      if (message.sessionId === sessionId) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  await client.send('Page.navigate', { url }, sessionId);
  await loaded;
  await delay(waitMs);
}

async function autoScroll(client, sessionId) {
  const height = await evaluate(
    client,
    sessionId,
    `Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)`,
  ).catch(() => 0);

  if (!height || height < 1200) {
    await delay(scrollPauseMs);
    return;
  }

  for (let index = 0; index <= scrollSteps; index += 1) {
    const top = Math.round((height * index) / Math.max(scrollSteps, 1));
    await evaluate(client, sessionId, `window.scrollTo({ top: ${top}, left: 0, behavior: 'instant' })`).catch(
      () => {},
    );
    await delay(scrollPauseMs);
  }

  await evaluate(client, sessionId, `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })`).catch(() => {});
  await delay(scrollPauseMs);
}

async function dismissOverlays(client, sessionId) {
  if (!dismissCookieBanners) return;

  await evaluate(
    client,
    sessionId,
    `(() => {
      const phrases = [
        'accept all',
        'accept',
        'agree',
        'i agree',
        'allow all',
        'got it',
        'принять',
        'согласен',
        'alle akzeptieren',
        'accepter',
        'accetta',
        'aceptar'
      ];
      const elements = [...document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')];
      let clicked = 0;

      for (const element of elements) {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        if (style.visibility === 'hidden' || style.display === 'none' || box.width < 8 || box.height < 8) continue;

        const text = [
          element.innerText,
          element.textContent,
          element.value,
          element.getAttribute('aria-label'),
          element.getAttribute('title')
        ].filter(Boolean).join(' ').trim().toLowerCase();

        if (!text) continue;
        if (phrases.some((phrase) => text.includes(phrase))) {
          element.click();
          clicked += 1;
          if (clicked >= 3) break;
        }
      }

      return clicked;
    })()`,
  ).catch(() => {});

  await delay(1000);
}

async function captureViewport(client, site, viewport, siteDir) {
  const network = [];

  client.on('Network.responseReceived', (message) => {
    if (message.sessionId !== viewport.sessionId) return;
    const response = message.params?.response;
    if (!response?.url) return;

    network.push({
      url: response.url,
      status: response.status,
      mimeType: response.mimeType,
      fromDiskCache: response.fromDiskCache || false,
      fromServiceWorker: response.fromServiceWorker || false,
    });
  });

  await client.send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    },
    viewport.sessionId,
  );
  await client.send('Emulation.setUserAgentOverride', { userAgent: viewport.userAgent }, viewport.sessionId);

  await navigateAndWait(client, viewport.sessionId, site.url);
  await dismissOverlays(client, viewport.sessionId);
  await autoScroll(client, viewport.sessionId);

  const title = await evaluate(client, viewport.sessionId, 'document.title').catch(() => '');
  const finalUrl = await evaluate(client, viewport.sessionId, 'location.href').catch(() => site.url);
  const html = await evaluate(client, viewport.sessionId, 'document.documentElement.outerHTML').catch(() => '');
  let screenshotError = null;
  let snapshotError = captureMhtml ? null : 'disabled';
  let screenshot = null;
  let snapshot = { data: '' };

  try {
    screenshot = await withTimeout(
      client.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: fullPageScreenshot, fromSurface: true },
        viewport.sessionId,
      ),
      captureTimeoutMs,
      `${site.slug} ${viewport.name} screenshot`,
    );
  } catch (error) {
    screenshotError = error.message;
  }

  if (captureMhtml) {
    try {
      snapshot = await withTimeout(
        client.send('Page.captureSnapshot', { format: 'mhtml' }, viewport.sessionId),
        captureTimeoutMs,
        `${site.slug} ${viewport.name} MHTML`,
      );
    } catch (error) {
      snapshotError = error.message;
    }
  }

  if (screenshot?.data) {
    await writeFile(path.join(siteDir, `${viewport.name}.png`), Buffer.from(screenshot.data, 'base64'));
  }
  await writeFile(path.join(siteDir, `rendered.${viewport.name}.html`), html || '', 'utf8');
  if (snapshot.data) {
    await writeFile(path.join(siteDir, `${viewport.name}.mhtml`), snapshot.data, 'utf8');
  }

  return {
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    title,
    finalUrl,
    screenshotError,
    snapshotError,
    network,
  };
}

async function snapshotSite(client, site) {
  const siteDir = path.join(outDir, site.slug);
  await mkdir(siteDir, { recursive: true });
  await rm(path.join(siteDir, 'snapshot-error.txt'), { force: true });

  console.log(`Snapshot ${site.title}`);
  console.log(`  URL: ${site.url}`);
  console.log(`  Out: ${siteDir}`);

  const captures = [];

  for (const baseViewport of viewports) {
    await withPage(client, async (sessionId) => {
      const viewport = { ...baseViewport, sessionId };
      const capture = await captureViewport(client, site, viewport, siteDir);
      captures.push(capture);
    });
  }

  const metadata = {
    site,
    capturedAt: new Date().toISOString(),
    captures: captures.map(({ network, ...capture }) => ({
      ...capture,
      networkRequests: network.length,
    })),
  };
  const network = captures.flatMap((capture) =>
    capture.network.map((entry) => ({
      viewport: capture.viewport,
      ...entry,
    })),
  );

  await writeFile(path.join(siteDir, 'snapshot-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
  await writeFile(path.join(siteDir, 'network.json'), JSON.stringify(network, null, 2), 'utf8');

  console.log(`Done: ${site.slug}`);
  console.log();
}

async function generateSnapshotIndex(sites) {
  const cards = sites
    .map((site) => {
      const siteDir = path.join(outDir, site.slug);
      const desktopPath = path.join(siteDir, 'desktop.png');
      const mobilePath = path.join(siteDir, 'mobile.png');
      const desktopMhtmlPath = path.join(siteDir, 'desktop.mhtml');
      const mobileMhtmlPath = path.join(siteDir, 'mobile.mhtml');
      const renderedDesktopPath = path.join(siteDir, 'rendered.desktop.html');
      const renderedMobilePath = path.join(siteDir, 'rendered.mobile.html');
      const metadataPath = path.join(siteDir, 'snapshot-metadata.json');
      const networkPath = path.join(siteDir, 'network.json');
      if (!existsSync(desktopPath) && !existsSync(mobilePath)) return '';

      const links = [
        existsSync(desktopMhtmlPath) && `<a href="./${site.slug}/desktop.mhtml">desktop mhtml</a>`,
        existsSync(mobileMhtmlPath) && `<a href="./${site.slug}/mobile.mhtml">mobile mhtml</a>`,
        existsSync(renderedDesktopPath) && `<a href="./${site.slug}/rendered.desktop.html">desktop html</a>`,
        existsSync(renderedMobilePath) && `<a href="./${site.slug}/rendered.mobile.html">mobile html</a>`,
        existsSync(metadataPath) && `<a href="./${site.slug}/snapshot-metadata.json">metadata</a>`,
        existsSync(networkPath) && `<a href="./${site.slug}/network.json">network</a>`,
      ]
        .filter(Boolean)
        .join('');
      const desktopShotHref = existsSync(desktopMhtmlPath)
        ? `./${site.slug}/desktop.mhtml`
        : `./${site.slug}/desktop.png`;
      const mobileShotHref = existsSync(mobileMhtmlPath)
        ? `./${site.slug}/mobile.mhtml`
        : `./${site.slug}/mobile.png`;

      return `
        <article>
          <h2>${escapeHtml(site.title)}</h2>
          <p>${escapeHtml(site.group)} · <a href="${escapeHtml(site.url)}">live</a></p>
          <div class="shots">
            ${existsSync(desktopPath) ? `<a href="${desktopShotHref}"><img src="./${site.slug}/desktop.png" alt="${escapeHtml(site.title)} desktop"></a>` : ''}
            ${existsSync(mobilePath) ? `<a href="${mobileShotHref}"><img src="./${site.slug}/mobile.png" alt="${escapeHtml(site.title)} mobile"></a>` : ''}
          </div>
          <nav>
            ${links}
          </nav>
        </article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser Reference Snapshots</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #10120f;
      --panel: #181c16;
      --line: #2a3025;
      --text: #f4f1e8;
      --muted: #a8ae9c;
      --accent: #bfd878;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      padding: 24px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; }
    header p, article p { color: var(--muted); }
    main {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      padding: 18px;
    }
    article {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      overflow: hidden;
    }
    article h2, article p, nav { padding: 0 14px; }
    article h2 { padding-top: 14px; font-size: 16px; }
    .shots {
      display: grid;
      grid-template-columns: 1.8fr 0.8fr;
      gap: 1px;
      margin: 12px 0;
      background: var(--line);
      border-block: 1px solid var(--line);
    }
    .shots img {
      display: block;
      width: 100%;
      height: 220px;
      object-fit: cover;
      object-position: top;
      background: #050604;
    }
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-bottom: 14px;
    }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>Browser Reference Snapshots</h1>
    <p>Private research snapshots. Use for mechanics and layout analysis only.</p>
  </header>
  <main>
    ${cards || '<p>No snapshots yet.</p>'}
  </main>
</body>
</html>`;

  await writeFile(path.join(outDir, 'browser-snapshots.html'), html, 'utf8');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  const target = process.argv[2] || 'all';

  if (target === '-h' || target === '--help' || target === 'help') {
    usage();
    return;
  }

  if (target === 'index') {
    await generateSnapshotIndex(await readSites());
    console.log(`Snapshot index: ${path.join(outDir, 'browser-snapshots.html')}`);
    return;
  }

  const sites = (await readSites()).filter((site) => matchesTarget(site, target));
  if (!sites.length) {
    throw new Error(`No site found for target: ${target}`);
  }

  for (const site of sites) {
    let chrome = null;
    let client = null;

    try {
      const launched = await launchChrome();
      chrome = launched.chrome;
      client = launched.client;

      await withTimeout(snapshotSite(client, site), siteTimeoutMs, `${site.slug} site capture`);
    } catch (error) {
      const siteDir = path.join(outDir, site.slug);
      await mkdir(siteDir, { recursive: true });
      await writeFile(path.join(siteDir, 'snapshot-error.txt'), String(error.stack || error), 'utf8');
      console.error(`Failed: ${site.slug}`);
      console.error(error.message);
      console.error();
    } finally {
      if (client) client.close();
      if (chrome) chrome.kill();
      await delay(1000);
    }
  }

  await generateSnapshotIndex(await readSites());
  console.log(`Snapshot index: ${path.join(outDir, 'browser-snapshots.html')}`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

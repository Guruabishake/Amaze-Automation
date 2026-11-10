#!/usr/bin/env node
/**
 * Shared "generate the static Allure report, then serve+open it, then shut the server back down"
 * logic - extracted out of run-with-allure.js so run-multiuser.js can reuse the exact same,
 * already-tuned behavior instead of a second, drifting copy of it.
 *
 * Allure's static report needs to be loaded over HTTP (its JS fetches data/*.json - opening
 * index.html directly via file:// hits Chrome's file-origin fetch restrictions and the report
 * never populates), so *some* server is unavoidable. This uses a plain in-process Node `http`
 * server, not the Allure CLI's own `allure open` - `allure open` spawns a separate detached Java
 * process this script would not fully control, so it is never actually stopped once the report
 * opens (confirmed live via `tasklist` across runs in this repo - the orphaned process is exactly
 * what held a log file handle open indefinitely on an earlier run). The in-process server here is
 * `server.close()`d right after Chrome has had time to load the report, so nothing outlives this
 * process.
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Common per-machine/per-user Chrome install locations, checked in order - covers 64-bit,
// 32-bit and per-user installs without assuming any one of them. CHROME_PATH (if set) always
// wins over all of this. If none of these exist either (a non-default install directory),
// `openInChrome` below falls back to Windows' own "start chrome" resolution, which finds Chrome
// via its registered App Paths entry regardless of where it's actually installed - so no path
// ever needs to be hardcoded as the only option.
const KNOWN_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

function resolveChromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return KNOWN_CHROME_PATHS.find((p) => p && fs.existsSync(p));
}

/** Opens `url` in Chrome. Prefers a resolved executable path; falls back to Windows' own "start chrome" (App Paths registry lookup - no hardcoded install path required) when none of the known locations exist. */
function openInChrome(url) {
  const chromePath = resolveChromePath();
  if (chromePath) {
    spawn(chromePath, [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('cmd', ['/c', 'start', '""', 'chrome', url], { detached: true, stdio: 'ignore' }).unref();
}

// A handful of extensions actually present in an Allure static report - anything else falls back
// to a generic binary content-type, which browsers still render/download fine.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Minimal static file server for an already-generated Allure report directory. */
function serveReport(reportDir) {
  return http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    // Resolve-and-check-prefix guards against a request path escaping reportDir via "..".
    const filePath = path.join(reportDir, relativePath);
    if (!filePath.startsWith(reportDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

/**
 * Serves the report just long enough for the browser to load it, then stops the server itself -
 * no fixed "sleep N seconds" guess. Every request the report's own page makes (its HTML, JS bundle,
 * then its data/*.json fetches) resets an idle timer; once nothing has been requested for
 * IDLE_MS, the initial load is done and the server shuts down. MAX_WAIT_MS bounds how long this
 * waits for that first request at all (e.g. Chrome being slow to launch), so this can never hang
 * waiting on a browser that never shows up.
 */
async function serveReportThenClose(reportDir) {
  const IDLE_MS = 2000;
  const MAX_WAIT_MS = 20000;
  const server = serveReport(reportDir);

  // Chrome keeps its HTTP/1.1 connection to us alive (keep-alive) well past the point the page has
  // actually finished loading, so plain server.close() alone would sit waiting for that idle
  // socket to close on its own - it never does in time. Tracking sockets lets the shutdown below
  // destroy them outright once the idle window has elapsed, so close() resolves immediately.
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/index.html`;

  openInChrome(url);
  console.log(`Allure report open at ${url}`);

  let lastRequestAt = Date.now();
  server.on('request', () => {
    lastRequestAt = Date.now();
  });

  const startedAt = Date.now();
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const idleFor = Date.now() - lastRequestAt;
      const waitedFor = Date.now() - startedAt;
      if (idleFor >= IDLE_MS || waitedFor >= MAX_WAIT_MS) {
        clearInterval(check);
        resolve();
      }
    }, 250);
  });

  await new Promise((resolve) => {
    server.close(resolve);
    for (const socket of sockets) socket.destroy();
  });
}

/** Generates the static report from `resultsDir` into `reportDir`, then serves+opens+closes it. Returns true on success. */
async function generateAndOpenAllureReport(resultsDir, reportDir) {
  console.log('Allure report:');
  const generate = spawnSync('allure', ['generate', resultsDir, '--clean', '-o', reportDir], {
    stdio: 'inherit',
    shell: true,
  });
  if (generate.status !== 0) {
    console.error('Failed to generate the Allure report.');
    return false;
  }
  console.log('Generated successfully');
  console.log('Opening in Chrome...');
  await serveReportThenClose(reportDir);
  return true;
}

module.exports = { generateAndOpenAllureReport };

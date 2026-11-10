#!/usr/bin/env node
/**
 * Local-only "Automation Execution Configuration" screen for the AmazerTrans multi-user
 * architecture (e2e/AmazerTrans/config/users.config.json + e2e/shared/multiUser). A QA tester
 * uses this instead of hand-editing JSON/.env: add/remove/enable/disable users, change
 * username/branch/browser, set a new password (never shown back, only a "configured/not
 * configured" indicator), pick which users to run, and trigger a real run - all from one page,
 * with zero TypeScript/test-code changes required for any of it.
 *
 * Binds to 127.0.0.1 only - this is a local developer tool, not a deployed service, and it can
 * both read every configured username and trigger real Playwright runs, so it must never be
 * exposed beyond localhost.
 *
 * Usage: node scripts/config-ui.js   (then open the printed http://127.0.0.1:<port> URL)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const { readEnvValues, upsertEnvValues } = require('./lib/envFile');

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env');
const USERS_CONFIG_PATH = path.join(ROOT, 'e2e', 'AmazerTrans', 'config', 'users.config.json');
const RUN_MULTIUSER = path.join(ROOT, 'scripts', 'run-multiuser.js');
const STATIC_DIR = path.join(__dirname, 'config-ui');

function readUsersConfig() {
  return JSON.parse(fs.readFileSync(USERS_CONFIG_PATH, 'utf-8'));
}

function writeUsersConfig(config) {
  fs.writeFileSync(USERS_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

/** Sanitized view sent to the browser: real username (not secret), never the password - only whether one is set. */
function toClientConfig(config) {
  const envValues = readEnvValues(ENV_PATH);
  return {
    defaultTestMatch: config.defaultTestMatch,
    recommendedWorkers: config.recommendedWorkers,
    environments: config.environments,
    users: config.users.map((u) => ({
      id: u.id,
      label: u.label,
      enabled: u.enabled,
      branch: u.branch || '',
      browser: u.browser || 'chromium',
      username: envValues[u.usernameEnv] || '',
      passwordConfigured: !!envValues[u.passwordEnv],
    })),
  };
}

function envVarNamesFor(id, existingEntry) {
  if (existingEntry) return { usernameEnv: existingEntry.usernameEnv, passwordEnv: existingEntry.passwordEnv };
  const suffix = id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return { usernameEnv: `AMAZERTRANS_${suffix}_USERNAME`, passwordEnv: `AMAZERTRANS_${suffix}_PASSWORD` };
}

/** Applies a POSTed config: rewrites users.config.json's structure, and upserts ONLY the .env keys for fields the tester actually changed (blank password = leave unchanged; username/branch/browser/enabled/label are never secret, so always written). */
function applyClientConfig(body) {
  const current = readUsersConfig();
  const currentById = new Map(current.users.map((u) => [u.id, u]));
  const envUpdates = {};

  const nextUsers = body.users.map((row) => {
    const existing = currentById.get(row.id);
    const { usernameEnv, passwordEnv } = envVarNamesFor(row.id, existing);
    if (row.username !== undefined && row.username !== '') envUpdates[usernameEnv] = row.username;
    if (row.password) envUpdates[passwordEnv] = row.password; // blank = "leave unchanged", never written
    return {
      id: row.id,
      label: row.label || row.id,
      enabled: !!row.enabled,
      usernameEnv,
      passwordEnv,
      branch: row.branch || '',
      environment: existing?.environment || 'default',
      browser: row.browser || 'chromium',
      ...(existing?.testMatch ? { testMatch: existing.testMatch } : {}),
    };
  });

  if (Object.keys(envUpdates).length) upsertEnvValues(ENV_PATH, envUpdates);

  const next = {
    ...current,
    defaultTestMatch: body.defaultTestMatch || current.defaultTestMatch,
    recommendedWorkers: body.recommendedWorkers || current.recommendedWorkers,
    users: nextUsers,
  };
  writeUsersConfig(next);
  require('dotenv').config({ path: ENV_PATH, override: true }); // re-read into process.env for this server's own subsequent /api/config reads
  return next;
}

function runMultiuser({ ids, workers }) {
  return new Promise((resolve) => {
    const args = [RUN_MULTIUSER];
    if (ids && ids.length) args.push(ids.join(','));
    if (workers) args.push(`--workers=${workers}`);
    const child = spawn('node', args, { cwd: ROOT, env: process.env, shell: true });
    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', (exitCode) => resolve({ exitCode, output }));
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url || '/').split('?')[0];

    if (req.method === 'GET' && url === '/api/config') {
      return sendJson(res, 200, toClientConfig(readUsersConfig()));
    }

    if (req.method === 'POST' && url === '/api/config') {
      const body = await readBody(req);
      const updated = applyClientConfig(body);
      return sendJson(res, 200, toClientConfig(updated));
    }

    if (req.method === 'POST' && url === '/api/run') {
      const body = await readBody(req);
      const result = await runMultiuser(body);
      return sendJson(res, 200, result);
    }

    // Static file serving for the config UI page itself.
    const relativePath = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const filePath = path.join(STATIC_DIR, relativePath);
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`Configuration screen: http://127.0.0.1:${port}`);
});

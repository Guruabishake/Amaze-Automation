#!/usr/bin/env node
/**
 * Minimal, careful .env line-editor: reads the real .env file (a plain KEY=VALUE-per-line format,
 * gitignored, holding real secrets), and can replace-or-append specific named keys WITHOUT
 * touching any other line - no comments, blank lines, or unrelated keys are ever reordered or
 * rewritten. This is the only thing the Configuration UI (scripts/config-ui.js) is allowed to do
 * to .env: update the exact usernameEnv/passwordEnv keys a users.config.json entry names, nothing
 * else, and only when the tester actually typed a new value for that field.
 */
const fs = require('fs');

function readEnvLines(envPath) {
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
}

/** Returns { [key]: value } for every KEY=VALUE line - used only to check whether a key is already set, never to expose values back over the wire wholesale. */
function readEnvValues(envPath) {
  const values = {};
  for (const line of readEnvLines(envPath)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/** Replaces (or appends) each `{key: value}` pair as its own line, preserving every other line exactly as-is. */
function upsertEnvValues(envPath, updates) {
  const lines = readEnvLines(envPath);
  const remainingKeys = new Set(Object.keys(updates));

  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && remainingKeys.has(match[1])) {
      const key = match[1];
      remainingKeys.delete(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Drop a single trailing blank line before appending, so repeated saves don't accumulate blanks.
  while (newLines.length && newLines[newLines.length - 1] === '') newLines.pop();

  for (const key of remainingKeys) {
    newLines.push(`${key}=${updates[key]}`);
  }
  newLines.push('');

  fs.writeFileSync(envPath, newLines.join('\n'));
}

module.exports = { readEnvValues, upsertEnvValues };

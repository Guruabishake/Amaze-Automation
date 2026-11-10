#!/usr/bin/env node
/**
 * Tester-facing control surface for the generic multi-user architecture (e2e/shared/multiUser +
 * e2e/AmazerTrans/config/users.config.json). A QA tester controls WHICH users run by editing that
 * plain JSON file (add/remove/enable/disable users, change branch/environment/browser) - never by
 * touching TypeScript - then uses this script to actually execute them:
 *
 *   node scripts/run-multiuser.js                    Run every ENABLED user in the config
 *   node scripts/run-multiuser.js user1,user3         Run only these users (explicit selection
 *                                                      overrides the config's enabled flag - a
 *                                                      deliberate override, not a bug)
 *   node scripts/run-multiuser.js --workers=2          Cap concurrency at 2, regardless of how
 *                                                      many users are selected/enabled
 *   node scripts/run-multiuser.js user1,user2 --workers=1   Both together
 *
 * Worker/session relationship (see e2e/shared/multiUser/buildUserProjects.ts): exactly one
 * Playwright project is generated per enabled user - never a fixed count - and Playwright's own
 * scheduler queues any users beyond the chosen --workers, it is not reimplemented here.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateAndOpenAllureReport } = require('./lib/allureReport');
require('dotenv').config();

const ROOT = process.cwd();
const AMAZERTRANS_DIR = path.join(ROOT, 'e2e', 'AmazerTrans');
const AMAZERTRANS_CONFIG = path.join(AMAZERTRANS_DIR, 'playwright.config.ts');
const USERS_CONFIG_PATH = path.join(AMAZERTRANS_DIR, 'config', 'users.config.json');
const ALLURE_RESULTS_DIR = path.join(ROOT, 'allure-results');
const ALLURE_REPORT_DIR = path.join(ROOT, 'allure-report');
const JSON_OUTPUT = path.join(ROOT, 'test-results', 'multiuser-run.json');

function parseArgs(argv) {
  let selectedIds = null;
  let workers = null;
  for (const arg of argv) {
    if (arg.startsWith('--workers=')) {
      workers = Number(arg.split('=')[1]);
    } else if (!arg.startsWith('--')) {
      selectedIds = arg.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return { selectedIds, workers };
}

const { selectedIds, workers: workerOverride } = parseArgs(process.argv.slice(2));

const usersConfig = JSON.parse(fs.readFileSync(USERS_CONFIG_PATH, 'utf-8'));
const allUsers = usersConfig.users || [];

const targetUsers = selectedIds
  ? allUsers.filter((u) => selectedIds.includes(u.id))
  : allUsers.filter((u) => u.enabled);

if (selectedIds) {
  const unknown = selectedIds.filter((id) => !allUsers.some((u) => u.id === id));
  if (unknown.length) {
    console.error(`Unknown user id(s) in users.config.json: ${unknown.join(', ')}`);
    process.exit(1);
  }
}
if (targetUsers.length === 0) {
  console.error('No users selected to run. Enable at least one user in e2e/AmazerTrans/config/users.config.json, or pass user ids explicitly (e.g. "user1,user2").');
  process.exit(1);
}

const workers = workerOverride || Math.min(targetUsers.length, usersConfig.recommendedWorkers || targetUsers.length);

console.log('\nMULTI-USER TEST EXECUTION\n');
console.log('User                 Enabled   Branch                     Browser    Credentials');
for (const u of allUsers) {
  const running = targetUsers.some((t) => t.id === u.id);
  const hasCreds = !!(process.env[u.usernameEnv] && process.env[u.passwordEnv]);
  const mark = running ? '-> ' : '   ';
  console.log(
    `${mark}${u.label.padEnd(18)} ${String(u.enabled).padEnd(9)} ${(u.branch || '-').padEnd(26)} ${(u.browser || 'chromium').padEnd(10)} ${hasCreds ? 'configured' : 'NOT CONFIGURED'}`
  );
}
console.log(`\nRunning: ${targetUsers.map((u) => u.label).join(', ')}`);
console.log(`Workers: ${workers} (${targetUsers.length} user(s) selected)\n`);

const projectArgs = targetUsers.flatMap((u) => ['--project', u.id]);
const testRun = spawnSync(
  'npx',
  [
    'playwright', 'test',
    `--config=${AMAZERTRANS_CONFIG}`,
    ...projectArgs,
    `--workers=${workers}`,
    '--reporter=list,json,allure-playwright',
  ],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUTPUT },
  }
);
const testExitCode = testRun.status ?? 1;

let stats = { passed: 0, failed: 0, skipped: 0, total: 0 };
try {
  const report = JSON.parse(fs.readFileSync(JSON_OUTPUT, 'utf-8'));
  const passed = (report.stats.expected || 0) + (report.stats.flaky || 0);
  const failed = report.stats.unexpected || 0;
  const skipped = report.stats.skipped || 0;
  stats = { passed, failed, skipped, total: passed + failed + skipped };
} catch (err) {
  console.warn(`[run-multiuser] Could not parse ${JSON_OUTPUT} for result counts: ${err.message}`);
}

console.log('\nTests:');
console.log(`Passed: ${stats.passed}`);
console.log(`Failed: ${stats.failed}`);
console.log(`Skipped: ${stats.skipped}`);
console.log(`Total: ${stats.total}\n`);

async function main() {
  await generateAndOpenAllureReport(ALLURE_RESULTS_DIR, ALLURE_REPORT_DIR);
  process.exit(testExitCode);
}

main();

#!/usr/bin/env node
/**
 * Runs ONE Playwright spec (never the full AmazerTrans suite), prints a clear execution summary
 * (the active configuration plus real pass/fail/skipped counts), then generates the Allure report
 * from that run's results and opens it in Google Chrome - so the user never needs to run
 * `allure serve`/`allure open` by hand after every run. See scripts/lib/allureReport.js for why
 * that report-serving step is a plain in-process Node http server rather than `allure open`.
 *
 * Usage: node scripts/run-with-allure.js <specPath> <ENQUIRY|QUOTATION|PRICING>
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateAndOpenAllureReport } = require('./lib/allureReport');
require('dotenv').config();

const [, , specPath, label = 'TEST'] = process.argv;
if (!specPath) {
  console.error('Usage: node scripts/run-with-allure.js <specPath> <ENQUIRY|QUOTATION|PRICING>');
  process.exit(1);
}

const ROOT = process.cwd();
const ALLURE_RESULTS_DIR = path.join(ROOT, 'allure-results');
const ALLURE_REPORT_DIR = path.join(ROOT, 'allure-report');
const JSON_OUTPUT = path.join(ROOT, 'test-results', `${label.toLowerCase()}-run.json`);

function printEnquiryConfig() {
  // The 4 required Service combinations (and their Shipment Direction/Mode) are fixed in code -
  // e2e/AmazerTrans/utils/testData.ts's ENQUIRY_SCENARIOS - not env-configured, so this just
  // states what always runs rather than reading env vars that no longer exist.
  console.log('\nENQUIRY TEST EXECUTION\n');
  console.log('Service Combinations (fixed, one Enquiry each, same Customer/Vendor/session):');
  console.log('  FF + CB       - Export / Sea');
  console.log('  CB + TMS      - Import / Air');
  console.log('  FF + TMS      - Export / Air');
  console.log('  FF + CB + TMS - Import / Sea\n');
}

function printQuotationConfig() {
  // Same fixed 4-combination Enquiries as ENQUIRY (see printEnquiryConfig) drive this run - one
  // Customer/Vendor/session, each processed through the full Quotation workflow to Initiate
  // Pricing. Only the per-section entry counts and upload files are env-configurable.
  console.log('\nQUOTATION TEST EXECUTION\n');
  console.log('Enquiries processed: FF+CB, CB+TMS, FF+TMS, FF+CB+TMS (fixed, one Customer/Vendor/session)\n');
  console.log(`Origin entries: ${process.env.QUOTATION_ORIGIN_COUNT || 5}`);
  console.log(`International entries: ${process.env.QUOTATION_INTERNATIONAL_COUNT || 5}`);
  console.log(`Destination entries: ${process.env.QUOTATION_DESTINATION_COUNT || 5}`);
  console.log(`Upload Files: ${process.env.QUOTATION_UPLOAD_FILES || 'sample.png,sample2.png (default)'}\n`);
}

function printPricingConfig() {
  // Runs the Enquiry -> Quotation setup first (FF+CB+TMS - one Customer/Vendor/session), then the
  // full Pricing List workflow on that same record - Margin, Buy/Sell Edit/Delete, Origin/
  // International/Destination, Summary, Upload, Update, View, Filter, Submit To Approval.
  console.log('\nPRICING TEST EXECUTION\n');
  console.log('Setup: Enquiry + Quotation (FF+CB+TMS, fixed, one Customer/Vendor/session) -> Pricing List\n');
  console.log(`Margin %: ${process.env.PRICING_MARGIN_PERCENT || '10'}\n`);
}

if (label === 'ENQUIRY') printEnquiryConfig();
else if (label === 'QUOTATION') printQuotationConfig();
else if (label === 'PRICING') printPricingConfig();

// 1. Run ONLY the requested spec - never the full suite, never Customer/Vendor/E2E regression.
// --config points at the AmazerTrans-specific config (e2e/AmazerTrans/playwright.config.ts), which
// hard-codes workers: 1 - every AmazerTrans spec logs into the SAME single account by default (the
// app enforces one active session per user), so two files must never run in parallel workers.
// --workers=1 is also passed explicitly here as defense-in-depth, not as the primary guarantee.
const AMAZERTRANS_CONFIG = path.join(ROOT, 'e2e', 'AmazerTrans', 'playwright.config.ts');
const testRun = spawnSync(
  'npx',
  ['playwright', 'test', specPath, `--config=${AMAZERTRANS_CONFIG}`, '--project=chromium', '--workers=1', '--reporter=list,json,allure-playwright'],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: JSON_OUTPUT },
  }
);
const testExitCode = testRun.status ?? 1;

// 2. Parse the real pass/fail/skip counts from Playwright's own JSON reporter output - never
//    guessed or scraped from free-text console output.
let stats = { passed: 0, failed: 0, skipped: 0, total: 0 };
try {
  const report = JSON.parse(fs.readFileSync(JSON_OUTPUT, 'utf-8'));
  const passed = (report.stats.expected || 0) + (report.stats.flaky || 0);
  const failed = report.stats.unexpected || 0;
  const skipped = report.stats.skipped || 0;
  stats = { passed, failed, skipped, total: passed + failed + skipped };
} catch (err) {
  console.warn(`[run-with-allure] Could not parse ${JSON_OUTPUT} for result counts: ${err.message}`);
}

console.log('Tests:');
console.log(`Passed: ${stats.passed}`);
console.log(`Failed: ${stats.failed}`);
console.log(`Skipped: ${stats.skipped}`);
console.log(`Total: ${stats.total}\n`);

// 3. Generate + serve + open the Allure report from this run's results.
async function main() {
  await generateAndOpenAllureReport(ALLURE_RESULTS_DIR, ALLURE_REPORT_DIR);
  // Preserve Playwright's own exit code - this wrapper must not mask a real test failure.
  process.exit(testExitCode);
}

main();

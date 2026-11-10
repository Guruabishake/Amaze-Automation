import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Anchored to this file's own location, not process.cwd() - a command run from any directory
// other than the repo root (e.g. e2e/AmazerTrans/tests) would otherwise silently scatter evidence
// into a new, wrong test-results folder instead of the repo-root one Playwright's own outputDir
// (see playwright.config.ts) and every existing diagnostic workflow already expect.
const EVIDENCE_ROOT = path.resolve(__dirname, '..', '..', '..', 'test-results', 'AmazerTrans-evidence');

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 80);
}

/** "2026-09-10_14-05-22-123" - sortable, filesystem-safe, millisecond-precision so rapid successive calls (loop iterations) never collide. */
function timestampForFilename(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

/**
 * Capitalizes the module name for use as both the evidence folder and filename prefix, e.g.
 * "enquiry" -> "Enquiry", "customer-vendor-e2e" -> "Customer-vendor-e2e".
 */
function screenName(module: string): string {
  const clean = sanitize(module);
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Captures a full-page screenshot, organized by screen/module name so evidence is easy to find:
 * "test-results/AmazerTrans-evidence/<Screen>/<Screen>_<date>_<time>_<action>-<identifier>.png".
 * The date-time-ms prefix guarantees repeated actions (loop iterations, retries) never overwrite
 * each other's evidence, while the action/identifier suffix keeps each file traceable to what it
 * captured. Shared by every module (Customer/Vendor/Enquiry/Quotation, success/failure) rather
 * than each having its own utility.
 */
export async function captureScreenshot(
  page: Page,
  module: string,
  action: string,
  identifier: string
): Promise<string> {
  const screen = screenName(module);
  const screenDir = path.join(EVIDENCE_ROOT, screen);
  fs.mkdirSync(screenDir, { recursive: true });
  const fileName = `${screen}_${timestampForFilename()}_${sanitize(action)}-${sanitize(identifier)}.png`;
  const filePath = path.join(screenDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

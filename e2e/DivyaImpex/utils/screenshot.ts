import { Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** One folder per execution so evidence from earlier runs is never overwritten. */
export const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
export const EVIDENCE_DIR = path.resolve(__dirname, '..', 'reports', 'evidence', RUN_ID);

/**
 * Saves a full-page screenshot as reports/evidence/<runId>/<name>.png and attaches it to the
 * Playwright HTML report for the current test.
 */
export async function captureEvidence(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const filePath = path.join(EVIDENCE_DIR, `${name.replace(/[^a-zA-Z0-9-_]+/g, '_')}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  await testInfo.attach(name, { path: filePath, contentType: 'image/png' });
  log(`evidence: ${path.relative(process.cwd(), filePath)}`);
  return filePath;
}

export function log(message: string) {
  console.log(`[DivyaImpex ${new Date().toISOString().slice(11, 19)}] ${message}`);
}

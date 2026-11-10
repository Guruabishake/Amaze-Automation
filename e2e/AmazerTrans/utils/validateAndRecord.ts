import { Page, test } from '@playwright/test';
import * as path from 'path';
import { captureScreenshot } from './screenshot';
import { DefectTracker } from './defectTracker';
import { FailureType, TransactionIdentifiers } from './validationModel';

/**
 * The safe validation helper this whole framework is built around. Every call:
 * 1. Runs inside its own `test.step()` (so Allure - already the configured reporter, see
 *    playwright.config.ts - shows one row per field, exactly like every other step already does
 *    throughout this suite).
 * 2. On success: records a PASS (expected/actual/timestamp/url) and adds a short Allure
 *    annotation - never throws.
 * 3. On failure: classifies it (via the caller-supplied `classifyFailure`, since only the caller
 *    knows what it just attempted - see validationModel.ts's own doc comment on why this is never
 *    automatic), captures a screenshot through the EXISTING `captureScreenshot` utility (same
 *    evidence folder every other module already uses), attaches it to the test result via
 *    `testInfo.attach` (the mechanism the allure-playwright reporter already picks up
 *    automatically), records a BugReport with a freshly-reserved bug id, and - critically - does
 *    NOT rethrow, so the caller's loop continues to the next field.
 *
 * Trace/video are NOT captured per-call: Playwright traces/records video continuously across the
 * WHOLE test, only finalizing trace.zip/video.webm once the test itself ends (confirmed via this
 * project's own playwright.config.ts: `trace/video: 'retain-on-failure'`) - there is no
 * per-assertion trace to attach mid-test. The caller is expected to only fail the overall test at
 * the end if real bugs were recorded (see DefectTracker.getSummary()), so "retain-on-failure"
 * naturally captures trace/video for the whole run whenever it ends with real defects - this
 * helper records the PREDICTABLE final path for both so a BugReport can still reference where
 * they will land, without fabricating that they exist before the test actually concludes.
 */
export interface ValidateAndRecordParams {
  tracker: DefectTracker;
  page: Page;
  module: string;
  feature: string;
  field: string;
  inputValue: string;
  expected: string;
  transaction: TransactionIdentifiers;
  /** Passed straight through to `captureScreenshot`'s own `module` param - the evidence subfolder name (e.g. 'combinedJob'). */
  screenshotModule: string;
  /** Performs the action AND the assertion, returning the real observed value on success; throws (any Error) on failure. Never call expect() elsewhere for this field - this is the one place the outcome is decided. */
  run: () => Promise<string>;
  /** Only the caller has enough context to say whether this was e.g. a FILTER_ISSUE vs an AUTOMATION_ISSUE - see validationModel.ts. */
  classifyFailure: (error: Error) => FailureType;
  /** Optional: real API endpoint/status observed for this validation (e.g. from a page-level response listener) - only attached when the caller actually has evidence, never fabricated. */
  getApiInfo?: () => { endpoint?: string; status?: number } | undefined;
}

function predictedArtifactPath(testInfo: ReturnType<typeof test.info>, fileName: string): string {
  return path.join(testInfo.outputDir, fileName);
}

export async function validateAndRecord(params: ValidateAndRecordParams): Promise<void> {
  const { tracker, page, module, feature, field, inputValue, expected, transaction, screenshotModule, run, classifyFailure, getApiInfo } = params;

  await test.step(`${module} - ${field}`, async () => {
    const testInfo = test.info();
    const timestamp = new Date().toISOString();

    try {
      const actual = await run();
      tracker.recordPass({ module, feature, field, inputValue, expected, actual, timestamp, url: page.url(), transaction });
      testInfo.annotations.push({ type: `PASS: ${field}`, description: `expected="${expected}" actual="${actual}"` });
    } catch (error) {
      const err = error as Error;
      const failureType = classifyFailure(err);
      const bugId = tracker.reserveBugId();
      const apiInfo = getApiInfo?.() ?? {};

      // Unique filename containing module/field/timestamp/bugId, per the evidence-collection
      // requirement - reuses the EXISTING captureScreenshot utility (same evidence folder/naming
      // convention as every other module), never a second, parallel screenshot mechanism.
      const sanitizedField = field.replace(/[^a-z0-9]+/gi, '-');
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await captureScreenshot(page, screenshotModule, `validation-failure-${sanitizedField}`, bugId);
      } catch {
        // A screenshot failure (e.g. the page/context already closed) must never itself hide the
        // real defect being recorded - the bug is still recorded below, just without a screenshot.
        screenshotPath = undefined;
      }

      const { bug } = tracker.recordFail(bugId, {
        module,
        feature,
        field,
        inputValue,
        expected,
        actual: 'N/A - see errorMessage',
        failureType,
        timestamp,
        url: page.url(),
        screenshot: screenshotPath,
        video: predictedArtifactPath(testInfo, 'video.webm'),
        trace: predictedArtifactPath(testInfo, 'trace.zip'),
        errorMessage: err.message,
        apiEndpoint: apiInfo.endpoint,
        apiStatus: apiInfo.status,
        transaction,
      });

      if (screenshotPath) {
        await testInfo.attach(`${bug.bugId} - ${field} - FAIL`, { path: screenshotPath, contentType: 'image/png' });
      }
      testInfo.annotations.push({
        type: `FAIL: ${field} [${bug.bugId}]`,
        description: `${failureType} - ${err.message.slice(0, 300)}`,
      });

      console.error(
        `Defect recorded\n` +
          `Bug: ${bug.bugId}\nModule: ${module}\nFeature: ${feature}\nField: ${field}\nType: ${failureType}\n` +
          `Input: ${inputValue}\nExpected: ${expected}\n` +
          `Error: ${err.message}\n` +
          (apiInfo.endpoint ? `API: ${apiInfo.endpoint} (status ${apiInfo.status})\n` : '') +
          `Screenshot: ${screenshotPath ?? '(unavailable)'}`
      );
      // Deliberately no rethrow - the caller's loop continues to the next field.
    }
  });
}

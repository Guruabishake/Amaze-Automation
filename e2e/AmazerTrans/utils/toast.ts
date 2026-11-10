import { Page, expect } from '@playwright/test';
import { captureScreenshot } from './screenshot';

/**
 * Real, confirmed-live toast mechanism used throughout the CB module (Stuffing Update, EIR
 * Received Save, Initiate Draft Invoice, Initiate Final, etc.): a single element with
 * `role="status"` - confirmed live via a full DOM scan of several real actions, never assumed.
 * (`role="alert"` also exists on this app's page but resolves to an unrelated element - "CB
 * Dashboard"/"Amazertrans" branding text, not a toast - confirmed live, not used here.)
 */
const TOAST_SELECTOR = '[role="status"]';

/**
 * Reads whatever toast text (if any) is CURRENTLY showing - callers snapshot this immediately
 * before triggering an action, then pass it as `excludeText` to `captureToastAndScreenshot` so a
 * still-lingering toast from the PREVIOUS action can never be mistaken for the new one.
 */
export async function currentToastText(page: Page): Promise<string | undefined> {
  const toast = page.locator(TOAST_SELECTOR).first();
  const visible = await toast.isVisible().catch(() => false);
  if (!visible) {
    return undefined;
  }
  // Explicit timeout: without one, a toast element that becomes detached/re-rendered right
  // between the visibility check above and this read can hang for the whole remaining test
  // budget instead of failing fast (a real, confirmed occurrence) - falls back to "" rather
  // than throwing since this function's own contract is "best-effort snapshot", not a hard check.
  return (await toast.innerText({ timeout: 5_000 }).catch(() => '')).trim();
}

/**
 * Waits for the real NEW toast to appear after an action, reads its text, prints it to the
 * terminal with a clear label, and attaches a screenshot (via the shared `captureScreenshot`
 * utility - no competing screenshot implementation). Returns the toast text so the caller can
 * assert on it.
 *
 * `excludeText` (from `currentToastText`, captured by the caller right before triggering the
 * action) guards against two real, confirmed-live failure modes seen on back-to-back actions with
 * no gap between them:
 *  - A blocking "wait for visible" alone can resolve INSTANTLY against a toast still left over
 *    from the immediately-preceding action (confirmed live: captured "Draft invoice generated
 *    successfully." - the PRIOR action's own message - for a later "Initiate Final Invoice" call).
 *  - Adding a preceding "wait for hidden" to fix that then risks the opposite failure on a fast
 *    action whose own toast can fully appear AND disappear inside that hidden-wait window,
 *    leaving nothing for the visible-wait to find at all (confirmed live: a genuine 20s timeout
 *    with zero toast ever observed for "EIR Received").
 * Polling for "visible AND text different from `excludeText`" (via `expect(...).toPass`) avoids
 * both: it never blocks on a transition that might already be missed, and it never accepts a
 * still-stale message.
 *
 * `actionName` is used both for the terminal label and the screenshot's own identifier, e.g.
 * `captureToastAndScreenshot(page, 'cb-export-sea', 'Stuffing Update')` prints:
 *   [CB Export Sea] [Stuffing Update] Toast: "Stuffing details updated successfully."
 */
export async function captureToastAndScreenshot(
  page: Page,
  module: string,
  actionName: string,
  excludeText?: string
): Promise<string> {
  const toast = page.locator(TOAST_SELECTOR).first();
  let text = '';
  await expect(async () => {
    const visible = await toast.isVisible({ timeout: 5_000 });
    expect(visible, 'toast not visible yet').toBeTruthy();
    const current = (await toast.innerText({ timeout: 5_000 })).trim();
    expect(current === excludeText, 'toast still shows the previous action\'s message').toBeFalsy();
    text = current;
  }).toPass({ timeout: 40_000 });
  console.log(`[CB Export Sea] [${actionName}] Toast: "${text}"`);
  await captureScreenshot(page, module, actionName.toLowerCase().replace(/\s+/g, '-'), 'toast');
  return text;
}

import { Page, Locator, expect } from '@playwright/test';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Field wrapper for DivyaImpex's home-grown inputs. Same widget family as AmazerTrans (adapted from
 * e2e/AmazerTrans/utils/commonActions.ts): the floating <label> is not associated to its control, so
 * the field is scoped by the "div.relative.group" wrapper that holds both.
 */
export function fieldByLabel(root: Page | Locator, page: Page, label: string): Locator {
  return root.locator('div.relative.group', { has: page.getByText(label, { exact: true }) }).first();
}

/**
 * Opens a custom combobox by its label and picks an option. Options render as plain <li> elements
 * (some dropdowns add a "Search..." box, some don't - both are handled). Verified on DivyaImpex:
 * Customer Type, Country, State, Shipment Mode/Direction/Type, Size/Type Of Container, UOM, Assigned
 * To and Document Type all use this widget.
 */
export async function selectCustomDropdown(
  page: Page,
  label: string,
  optionText: string,
  matchMode: 'exact' | 'contains' = 'exact',
  root: Page | Locator = page
) {
  const combo = fieldByLabel(root, page, label).getByRole('combobox');
  await combo.click();
  const searchBox = page.getByPlaceholder(/^Search/);
  if (await searchBox.first().isVisible().catch(() => false)) {
    await searchBox.first().fill(optionText);
  }
  const pattern = matchMode === 'exact' ? new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`) : new RegExp(escapeRegex(optionText), 'i');
  const option = page.locator('li').filter({ hasText: pattern }).first();
  await option.waitFor({ state: 'visible', timeout: 15000 });
  await option.click();
  await expect(combo).toContainText(optionText, { timeout: 10000 });
}

/** Reads every option a custom combobox currently offers, then closes it again (by re-clicking - Escape closes the surrounding modal). */
export async function readDropdownOptions(page: Page, label: string, root: Page | Locator = page): Promise<string[]> {
  const combo = fieldByLabel(root, page, label).getByRole('combobox');
  await combo.click();
  const items = page.locator('li');
  await items.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  const values = (await items.allInnerTexts()).map((v) => v.trim()).filter(Boolean);
  await combo.click();
  return values;
}

/** The app's toast region (role="status"); returns its text or '' if none appears in time. */
export async function readToast(page: Page, timeout = 8000): Promise<string> {
  const toast = page.getByRole('status').filter({ hasText: /\S/ }).last();
  try {
    await toast.waitFor({ state: 'visible', timeout });
    return (await toast.innerText()).trim();
  } catch {
    return '';
  }
}

/**
 * Runs an action and returns the toast THAT action produced. Toasts stack and linger for a few
 * seconds, so any toast already on screen is first allowed to clear - otherwise a previous step's
 * toast would be reported as this step's result.
 */
export async function actionToast(page: Page, action: () => Promise<void>, timeout = 20000): Promise<string> {
  const toasts = page.getByRole('status').filter({ hasText: /\S/ });
  await expect(toasts).toHaveCount(0, { timeout: 15000 }).catch(() => undefined);
  await action();
  return readToast(page, timeout);
}

/**
 * Verified live: the staging session can expire mid-run (observed after ~19-40 minutes), silently
 * bouncing any navigation back to the login page instead of the requested screen. Every list
 * navigation method calls this first so that case fails immediately with a clear message instead of
 * timing out deep inside an unrelated locator, or - worse - re-running a login and silently starting
 * a second session.
 */
export async function assertStillLoggedIn(page: Page) {
  const onLogin = await page.getByRole('button', { name: 'Login', exact: true }).isVisible().catch(() => false);
  if (onLogin) {
    throw new Error(`SESSION EXPIRED: the app returned to its login page instead of the requested screen (url: ${page.url()}). Re-run from login.`);
  }
}

export async function expandSection(page: Page, sectionHeading: string) {
  const heading = page.getByRole('heading', { name: sectionHeading, exact: true });
  await heading.scrollIntoViewIfNeeded();
  await heading.click();
}

import { Page, Locator, expect } from '@playwright/test';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The wrapper of the `nth` field whose floating label is exactly `label`. Verified on the Booking
 * Master, Update Job, CB SB and filter screens: labels are not associated to their controls, and the
 * same label can appear several times (e.g. three "Transhipment Port ETD", two "Mother Vessel"), so
 * repeated fields are addressed by their DOM order (`nth`), never by overwriting the first match.
 */
/**
 * Elements whose own text is exactly `label`, excluding table headers/cells and list options - a label
 * such as "Document Type" also appears as a column header in the upload tables below the field.
 */
export function labelElements(scope: Page | Locator, label: string): Locator {
  const lit = label.includes('"') ? `'${label}'` : `"${label}"`;
  const byOwnText = scope.locator(
    `xpath=.//*[not(self::th) and not(self::td) and not(self::li) and not(self::option) and not(self::button) and not(ancestor::th) and not(ancestor::td) and normalize-space(text())=${lit}]`
  );
  // Some labels (verified live on Initiate SB: Invoice Date, CIN No., CIN Dt) are not matched by their first
  // text node alone - also match a <label> whose whole text is the label.
  const byLabelElement = scope.locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`) });
  return byOwnText.or(byLabelElement);
}

/**
 * The wrapper of the `nth` field whose floating label is exactly `label`. When the match is a <label>
 * element, its own immediate parent is the field's wrapper (every field here is
 * "<div class='relative group'><div>...control...</div><label>text</label></div>") - preferred over
 * climbing ancestors by predicate, which can skip past a control that has not finished mounting yet
 * and land on an outer container holding a DIFFERENT field's control instead (confirmed live on
 * Vendor Bill's "Child Job No.", two fields sharing a grid ancestor). Async, so callers must await it.
 */
export async function fieldWrapper(scope: Page | Locator, label: string, nth = 0): Promise<Locator> {
  const asLabel = scope.locator('label').filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`) }).nth(nth);
  if ((await asLabel.count()) > 0) return asLabel.locator('xpath=..');
  return labelElements(scope, label)
    .nth(nth)
    .locator('xpath=ancestor::div[.//input[not(@type="hidden") and not(@type="file")] or .//*[@role="combobox"] or .//button][1]');
}

/** dd-mm-yyyy / dd/mm/yyyy (what the UI displays) -> yyyy-mm-dd (what <input type=date> accepts). */
export function toIsoDate(display: string): string {
  const m = display.trim().match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : display.trim();
}

export function isoDateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type FieldMode = 'text' | 'date' | 'dropdown';

export interface FieldOutcome {
  label: string;
  nth: number;
  mode: FieldMode | 'absent' | 'disabled' | 'no-options';
  value: string;
  note?: string;
}

/**
 * Sets one labelled field, adapting to the real control behind the label:
 * - an editable <input> (text, date, or an <input list=...> autocomplete) is filled - dates as yyyy-mm-dd;
 * - a div[role=combobox]/button dropdown is opened, searched when it offers a search box, and the
 *   option whose text equals `value` (or contains it, with `contains`) is clicked.
 * A missing, disabled or option-less control is reported in the outcome - never forced or faked.
 */
export async function setField(
  page: Page,
  scope: Page | Locator,
  label: string,
  value: string,
  opts: { nth?: number; contains?: boolean } = {}
): Promise<FieldOutcome> {
  const nth = opts.nth ?? 0;
  const labels = labelElements(scope, label);
  // Forms render progressively after navigation (verified live on Initiate SB: fields reported absent while
  // the form was still loading) - give the field a few seconds to appear before calling it absent.
  await expect.poll(() => labels.count(), { timeout: 5000 }).toBeGreaterThan(nth).catch(() => undefined);
  if ((await labels.count()) <= nth) return { label, nth, mode: 'absent', value };
  const wrapper = await fieldWrapper(scope, label, nth);
  await wrapper.scrollIntoViewIfNeeded();
  const dropdown = wrapper.locator('div[role="combobox"], button[role="combobox"]').first();
  const plainInput = wrapper.locator('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])').first();
  const hasDropdown = (await dropdown.count()) > 0;
  const hasInput = (await plainInput.count()) > 0;

  if (!hasDropdown && hasInput) {
    if (!(await plainInput.isEditable())) return { label, nth, mode: 'disabled', value: await plainInput.inputValue() };
    const type = await plainInput.getAttribute('type');
    const v = type === 'date' ? toIsoDate(value) : value;
    await plainInput.fill(v);
    await expect(plainInput).toHaveValue(v);
    return { label, nth, mode: type === 'date' ? 'date' : 'text', value: v };
  }

  const trigger = hasDropdown ? dropdown : wrapper.getByRole('button').first();
  if (!(await trigger.isEnabled())) return { label, nth, mode: 'disabled', value };
  // Option lists render as a fixed-position panel under the field; near the bottom of the viewport
  // they fall outside it (verified live: Update Job "Liner"), so centre the field before opening.
  await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await trigger.click();
  const searchBox = page.getByPlaceholder(/^Search/).first();
  if (await searchBox.isVisible().catch(() => false)) await searchBox.fill(value);
  // Case-insensitive: some lists show upper-case labels (verified live: Initiate SB offers "NO" for Customs Examination, PQ, FSSAI, Fumigation).
  const pattern = opts.contains ? new RegExp(escapeRegex(value), 'i') : new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'i');
  const option = page.locator('li').filter({ hasText: pattern }).first();
  const found = await option.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
  if (!found) {
    const shown = (await page.locator('li').allInnerTexts()).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    await trigger.click().catch(() => undefined);
    return { label, nth, mode: 'no-options', value, note: `option "${value}" not offered; list showed: ${shown.join(' | ') || '(nothing)'}` };
  }
  // A list still rendered outside the viewport cannot receive a pointer click - dispatch the click instead.
  await option.click({ timeout: 5000 }).catch(() => option.dispatchEvent('click'));
  await expect(trigger).toContainText(new RegExp(escapeRegex(value), 'i'), { timeout: 10000 });
  return { label, nth, mode: 'dropdown', value };
}

/** Reads what a labelled field currently shows (input value, or the dropdown's displayed text). */
export async function readField(scope: Page | Locator, label: string, nth = 0): Promise<string> {
  const wrapper = await fieldWrapper(scope, label, nth);
  const input = wrapper.locator('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])').first();
  const dropdown = wrapper.locator('[role="combobox"]').first();
  const button = wrapper.getByRole('button').first();
  if ((await dropdown.count()) > 0) return (await dropdown.innerText()).trim();
  if ((await input.count()) > 0) return (await input.inputValue()).trim();
  if ((await button.count()) > 0) return (await button.innerText()).trim();
  return '';
}

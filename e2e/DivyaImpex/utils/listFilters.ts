import { Page, Locator, TestInfo, expect } from '@playwright/test';
import { setField, readField } from './formFields';
import { captureEvidence, log } from './screenshot';
import { recordDefect } from './defects';

export interface FilterCase {
  /** Exact label of the control in the Filter panel. */
  label: string;
  /** Value to enter; dates may be given as dd-mm-yyyy (converted for <input type=date>). */
  value: string;
  /** Set when the field cannot be tested with this record's data - recorded as NOT TESTABLE with this reason. */
  notTestable?: string;
  /** Option matched by "contains" instead of exact text (dropdowns). */
  contains?: boolean;
}

export interface FilterResult {
  screen: string;
  field: string;
  value: string;
  status: 'PASS' | 'FAIL' | 'INTERMITTENT' | 'NOT TESTABLE';
  expected: string;
  actual: string;
  resetCleared: boolean | null;
  evidence: string;
  /** What each attempt saw (a failed case is repeated once to tell a reproducible failure from an intermittent one). */
  attempts: string[];
}

export interface FilterScreen {
  name: string;
  module: string;
  /** Opens the list screen fresh (used before each case so every field is tested from the default list). */
  open: () => Promise<void>;
  /** The current execution's row - must be unique (e.g. matched by the Reference Invoice No). */
  targetRow: () => Locator;
}

const RECORDS = /^\s*\d+(\s+of\s+\d+)?\s+records\s*$/;
const EXPECTED = 'the current record is listed and the list is filtered ("N of M records")';

function panel(page: Page): Locator {
  return page.locator('div').filter({ has: page.getByRole('button', { name: 'close-filter-popup' }) }).filter({ has: page.getByRole('button', { name: 'Search', exact: true }) }).last();
}

async function recordsText(page: Page): Promise<string> {
  const t = page.getByText(RECORDS).first();
  if (await t.isVisible().catch(() => false)) return (await t.innerText()).trim();
  const none = page.getByText(/No data matches/i).first();
  return (await none.isVisible().catch(() => false)) ? 'No data matches your filter criteria.' : '';
}

async function panelOpen(page: Page): Promise<boolean> {
  return page.getByRole('button', { name: 'Search', exact: true }).isVisible().catch(() => false);
}

async function openPanel(page: Page) {
  if (!(await panelOpen(page))) await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
}

/** The panel is a modal; while open it blocks the rest of the page (sidebar, toolbar Reset). */
async function closePanel(page: Page) {
  if (await panelOpen(page)) {
    await page.getByRole('button', { name: 'close-filter-popup' }).click();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeHidden();
  }
}

/**
 * Verified live (Booking Master Job List): after Search the panel closes and a toolbar "Reset" appears
 * next to Filter; the panel has its own Reset too. Use whichever is reachable.
 */
async function clickReset(page: Page) {
  if (await panelOpen(page)) {
    await panel(page).getByRole('button', { name: 'Reset', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  }
}

interface Attempt {
  status: 'PASS' | 'FAIL' | 'NOT TESTABLE';
  actual: string;
  evidence: string;
  resetCleared: boolean | null;
}

/** One pass of: open default list -> enter the value -> Search -> judge -> evidence -> Reset -> judge. Never records defects itself. */
async function runAttempt(page: Page, testInfo: TestInfo, screen: FilterScreen, c: FilterCase, slug: string): Promise<Attempt> {
  let status: Attempt['status'] = 'PASS';
  let actual = '';
  let evidence = '';
  let resetCleared: boolean | null = null;
  try {
    await closePanel(page);
    await screen.open();
    await openPanel(page);
    const outcome = await setField(page, panel(page), c.label, c.value, { contains: c.contains });
    if (outcome.mode === 'absent' || outcome.mode === 'disabled' || outcome.mode === 'no-options') {
      status = 'NOT TESTABLE';
      actual = `field ${outcome.mode}${outcome.note ? `: ${outcome.note}` : ''}`;
    } else {
      // Seen live: a value typed right after the list loads can be wiped by a late re-render, and Search then
      // runs unfiltered. Confirm the value is still in the field (typed fields only) before searching.
      if (outcome.mode === 'text' || outcome.mode === 'date') {
        let shown = await readField(panel(page), c.label);
        if (shown !== outcome.value) {
          await setField(page, panel(page), c.label, c.value);
          shown = await readField(panel(page), c.label);
        }
        expect(shown, `"${c.label}" must still hold the typed value when Search is clicked`).toBe(outcome.value);
      }
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect.poll(() => recordsText(page), { timeout: 20000 }).toMatch(/of\s+\d+\s+records|^0 records|No data/);
      // The count can briefly show the previous/unfiltered state before the filtered rows render
      // (seen live: a transient "6 of 6" before "1 of 6"). Let the request finish and give the target row
      // a chance to appear before judging - a filter that really excludes the record still fails below.
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      await screen.targetRow().waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      const count = await recordsText(page);
      const found = await screen.targetRow().isVisible().catch(() => false);
      const noData = await page.getByText(/No data (matches|found)/i).first().isVisible().catch(() => false);
      actual = `${found ? 'record listed' : 'record NOT listed'}; ${count || (noData ? 'no data shown' : 'no record count shown')}`;
      if (!found || !/of\s+\d+\s+records/.test(count)) status = 'FAIL';
    }
    evidence = await captureEvidence(page, testInfo, slug);

    // Reset: the field must be cleared and the full list restored.
    await clickReset(page);
    await closePanel(page);
    await expect.poll(() => recordsText(page), { timeout: 20000 }).toMatch(/^\d+ records$/);
    await openPanel(page);
    const after = await readField(panel(page), c.label);
    await closePanel(page);
    resetCleared = after === '' || /^(All|Select.*)$/i.test(after);
    if (!resetCleared) {
      status = status === 'PASS' ? 'FAIL' : status;
      actual += `; after Reset the field still shows "${after}"`;
    }
  } catch (error) {
    status = 'FAIL';
    actual = `error: ${(error as Error).message.split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '')}`;
    evidence = evidence || (await captureEvidence(page, testInfo, `${slug}-error`).catch(() => ''));
    // Leave the page usable for the next attempt: a modal left open blocks every later click.
    await closePanel(page).catch(() => page.keyboard.press('Escape'));
  }
  return { status, actual, evidence, resetCleared };
}

/**
 * Tests each filter field on its own. A failing case is repeated once, so a reproducible failure can be told
 * from an intermittent one: fails twice -> FAIL (defect); fails then passes -> INTERMITTENT (defect entry,
 * low severity, both attempts recorded, does not fail the run); passes -> PASS. The next field is always tested.
 */
export async function testFilters(page: Page, testInfo: TestInfo, screen: FilterScreen, cases: FilterCase[]): Promise<FilterResult[]> {
  const results: FilterResult[] = [];
  for (const c of cases) {
    const slug = `filter-${screen.name}-${c.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (c.notTestable) {
      results.push({ screen: screen.name, field: c.label, value: c.value, status: 'NOT TESTABLE', expected: '-', actual: c.notTestable, resetCleared: null, evidence: '', attempts: [] });
      log(`filter ${screen.name} / ${c.label}: NOT TESTABLE (${c.notTestable})`);
      continue;
    }
    const first = await runAttempt(page, testInfo, screen, c, slug);
    const attempts = [`attempt 1: ${first.status} - ${first.actual}`];
    let final: Attempt = first;
    let status: FilterResult['status'] = first.status;
    if (first.status === 'FAIL') {
      const second = await runAttempt(page, testInfo, screen, c, `${slug}-retry`);
      attempts.push(`attempt 2: ${second.status} - ${second.actual}`);
      if (second.status === 'PASS') {
        status = 'INTERMITTENT';
        final = { ...second, evidence: first.evidence };
      } else {
        final = second;
      }
    }
    const actual = status === 'INTERMITTENT' ? attempts.join(' | ') : final.actual;
    results.push({ screen: screen.name, field: c.label, value: c.value, status, expected: EXPECTED, actual, resetCleared: final.resetCleared, evidence: final.evidence, attempts });
    log(`filter ${screen.name} / ${c.label} = "${c.value}": ${status} (${actual})`);
    if (status === 'FAIL' || status === 'INTERMITTENT') {
      const isError = final.actual.startsWith('error:');
      await recordDefect(testInfo, {
        module: screen.module,
        screen: screen.name,
        fieldOrAction: `Filter: ${c.label}`,
        input: c.value,
        expected: EXPECTED,
        actual,
        evidence: final.evidence,
        url: page.url(),
        severity: status === 'INTERMITTENT' ? 'Low' : 'Medium',
        reproducibility: status === 'INTERMITTENT' ? 'Intermittent - failed once, passed on the immediate retry (cause undetermined)' : 'Reproduced on the immediate retry',
        classification: status === 'INTERMITTENT' ? 'environment issue' : isError ? 'automation issue' : 'application defect',
        error: isError ? final.actual : undefined,
      });
    }
  }
  await screen.open();
  return results;
}

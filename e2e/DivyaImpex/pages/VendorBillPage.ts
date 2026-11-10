import { Page, Locator, expect } from '@playwright/test';
import { assertStillLoggedIn } from '../utils/commonActions';
import { actionToast } from '../utils/commonActions';
import { setField, readField, fieldWrapper, FieldOutcome } from '../utils/formFields';

/**
 * CB -> CB - Export Sea -> Vendor Bill (/cb/vendorBill, heading "Vendor Bills") and "Create Vendor Bill"
 * (/cb/vendorBillForm). Verified live on DivyaImpex (2026-10-23):
 * - List columns: Child Job No. / Booking Job No. / Invoice / Document Reference No. / Customer Name / Vendor Bill No /
 *   Vendor Name / Grand Total / Actions (icons).
 * - Create form: a "Vendor Bill Filters" block (Field Name: Container Number | SB No., Search text, Search/Reset), then
 *   Vendor Name and Child Job No. (dropdowns), Vendor ID, Vendor GST, Company GST (dropdowns), Vendor Bill No,
 *   Vendor Bill Date, "+ Add New" for charge lines (with CGST/SGST/IGST/TDS columns) and a totals block; Cancel / Create.
 */
export class VendorBillPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly createHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Vendor Bills', exact: true });
    this.createHeading = page.getByRole('heading', { name: 'Create Vendor Bill', exact: true });
  }

  async navigateList() {
    await assertStillLoggedIn(this.page);
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Vendor Bill', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    await link.click();
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  rowsForChildJob(childJobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(childJobNo, { exact: true }) });
  }

  async rowValues(childJobNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
    const cells = (await this.rowsForChildJob(childJobNo).first().locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  async openCreate() {
    await this.page.getByRole('button', { name: /create/i }).first().click();
    await expect(this.createHeading).toBeVisible();
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  }

  async options(label: string): Promise<string[]> {
    // Uses the (fieldWrapper-based) label-parent lookup, not commonActions' div.relative.group climb -
    // confirmed live that climb can land on a sibling field's control on this form (see fieldWrapper's own comment).
    // Verified live: Vendor Name uses a div[role="combobox"], but Child Job No. uses a plain <button> with
    // no role attribute at all - match either, same fallback setField() already relies on.
    const field = await fieldWrapper(this.page, label);
    const roled = field.locator('[role="combobox"]').first();
    const combo = (await roled.count()) > 0 ? roled : field.getByRole('button').first();
    await combo.click();
    await expect.poll(() => this.page.locator('li').filter({ hasNotText: /no results/i }).count(), { timeout: 10000 }).toBeGreaterThan(0).catch(() => undefined);
    const texts = (await this.page.locator('li').filter({ hasNotText: /no results/i }).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await combo.click();
    return texts;
  }

  async select(label: string, value: string, contains = false): Promise<FieldOutcome> {
    return setField(this.page, this.page, label, value, { contains });
  }

  /** Current displayed value of every identity field on the form. */
  async readIdentity(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const l of ['Vendor Name', 'Child Job No.', 'Vendor ID', 'Vendor GST', 'Company GST', 'Vendor Bill No', 'Vendor Bill Date']) {
      out[l] = (await readField(this.page, l)).trim();
    }
    return out;
  }

  linesTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Total INR Incl. Taxes', exact: true }) });
  }

  lineRows(): Locator {
    return this.linesTable().locator('tbody tr').filter({ hasNotText: 'No data' });
  }

  async readLines(): Promise<Record<string, string>[]> {
    const headers = (await this.linesTable().locator('thead th').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim());
    const rows = this.lineRows();
    const out: Record<string, string>[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await rows.nth(i).locator('td').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
      const r: Record<string, string> = {};
      headers.forEach((h, j) => (r[h] = cells[j] ?? ''));
      out.push(r);
    }
    return out;
  }

  async readTotals(): Promise<Record<string, string>> {
    const rows = this.page.getByRole('table').filter({ has: this.page.getByText('Grand Total', { exact: true }) }).locator('tr');
    const out: Record<string, string> = {};
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await rows.nth(i).locator('td').allInnerTexts()).map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) out[cells[0]] = cells[cells.length - 1];
    }
    return out;
  }

  async fillBill(billNo: string, dateIso: string): Promise<FieldOutcome[]> {
    return [await setField(this.page, this.page, 'Vendor Bill No', billNo), await setField(this.page, this.page, 'Vendor Bill Date', dateIso)];
  }

  hasField(label: string): Promise<boolean> {
    return fieldWrapper(this.page, label).then((w) => w.count()).then((n) => n > 0);
  }

  async submitCreate(): Promise<string> {
    return actionToast(this.page, () => this.page.getByRole('button', { name: 'Create', exact: true }).last().click(), 30000);
  }
}

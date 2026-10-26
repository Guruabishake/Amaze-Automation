import { Page, Locator, expect } from '@playwright/test';
import { assertStillLoggedIn } from '../utils/commonActions';
import { actionToast } from '../utils/commonActions';
import { setField, FieldOutcome } from '../utils/formFields';

/**
 * Shipping Bill (CB -> CB - Export Sea -> Shipping Bill, /cb/shippingBill) and the Initiate SB form.
 * Verified live on DivyaImpex (2026-10-22): list columns Child Job No. / Booking Job No. / Document
 * Reference No. / BL/Invoice No. / Invoice Date / LEO No / Container No / Port of Loading / Port of
 * Discharge; row actions "View", "Edit" and "Initiate Stuffing" (-> "Stuffing Initiated", disabled).
 * This is the screen that shows a Child Job together with its Booking Job No.
 */
export class ShippingBillPage {
  readonly page: Page;
  readonly listHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Shipping Bill', exact: true });
  }

  async navigate() {
    await assertStillLoggedIn(this.page);
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Shipping Bill', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    await link.click();
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  row(referenceInvoiceNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(referenceInvoiceNo, { exact: true }) }).first();
  }

  async rowValues(referenceInvoiceNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
    const cells = (await this.row(referenceInvoiceNo).locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  /** Fills the Initiate SB ("Create Shipping Bill") form field by field; absent fields are reported, not invented. */
  async fillInitiateSB(values: Array<{ label: string; value: string; contains?: boolean }>): Promise<FieldOutcome[]> {
    const out: FieldOutcome[] = [];
    // The form hydrates after the heading appears: wait for the pre-filled SB No. and for the last field to exist.
    await expect(this.page.locator('#sb_no'), 'Initiate SB form should be pre-filled from the CB job').not.toHaveValue('', { timeout: 20000 });
    await expect(this.page.locator('#leo_date')).toBeAttached({ timeout: 20000 });
    for (const v of values) out.push(await setField(this.page, this.page, v.label, v.value, { contains: v.contains }));
    return out;
  }

  async submitCreate(): Promise<string> {
    return actionToast(this.page, () => this.page.getByRole('button', { name: 'Create', exact: true }).last().click(), 30000);
  }

  async openView(referenceInvoiceNo: string) {
    await this.row(referenceInvoiceNo).getByRole('button', { name: 'View', exact: true }).click();
    await expect(this.listHeading).toBeHidden();
  }

  async openEdit(referenceInvoiceNo: string) {
    await this.row(referenceInvoiceNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
  }

  async back() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(this.listHeading).toBeVisible();
  }

  async submitUpdate(): Promise<string> {
    return actionToast(this.page, () => this.page.getByRole('button', { name: 'Update', exact: true }).last().click(), 30000);
  }

  /** All values currently shown in the form's inputs, keyed by their visible label (for consistency checks). */
  async formSnapshot(): Promise<Record<string, string>> {
    return this.page.evaluate(() => {
      const out: Record<string, string> = {};
      document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea').forEach((el) => {
        const input = el as HTMLInputElement;
        const label = (input.id && document.querySelector(`label[for="${input.id}"]`)?.textContent) || input.placeholder || input.name;
        if (label) out[label.trim()] = input.value;
      });
      return out;
    });
  }

  async stuffingAction(referenceInvoiceNo: string): Promise<string> {
    const b = this.row(referenceInvoiceNo).getByRole('button', { name: /Stuffing/ }).first();
    return (await b.isVisible().catch(() => false)) ? (await b.innerText()).trim() : '';
  }

  async clickInitiateStuffing(referenceInvoiceNo: string) {
    await this.row(referenceInvoiceNo).getByRole('button', { name: 'Initiate Stuffing', exact: true }).click();
  }
}

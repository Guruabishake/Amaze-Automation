import { Page, Locator, expect } from '@playwright/test';
import { assertStillLoggedIn } from '../utils/commonActions';
import { actionToast } from '../utils/commonActions';
import { setField, readField, fieldWrapper, FieldOutcome } from '../utils/formFields';

export interface InvoiceLineChoice {
  descriptionPreference: string[];
  uomPreference: string[];
  qty: string;
  rate: string;
  currency: string;
}

export type InvoiceLine = Record<string, string>;

/**
 * CB -> CB - Export Sea -> Draft Invoice (/cb/draftInvoice). Verified live on DivyaImpex (2026-10-23):
 * - List columns: Child Job No. / Booking Job No. / Document Reference No. / Invoice No. (DRAFT-INV-CB-nnnnnn) /
 *   Invoice/BL No. / Invoice Date / Shipper / Consignee / Status / Actions (View icon, Edit icon).
 * - View ("View More") is read-only with Back. Edit ("Draft Invoice - Edit") has No of Invoice Copies, the shipment fields,
 *   "+ Add New" for invoice lines and Cancel / Update.
 * - The "+ Add New" dialog: Description, UOM, Currency are dropdowns; Qty and Rate are typed; HSN/SAC Code, Exchange Rate,
 *   Value in INR, Taxable and Non Taxable are disabled and filled in by the app. Buttons Cancel / Add.
 */
export class DraftInvoicePage {
  readonly page: Page;
  readonly listHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Draft Invoice', exact: true });
  }

  async navigateList() {
    await assertStillLoggedIn(this.page);
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Draft Invoice', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    await link.click();
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  row(childJobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(childJobNo, { exact: true }) }).first();
  }

  async rowCountFor(childJobNo: string): Promise<number> {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(childJobNo, { exact: true }) }).count();
  }

  async rowValues(childJobNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
    const cells = (await this.row(childJobNo).locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  async invoiceNoFor(childJobNo: string): Promise<string> {
    await expect(this.row(childJobNo), `Draft Invoice for ${childJobNo} should be listed`).toBeVisible({ timeout: 30000 });
    const m = (await this.row(childJobNo).innerText()).match(/DRAFT-INV-CB-\d+/);
    expect(m, `Draft Invoice No should be shown for ${childJobNo}`).not.toBeNull();
    return m![0];
  }

  async openView(childJobNo: string) {
    await this.row(childJobNo).getByRole('button').nth(0).click();
    await expect(this.page.getByRole('heading', { name: 'View More', exact: true })).toBeVisible();
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  }

  async openEdit(childJobNo: string) {
    await this.row(childJobNo).getByRole('button').nth(1).click();
    await expect(this.page.getByRole('heading', { name: 'Draft Invoice - Edit', exact: true })).toBeVisible();
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  }

  async back() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(this.listHeading).toBeVisible();
  }

  /** Header fields shown on View/Edit, keyed by their label. */
  async readHeader(labels: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const l of labels) {
      const box = this.page.getByRole('textbox', { name: l, exact: true });
      out[l] = (await box.count()) ? (await box.first().inputValue()).trim() : '(not present)';
    }
    return out;
  }

  async setCopies(value: string): Promise<FieldOutcome> {
    const outcome = await setField(this.page, this.page, 'No of Invoice Copies', value);
    expect(outcome.mode, `No of Invoice Copies must be editable (${outcome.note ?? outcome.mode})`).toBe('text');
    await expect(this.page.getByRole('textbox', { name: 'No of Invoice Copies', exact: true })).toHaveValue(value);
    return outcome;
  }

  linesTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'HSN/SAC Code', exact: true }) });
  }

  lineRows(): Locator {
    return this.linesTable().locator('tbody tr').filter({ hasNotText: 'No data' });
  }

  async readLines(): Promise<InvoiceLine[]> {
    const headers = (await this.linesTable().locator('thead th').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim());
    const rows = this.lineRows();
    const out: InvoiceLine[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await rows.nth(i).locator('td').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
      const r: InvoiceLine = {};
      headers.forEach((h, j) => (r[h] = cells[j] ?? ''));
      out.push(r);
    }
    return out;
  }

  /** Opens a dropdown, returns its option texts, closes it again. */
  private async optionsOf(label: string): Promise<string[]> {
    const combo = (await fieldWrapper(this.page, label)).locator('div[role="combobox"], button[role="combobox"]').first();
    await combo.click();
    // The list can fill in a moment after opening - poll for real options ("No results found" is not one).
    const real = () => this.page.locator('li').filter({ hasNotText: /no results/i });
    await expect.poll(async () => real().count(), { timeout: 6000 }).toBeGreaterThan(0).catch(() => undefined);
    const texts = (await real().allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await combo.click();
    return texts;
  }

  /** First option that matches a preference (case-insensitive "contains"), else the first offered option. */
  private async pick(label: string, preference: string[]): Promise<string> {
    const options = await this.optionsOf(label);
    expect(options.length, `"${label}" should offer at least one option`).toBeGreaterThan(0);
    const chosen = preference.map((p) => options.find((o) => o.toLowerCase().includes(p.toLowerCase()))).find(Boolean) ?? options[0];
    const outcome = await setField(this.page, this.page, label, chosen);
    expect(outcome.mode, `"${label}" = "${chosen}" (${outcome.note ?? outcome.mode})`).toBe('dropdown');
    return chosen;
  }

  /**
   * Adds one invoice line through "+ Add New" -> dialog -> "Add". Value in INR is computed by the app: it must equal
   * Qty x Rate x Exchange Rate (the app rounds to 2 decimals). Taxable and Non Taxable are read as the app set them.
   */
  async addLine(c: InvoiceLineChoice): Promise<{ chosen: Record<string, string>; auto: Record<string, string>; row: InvoiceLine }> {
    const before = await this.lineRows().count();
    await this.page.getByRole('button', { name: /Add New/ }).click();
    const addButton = this.page.getByRole('button', { name: 'Add', exact: true });
    await expect(addButton).toBeVisible();
    const description = await this.pick('Description', c.descriptionPreference);
    await expect(this.page.getByRole('textbox', { name: 'HSN/SAC Code', exact: true }), 'HSN/SAC Code is filled by the app').not.toHaveValue('', { timeout: 15000 });
    // Verified live: choosing a Description fills UOM from the charge master (e.g. "Shipment"). Keep that value; only
    // pick one when the app left UOM empty.
    const autoUom = (await readField(this.page, 'UOM')).trim();
    const uom = autoUom && !/^uom$/i.test(autoUom) ? autoUom : await this.pick('UOM', c.uomPreference);
    await this.page.getByRole('textbox', { name: 'Qty', exact: true }).fill(c.qty);
    await this.page.getByRole('textbox', { name: 'Rate', exact: true }).fill(c.rate);
    const currencyOutcome = await setField(this.page, this.page, 'Currency', c.currency);
    expect(currencyOutcome.mode, `Currency "${c.currency}" (${currencyOutcome.note ?? currencyOutcome.mode})`).toBe('dropdown');
    const val = async (name: string) => (await this.page.getByRole('textbox', { name, exact: true }).inputValue()).trim();
    await expect(this.page.getByRole('textbox', { name: 'Value in INR', exact: true })).not.toHaveValue('', { timeout: 15000 });
    const auto = {
      hsn: await val('HSN/SAC Code'),
      exchangeRate: await val('Exchange Rate'),
      valueInInr: await val('Value in INR'),
      taxable: await val('Taxable'),
      nonTaxable: await val('Non Taxable'),
    };
    const expected = Number(c.qty) * Number(c.rate) * Number(auto.exchangeRate);
    expect(Number(auto.valueInInr), `Value in INR for ${c.qty} x ${c.rate} x ${auto.exchangeRate}`).toBeCloseTo(expected, 1);
    await addButton.click();
    await expect(addButton, 'Add dialog should close after Add').toBeHidden({ timeout: 15000 });
    await expect(this.lineRows()).toHaveCount(before + 1);
    const row = (await this.readLines())[before];
    // The dropdown label carries a ledger suffix ("Documentation Charges-Operating Incomes (CB)"); the table shows the short name.
    expect(row['Description']).toContain(description.replace(/s*-s*(Direct|Indirect|Operating) Incomes.*$/i, '').trim());
    return { chosen: { description, uom, qty: c.qty, rate: c.rate, currency: c.currency }, auto, row };
  }

  async submitUpdate(): Promise<string> {
    const toast = await actionToast(this.page, () => this.page.getByRole('button', { name: 'Update', exact: true }).last().click(), 30000);
    await expect(this.listHeading, 'Update should return to the Draft Invoice list').toBeVisible({ timeout: 30000 });
    return toast;
  }
}

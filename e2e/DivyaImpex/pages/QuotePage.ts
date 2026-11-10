import { Page, Locator, BrowserContext, expect } from '@playwright/test';
import { selectCustomDropdown, readDropdownOptions, readToast, actionToast } from '../utils/commonActions';
import { RateData } from '../utils/testData';

export interface RateRow {
  chargeDescription: string;
  hsCode: string;
  chargeBasedOn: string;
  quantity: string;
  rate: string;
  currency: string;
  exchangeRate: string;
  valueInInr: string;
}

export type AddRateResult =
  | { added: true; row: RateRow; popupValues: RateRow }
  | { added: false; message: string };

/**
 * CRM -> Sales Management -> Quotation Generation ("Quote Generation" list, "Update Quotation" form).
 * Verified live on DivyaImpex:
 * - Form tabs: Customer Information / Cargo Information / Quote (Quote is a sibling tab, not nested in Cargo Information).
 * - Quote tab: Quote Type (combobox), Charge Descriptions (multi-select button with "Select All"),
 *   CB Vendor and TMS Vendor (comboboxes), "Add Rate" popup, rate table, Upload Documents.
 * - Add Rate popup: Charge Description + Currency are dropdowns; Quantity + Rate are typed;
 *   HS Code, Charge Based On, Exchange Rate and Value In INR are disabled and auto-filled
 *   (Value In INR = Quantity x Rate x Exchange Rate). Saving a rate is local to the form - nothing is
 *   persisted until the page-level Update.
 */
export class QuotePage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly updateHeading: Locator;
  /** Network requests (xhr/fetch/document) triggered by the last Print click - evidence of what Print generated. */
  printRequests: string[] = [];

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Quote Generation', exact: true });
    this.updateHeading = page.getByRole('heading', { name: 'Update Quotation', exact: true });
  }

  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Quotation Generation', exact: true });
    if (!(await link.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await link.click();
    await expect(this.listHeading).toBeVisible();
  }

  /** Listing rows are CSS-grid divs; the Enquiry No (unique per execution) identifies the row. */
  rowByEnquiryNo(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  async quoteNoForEnquiry(enquiryNo: string): Promise<string> {
    const row = this.rowByEnquiryNo(enquiryNo);
    await expect(row, `Quote for ${enquiryNo} should be listed`).toBeVisible({ timeout: 30000 });
    const match = (await row.innerText()).match(/QUOTE-\d+/);
    expect(match, `Quote No should be shown for ${enquiryNo}`).not.toBeNull();
    return match![0];
  }

  async rowStatus(enquiryNo: string): Promise<string> {
    const text = await this.rowByEnquiryNo(enquiryNo).innerText();
    const statuses = ['Quote Initiated', 'Quote Updated', 'Quote Approved', 'Quote Confirmed', 'Order Confirmed', 'Pending Approval', 'Approved', 'Confirmed'];
    return statuses.find((s) => text.includes(s)) ?? text.replace(/\s+/g, ' ').trim();
  }

  rowButton(enquiryNo: string, name: string | RegExp): Locator {
    return this.rowByEnquiryNo(enquiryNo).getByRole('button', { name, exact: typeof name === 'string' });
  }

  async openEdit(enquiryNo: string, quoteNo: string) {
    await this.rowButton(enquiryNo, 'Edit').click();
    await expect(this.updateHeading).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No', exact: true })).toHaveValue(enquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No', exact: true })).toHaveValue(quoteNo);
  }

  async openTab(tab: 'Customer Information' | 'Cargo Information' | 'Quote') {
    await this.page.getByRole('button', { name: tab, exact: true }).first().click();
  }

  // ---------------- Quote setup ----------------

  async quoteTypeOptions(): Promise<string[]> {
    return readDropdownOptions(this.page, 'Quote Type');
  }

  async selectQuoteType(quoteType: string) {
    await selectCustomDropdown(this.page, 'Quote Type', quoteType);
    // The quote sub-tab is renamed after the type, e.g. "Export 20 - 1".
    await expect(this.page.getByRole('button', { name: new RegExp(`^${quoteType} - \\d+$`) })).toBeVisible();
  }

  private chargeDescriptionsTrigger(): Locator {
    return this.page
      .locator('div.relative', { has: this.page.getByText('Charge Descriptions', { exact: true }) })
      .last()
      .getByRole('button')
      .first();
  }

  /** Ticks "Select All" in the Charge Descriptions multi-select and returns every description it then shows as checked. */
  async selectAllChargeDescriptions(): Promise<string[]> {
    const trigger = this.chargeDescriptionsTrigger();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const selectAll = this.page.getByRole('checkbox', { name: 'Select All', exact: true });
    await selectAll.check();
    await expect(selectAll).toBeChecked();
    const items = this.page.locator('li').filter({ has: this.page.getByRole('checkbox') }).filter({ hasNotText: 'Select All' });
    const names: string[] = [];
    for (let i = 0; i < (await items.count()); i++) {
      await expect(items.nth(i).getByRole('checkbox')).toBeChecked();
      names.push((await items.nth(i).innerText()).trim());
    }
    await trigger.click();
    await expect(selectAll).toBeHidden();
    return names;
  }

  async vendorOptions(kind: 'CB Vendor' | 'TMS Vendor'): Promise<string[]> {
    return readDropdownOptions(this.page, kind);
  }

  async selectVendor(kind: 'CB Vendor' | 'TMS Vendor', vendorName: string) {
    await selectCustomDropdown(this.page, kind, vendorName);
  }

  // ---------------- Rates ----------------

  rateTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Value In INR' }) });
  }

  rateRows(): Locator {
    return this.rateTable().locator('tbody tr').filter({ hasNotText: 'No data available' });
  }

  async readRateRows(): Promise<RateRow[]> {
    const rows = this.rateRows();
    const result: RateRow[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const c = (await rows.nth(i).locator('td').allInnerTexts()).map((t) => t.trim());
      result.push({ chargeDescription: c[1], hsCode: c[2], chargeBasedOn: c[3], quantity: c[4], rate: c[5], currency: c[6], exchangeRate: c[7], valueInInr: c[8] });
    }
    return result;
  }

  async chargeDescriptionOptions(): Promise<string[]> {
    await this.page.getByRole('button', { name: /add rate/i }).first().click();
    const options = await readDropdownOptions(this.page, 'Charge Description', this.ratePopup());
    await this.closeRatePopup();
    return options;
  }

  /** The Add/Edit Rate popup: the container holding its own close button and Save/Update. */
  ratePopup(): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByRole('button', { name: 'close-filter-popup' }) })
      .filter({ has: this.page.getByText('Charge Description', { exact: true }) })
      .last();
  }

  async closeRatePopup() {
    const close = this.page.getByRole('button', { name: 'close-filter-popup' });
    if (await close.isVisible()) await close.click();
    await expect(close).toBeHidden();
  }

  private popupField(name: string): Locator {
    return this.page.getByRole('textbox', { name, exact: true });
  }

  private async readPopupValues(chargeDescription: string, currency: string): Promise<RateRow> {
    return {
      chargeDescription,
      hsCode: await this.popupField('HS Code').inputValue(),
      chargeBasedOn: await this.popupField('Charge Based On').inputValue(),
      quantity: await this.popupField('Quantity').inputValue(),
      rate: await this.popupField('Rate').inputValue(),
      currency,
      exchangeRate: await this.popupField('Exchange Rate').inputValue(),
      valueInInr: await this.popupField('Value In INR').inputValue(),
    };
  }

  /**
   * Adds one rate via the popup. Returns the auto-filled values (HS Code, Charge Based On, Exchange
   * Rate, Value In INR) as the app computed them, or - if the app rejects the save (e.g. duplicate
   * description) - the exact message it showed, with the popup closed and nothing fabricated.
   */
  async addRate(rate: RateData): Promise<AddRateResult> {
    const before = await this.rateRows().count();
    await this.page.getByRole('button', { name: /add rate/i }).first().click();
    const popup = this.ratePopup();
    await selectCustomDropdown(this.page, 'Charge Description', rate.chargeDescription, 'exact', popup);
    // Charge Based On is always auto-filled from the charge master; HS Code only when the master has one.
    await expect(this.popupField('Charge Based On')).not.toHaveValue('');
    if (!(await this.popupField('HS Code').inputValue()).trim()) {
      await this.closeRatePopup();
      return { added: false, message: 'Ineligible: the charge master has no HS Code for this description (HS Code field stays empty)' };
    }
    await selectCustomDropdown(this.page, 'Currency', rate.currency, 'exact', popup);
    await expect(this.popupField('Exchange Rate')).not.toHaveValue('');
    await this.popupField('Quantity').fill(rate.quantity);
    await this.popupField('Rate').fill(rate.rate);
    await expect(this.popupField('Value In INR')).not.toHaveValue('');
    const popupValues = await this.readPopupValues(rate.chargeDescription, rate.currency);
    expectInrValue(popupValues);

    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    const outcome = await Promise.race([
      expect(this.rateRows()).toHaveCount(before + 1, { timeout: 8000 }).then(() => 'added' as const),
      readToast(this.page, 8000).then((t) => (t ? (`toast:${t}` as const) : ('none' as const))),
    ]).catch(() => 'none' as const);

    if ((await this.rateRows().count()) === before + 1) {
      const row = (await this.readRateRows())[before];
      return { added: true, row, popupValues };
    }
    const message = typeof outcome === 'string' && outcome.startsWith('toast:') ? outcome.slice(6) : await readToast(this.page, 3000);
    await this.closeRatePopup();
    return { added: false, message: message || 'Rate was not added (no message shown)' };
  }

  rateRowAt(index: number): Locator {
    return this.rateRows().nth(index);
  }

  /** Each rate row's Actions cell has two icon-only buttons: Edit (first) and Delete (last). */
  async editRate(index: number, changes: { quantity?: string; rate?: string }): Promise<RateRow> {
    const row = this.rateRowAt(index);
    await row.locator('td').last().getByRole('button').first().click();
    await expect(this.popupField('Quantity')).toBeVisible();
    if (changes.quantity) await this.popupField('Quantity').fill(changes.quantity);
    if (changes.rate) await this.popupField('Rate').fill(changes.rate);
    const values = await this.readPopupValues('', '');
    expectInrValue(values);
    // The popup's own action may be labelled Update or Save; it renders before the page footer, so .first().
    await this.page.getByRole('button', { name: /^(Update|Save)$/ }).first().click();
    await expect(this.popupField('Quantity')).toBeHidden();
    const updated = (await this.readRateRows())[index];
    if (changes.quantity) expect(updated.quantity).toBe(changes.quantity);
    if (changes.rate) expect(updated.rate).toBe(changes.rate);
    expect(updated.valueInInr).toBe(values.valueInInr);
    return updated;
  }

  /**
   * Deletes one rate row through its Delete icon and the confirmation popup (native confirm or an
   * in-page OK). Returns the confirmation text that was shown.
   */
  async deleteRate(index: number): Promise<string> {
    const before = await this.rateRows().count();
    const target = (await this.readRateRows())[index];
    let nativeMessage = '';
    const handler = async (d: import('@playwright/test').Dialog) => {
      nativeMessage = d.message();
      await d.accept();
    };
    this.page.once('dialog', handler);
    await this.rateRowAt(index).locator('td').last().getByRole('button').last().click();
    const ok = this.page.getByRole('button', { name: /^(OK|Ok|Yes|Yes, Delete|Delete)$/ }).first();
    let message = nativeMessage;
    if (!nativeMessage && (await ok.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) {
      this.page.off('dialog', handler);
      message = (await this.page.locator('div').filter({ has: ok }).filter({ hasText: /delete|remove|sure/i }).last().innerText().catch(() => '')).trim();
      await ok.click();
    }
    this.page.off('dialog', handler);
    expect(message, 'Delete should ask for confirmation').not.toBe('');
    await expect(this.rateRows()).toHaveCount(before - 1);
    const remaining = await this.readRateRows();
    expect(
      remaining.some((r) => JSON.stringify({ ...r }) === JSON.stringify({ ...target })),
      'Deleted rate row must no longer be present'
    ).toBe(false);
    return message;
  }

  // ---------------- Save / View / Print ----------------

  /** Main page-level Update (the footer button - always the last "Update" on the page). */
  async submitUpdate(): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (res) => /quot/i.test(res.url()) && ['PUT', 'POST', 'PATCH'].includes(res.request().method()) && !/upload/i.test(res.url()),
      { timeout: 60000 }
    );
    await this.page.getByRole('button', { name: 'Update', exact: true }).last().click();
    const response = await responsePromise;
    const body = await response.text();
    expect(response.ok(), `Quote update failed (${response.status()}): ${body}`).toBeTruthy();
    const toast = await readToast(this.page);
    await expect(this.listHeading).toBeVisible({ timeout: 30000 });
    return toast;
  }

  async openView(enquiryNo: string, quoteNo: string) {
    await this.rowButton(enquiryNo, 'View More').click();
    await expect(this.page.getByRole('heading', { name: /View Quot/ })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Quote No', exact: true })).toHaveValue(quoteNo);
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(this.listHeading).toBeVisible();
  }

  /**
   * Print opens a new tab. The popup listener is armed before the click; the new page is returned
   * so the caller can capture it, and the original page is brought back to front.
   */
  async printFromList(enquiryNo: string, context: BrowserContext): Promise<Page> {
    const button = this.rowButton(enquiryNo, 'Print');
    await expect(button, 'Print should be enabled for this quote').toBeEnabled();
    const popupPromise = context.waitForEvent('page', { timeout: 30000 });
    this.printRequests = [];
    const onRequest = (req: import('@playwright/test').Request) => {
      if (['xhr', 'fetch', 'document'].includes(req.resourceType())) this.printRequests.push(`${req.method()} ${req.url()}`);
    };
    context.on('request', onRequest);
    await button.click();
    const printPage = await popupPromise;
    setTimeout(() => context.off('request', onRequest), 10000);
    // Verified live: the print tab reaches "networkidle" but never fires domcontentloaded/load
    // (it hands off to the browser print flow), so networkidle is the reliable loaded signal.
    await printPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined);
    await expect.poll(() => printPage.url(), { timeout: 15000 }).not.toBe('about:blank');
    await this.page.bringToFront();
    return printPage;
  }

  // ---------------- Approve / Email / Confirm / Generate Job ----------------

  /** Clicks a form-level action (Approve / Confirm Quote) and accepts its in-page confirmation popup. */
  private async confirmAction(action: RegExp, confirmButton: RegExp): Promise<{ confirmText: string; toast: string }> {
    const yes = this.page.getByRole('button', { name: confirmButton }).first();
    let confirmText = '';
    const toast = await actionToast(this.page, async () => {
      await this.page.getByRole('button', { name: action }).first().click();
      await expect(yes).toBeVisible();
      // The popup's own message: innermost container holding the Yes button plus text, minus the button labels.
      const box = this.page.locator('div').filter({ has: yes }).filter({ has: this.page.locator('p, h1, h2, h3') }).last();
      const buttons = (await box.getByRole('button').allInnerTexts()).map((b) => b.trim());
      confirmText = (await box.innerText())
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !buttons.includes(l))
        .join(' ');
      await yes.click();
    });
    return { confirmText, toast };
  }

  async approve(): Promise<{ confirmText: string; toast: string }> {
    return this.confirmAction(/^Approve$/, /^Yes,? Approve$/i);
  }

  async confirmQuote(): Promise<{ confirmText: string; toast: string }> {
    return this.confirmAction(/^Confirm Quote$/, /^Yes,? Confirm$/i);
  }

  async sendEmail(enquiryNo: string): Promise<string> {
    const button = this.rowButton(enquiryNo, 'Email');
    await expect(button, 'Email should be enabled for this quote').toBeEnabled();
    const first = await actionToast(this.page, () => button.click(), 30000);
    // Verified live: Email first shows a progress toast ("Generating PDF and sending email..."); the
    // outcome arrives as a second toast once the PDF is generated and the mail is sent.
    if (!/generating|sending/i.test(first)) return first;
    const outcome = this.page.getByRole('status').filter({ hasNotText: /generating|sending/i }).filter({ hasText: /\S/ }).last();
    const final = await outcome
      .waitFor({ state: 'visible', timeout: 60000 })
      .then(async () => (await outcome.innerText()).trim())
      .catch(() => '');
    return final ? `${first} -> ${final}` : `${first} -> (no outcome toast within 60s)`;
  }

  /**
   * Opens Generate Job -> "Confirm Master Job" popup. Verified live (2026-10-15): the popup asks the
   * user to "provide the Reference Number" and its "Reference Invoice No" box is empty and required.
   * The value is read as-is after allowing time for any async auto-fill; nothing is typed here.
   */
  async openGenerateJob(enquiryNo: string): Promise<{ popup: Locator; referenceInput: Locator; referenceInvoice: string; message: string }> {
    const button = this.rowButton(enquiryNo, 'Generate Job');
    await expect(button, 'Generate Job should be enabled for this quote').toBeEnabled();
    await button.click();
    const title = this.page.getByRole('heading', { name: 'Confirm Master Job' });
    await expect(title).toBeVisible();
    const popup = this.page.locator('div').filter({ has: title }).filter({ has: this.page.getByRole('button', { name: 'Confirm', exact: true }) }).last();
    const referenceInput = popup.getByRole('textbox', { name: 'Reference Invoice No', exact: true });
    await expect(referenceInput).toBeVisible();
    await expect(referenceInput).not.toHaveValue('', { timeout: 10000 }).catch(() => undefined);
    const message = (await popup.locator('p').allInnerTexts()).map((t) => t.trim()).join(' ');
    return { popup, referenceInput, referenceInvoice: (await referenceInput.inputValue()).trim(), message };
  }

  /**
   * Verified live: Confirm with an empty Reference Invoice No is stopped by native HTML validation
   * ("Please fill out this field.") - no request is sent and the popup stays open.
   */
  async expectEmptyReferenceBlocked(popup: Locator, referenceInput: Locator): Promise<string> {
    await expect(referenceInput).toHaveValue('');
    await popup.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(popup).toBeVisible();
    expect(await referenceInput.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    return referenceInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  }

  async enterReferenceInvoice(referenceInput: Locator, value: string) {
    await expect(referenceInput, 'Reference Invoice No must be visible').toBeVisible();
    await expect(referenceInput, 'Reference Invoice No must be enabled').toBeEnabled();
    await expect(referenceInput, 'Reference Invoice No must be editable').toBeEditable();
    await referenceInput.fill(value);
    await expect(referenceInput).toHaveValue(value);
  }

  async confirmGenerateJob(popup: Locator): Promise<string> {
    return actionToast(this.page, () => popup.getByRole('button', { name: 'Confirm', exact: true }).click(), 30000);
  }

  async cancelGenerateJob(popup: Locator) {
    await popup.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(popup).toBeHidden();
  }

  /**
   * CRM -> Sales Management -> Booking Job Generation ("Booking Master Job List"). Verified live: the
   * Reference Invoice No entered in Confirm Master Job is shown in the "BL/INVOICE" column next to the
   * customer. Returns that row's text (the list has no separate Job No column).
   */
  async findMasterJob(customerName: string, referenceInvoiceNo: string): Promise<string> {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Booking Job Generation', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    await link.click();
    await expect(this.page.getByRole('heading', { name: 'Booking Master Job List', exact: true })).toBeVisible();
    const row = this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(referenceInvoiceNo, { exact: true }) })
      .first();
    await expect(row, `Master Job with reference ${referenceInvoiceNo} should be listed`).toBeVisible({ timeout: 30000 });
    await expect(row).toContainText(customerName);
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }
}

/** Value In INR is computed by the app; it must equal Quantity x Rate x Exchange Rate (2 decimals). */
export function expectInrValue(v: Pick<RateRow, 'quantity' | 'rate' | 'exchangeRate' | 'valueInInr'>) {
  const expected = Number(v.quantity) * Number(v.rate) * Number(v.exchangeRate);
  expect(Number(v.valueInInr), `Value In INR for qty ${v.quantity} x rate ${v.rate} x exch ${v.exchangeRate}`).toBeCloseTo(expected, 1);
}

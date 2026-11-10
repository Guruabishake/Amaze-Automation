import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectCustomDropdown, selectFromOpenDropdownPanel } from '../utils/commonActions';

export interface FFDraftInvoiceRowData {
  jobNo: string;
  invoiceNo: string;
  sbBeNo: string;
  invoiceDate: string;
  shipper: string;
  consignee: string;
  status: string;
}

export interface FFDraftInvoiceHeaderInput {
  noOfInvoiceCopies: string;
  blAwbNo: string;
  consigneeAddress1: string;
}

export interface FFDraftInvoiceItemInput {
  qty: string;
  rate: string;
}

export interface FFDraftInvoiceItemUsed {
  description: string;
  qty: string;
  rate: string;
  currency: string;
}

export type PrintMechanism = 'download' | 'new-tab' | 'same-tab-navigation' | 'unknown';

/**
 * FF Export Sea's own "Draft Invoice" (FF -> "FF - Export Sea" submenu -> "Draft Invoice") -
 * reached from the FF Job List's own "Initiate Draft Invoice" row action, same real "no separate
 * creation form" mechanism already confirmed for CB's own Draft Invoice (`DraftInvoicePage.ts`) -
 * a DIFFERENT, unrelated screen from CB's own Draft Invoice (no code/locators shared). Real field
 * names/behaviors below are confirmed live via direct UI discovery as this continuation is built
 * and run - documented here as they are actually observed, never assumed in advance.
 */
export class FFDraftInvoicePage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly filterButton: Locator;
  readonly viewHeading: Locator;
  readonly editHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'Draft Invoice', exact: true });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
    this.viewHeading = this.page.getByRole('heading', { name: 'View More', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'Draft Invoice - Edit', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'FF', exact: true }).click();
    const linkVisible = await this.page.getByRole('button', { name: 'Draft Invoice', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'FF - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Draft Invoice', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  getRowByJobNo(jobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: jobNo }).first();
  }

  async readRowData(jobNo: string): Promise<FFDraftInvoiceRowData> {
    const row = this.getRowByJobNo(jobNo);
    await expect(row).toBeVisible({ timeout: 15_000 });
    let cells: string[] = [];
    // State-based poll (not a blind wait) for the row's own async data to finish populating -
    // same real need already confirmed on every other list in this suite, expressed here via
    // `toPass` instead of a manual waitForTimeout loop.
    await expect(async () => {
      cells = await row.locator(':scope > div').allInnerTexts();
      expect((cells[0] ?? '').trim()).not.toBe('');
    }).toPass({ timeout: 8_000 }).catch(() => {});
    // Confirmed live real column order: Invoice No. / Job No. / SB/BE No. / Invoice Date /
    // Shipper / Consignee / Status / Actions - Invoice No comes BEFORE Job No, unlike this
    // continuation's own initial (unconfirmed) assumption.
    return {
      invoiceNo: (cells[0] ?? '').trim(),
      jobNo: (cells[1] ?? '').trim(),
      sbBeNo: (cells[2] ?? '').trim(),
      invoiceDate: (cells[3] ?? '').trim(),
      shipper: (cells[4] ?? '').trim(),
      consignee: (cells[5] ?? '').trim(),
      status: (cells[6] ?? '').trim(),
    };
  }

  async openFilter() {
    const alreadyOpen = await this.page.getByPlaceholder(/Invoice No/i).first().isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click({ timeout: 15_000 });
    }
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 15_000 });
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible({ timeout: 20_000 });
  }

  /** Real filter field names/labels are confirmed live as this continuation is built and run - each targets its field by the most stable handle discovered (name attribute if present, otherwise placeholder/label text). */
  async filterByInvoiceNo(value: string) {
    await this.page.getByPlaceholder(/Invoice No/i).first().fill(value, { timeout: 15_000 });
    await this.searchAndWait();
  }
  /**
   * Confirmed live: unlike the other filter fields, this is a native `type="date"` input with a
   * floating LABEL ("Invoice Date"), not a placeholder - `getByPlaceholder` never matches it (its
   * visual "dd-mm-yyyy" is the native input's own empty-state hint, not an accessible placeholder).
   * `value` is accepted in this suite's own display format (DD-MM-YYYY, as captured straight from
   * the List's own row data) and converted here to the ISO `YYYY-MM-DD` a native date input's
   * `.fill()` actually needs, regardless of its visual display format.
   */
  async filterByInvoiceDate(displayValue: string) {
    const [day, month, year] = displayValue.split('-');
    const isoValue = `${year}-${month}-${day}`;
    await this.page.locator('div.relative.group', { has: this.page.getByText('Invoice Date', { exact: true }) }).first().locator('input').fill(isoValue, { timeout: 15_000 });
    await this.searchAndWait();
  }
  async filterByShipper(value: string) {
    await this.page.getByPlaceholder(/Shipper/i).first().fill(value, { timeout: 15_000 });
    await this.searchAndWait();
  }
  async filterByConsignee(value: string) {
    await this.page.getByPlaceholder(/Consignee/i).first().fill(value, { timeout: 15_000 });
    await this.searchAndWait();
  }
  async filterBySbBeNo(value: string) {
    await this.page.getByPlaceholder(/SB.*BE|BE.*SB/i).first().fill(value, { timeout: 15_000 });
    await this.searchAndWait();
  }

  /** Same real staging-concurrency issue already fixed on every other list's own resetFilter in this suite: checking that a "N records" summary reappears at all is the reliable success signal, not an exact pre-filter count. */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  /** Confirmed live real row action DOM order: "Print" (text, index 0), View (icon, index 1), Edit (icon, index 2) - same order already confirmed on CB's own Draft Invoice list. */
  async viewDraftInvoice(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible({ timeout: 15_000 });
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible({ timeout: 15_000 });
  }

  async editDraftInvoice(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(2).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible({ timeout: 15_000 });
    // Confirmed live via a failed re-Update (no toast, "Childjob No" left focused = native required-field
    // validation): the heading renders BEFORE the form's own data finishes loading, so an immediate
    // Update click submits a blank form. Waiting for the job's own number to populate closes that race.
    const jobNoField = this.page.locator('div.relative.group', { has: this.page.getByText('Childjob No', { exact: true }) }).first().getByRole('textbox');
    await expect(jobNoField, `Draft Invoice Edit form should finish loading ${jobNo}`).toHaveValue(jobNo, { timeout: 20_000 });
  }

  /**
   * Confirmed live (same real React controlled-input race already confirmed on FFStuffingPage's
   * own Vessel popup): repeatedly filling fields in quick succession - e.g. re-filling Qty/Rate on
   * every retry of a rejected Description candidate - can silently leave one of them blank even
   * though `.fill()` itself reported success, later surfacing as a raw backend error ("invalid
   * input syntax for type integer: ''") on the real Update. Verifying the field's actual value
   * after each fill and retrying closes that race instead of trusting `.fill()`'s own resolution.
   */
  private async fillByLabel(label: string, value: string) {
    const field = this.page.locator('div.relative.group', { hasText: label }).first().getByRole('textbox');
    let actual = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await field.fill(value, { timeout: 20_000 });
      actual = await field.inputValue().catch(() => '');
      if (actual === value) return;
      console.log(`FFDraftInvoicePage.fillByLabel: "${label}" did not hold value "${value}" (got "${actual}") on attempt ${attempt} - retrying.`);
    }
    throw new Error(`FFDraftInvoicePage.fillByLabel: "${label}" still reads "${actual}" instead of "${value}" after 3 attempts.`);
  }

  async fillHeader(data: FFDraftInvoiceHeaderInput) {
    await this.fillByLabel('No of Invoice Copies', data.noOfInvoiceCopies);
    // Confirmed live real label has spaces around the slash: "BL / AWB No", not "BL/AWB No".
    await this.fillByLabel('BL / AWB No', data.blAwbNo);
    await this.fillByLabel('Consignee Address 1', data.consigneeAddress1);
  }

  private getInvoiceItemsTable(): Locator {
    return this.page.locator('table').first();
  }

  getInvoiceItemRowByDescription(description: string): Locator {
    return this.getInvoiceItemsTable().locator('tbody tr').filter({ hasText: description }).first();
  }

  async getInvoiceItemRowCount(): Promise<number> {
    return this.getInvoiceItemsTable().locator('tbody tr').count();
  }

  private descriptionField(): Locator {
    return this.page.locator('div.relative.group', { has: this.page.getByText('Description', { exact: true }) }).first();
  }

  /**
   * Confirmed live: the Description combobox's own real options carry a tenant/module tag suffix
   * (e.g. "Amendment Charges FF-Direct Incomes (FF)"), but the table only ever DISPLAYS the
   * stripped base name ("Amendment Charges FF") - same real convention already confirmed on CB's
   * own pre-populated Draft Invoice rows ("Base Charge", not "Base Charge-Direct Incomes (CB)").
   * Row lookups must use the stripped form, never the full combobox option text.
   */
  private stripDescriptionSuffix(text: string): string {
    return text.replace(/-Direct Incomes\s*\([^)]*\)\s*$/i, '').trim();
  }

  /**
   * Real Description master list for this popup was never confirmed live (a different module/
   * screen than CB's own Draft Invoice) - opens the combobox and returns whatever real options are
   * actually rendered, never a guessed value. Confirmed live: pressing Escape to close the panel
   * afterwards closed the WHOLE "Add New" popup, not just the dropdown - so this leaves the panel
   * open and the caller selects directly from it (via `selectFromOpenDropdownPanel`) rather than
   * closing and reopening.
   */
  private async openDescriptionAndReadOptions(): Promise<string[]> {
    await this.descriptionField().getByRole('combobox').click({ timeout: 15_000 });
    const options = this.page.locator('li');
    await options.first().waitFor({ state: 'visible', timeout: 10_000 });
    return (await options.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  /**
   * Adds one Invoice Item, trying live-discovered Description options starting at `preferredIndex`
   * until one is accepted. Confirmed live on CB's own Draft Invoice (same shared popup component
   * pattern): a Description already present in the table (pre-populated rows OR a prior addition in
   * this same run) is silently rejected without closing the popup - trying the next real option
   * instead of assuming the first one always works closes that real gap. Returns the actual
   * Description/Currency used so the caller never has to guess what was really added.
   */
  async addInvoiceItem(data: FFDraftInvoiceItemInput, preferredIndex = 0): Promise<FFDraftInvoiceItemUsed> {
    await this.page.getByRole('button', { name: /Add New/i }).click({ timeout: 20_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 20_000 });

    const options = await this.openDescriptionAndReadOptions();
    if (options.length === 0) {
      throw new Error('FFDraftInvoicePage.addInvoiceItem: no live Description options were found in the popup.');
    }

    const currency = 'Pound';
    let usedDescription = '';
    for (let i = 0; i < options.length; i++) {
      const candidate = options[(preferredIndex + i) % options.length];
      // Panel is already open from `openDescriptionAndReadOptions` on the first pass; only reopen
      // it on a retry (after a duplicate rejection moved focus off it).
      if (i > 0) {
        await this.descriptionField().getByRole('combobox').click({ timeout: 15_000 });
      }
      await selectFromOpenDropdownPanel(this.page, candidate, 'exact', false);
      await this.fillByLabel('Qty', data.qty);
      await this.fillByLabel('Rate', data.rate);
      await selectCustomDropdown(this.page, 'Currency', currency);
      await this.page.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 20_000 });
      const stillOpen = await popup.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!stillOpen) {
        usedDescription = this.stripDescriptionSuffix(candidate);
        break;
      }
      console.log(`FFDraftInvoicePage.addInvoiceItem: Description "${candidate}" was rejected (likely already present in the table) - trying the next live option.`);
    }
    if (!usedDescription) {
      throw new Error('FFDraftInvoicePage.addInvoiceItem: every live Description option was rejected as a duplicate.');
    }
    await expect(this.getInvoiceItemRowByDescription(usedDescription)).toBeVisible({ timeout: 20_000 });
    return { description: usedDescription, qty: data.qty, rate: data.rate, currency };
  }

  /**
   * Modifies ALL available fields on an existing item (Description/Qty/Rate/Currency), trying live
   * options for Description the same way `addInvoiceItem` does, since the same duplicate-rejection
   * behavior is expected here too.
   */
  async editInvoiceItem(currentDescription: string, data: FFDraftInvoiceItemInput, preferredIndex = 0): Promise<FFDraftInvoiceItemUsed> {
    const row = this.getInvoiceItemRowByDescription(currentDescription);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });

    const options = await this.openDescriptionAndReadOptions();
    const currency = 'Pound';
    let usedDescription = '';
    for (let i = 0; i < options.length; i++) {
      const candidate = options[(preferredIndex + i) % options.length];
      if (i > 0) {
        await this.descriptionField().getByRole('combobox').click({ timeout: 15_000 });
      }
      await selectFromOpenDropdownPanel(this.page, candidate, 'exact', false);
      await this.fillByLabel('Qty', data.qty);
      await this.fillByLabel('Rate', data.rate);
      await selectCustomDropdown(this.page, 'Currency', currency);
      const updateBtn = popup.getByRole('button', { name: 'Update', exact: true });
      const saveBtn = popup.getByRole('button', { name: 'Save', exact: true });
      if (await updateBtn.isVisible().catch(() => false)) {
        await updateBtn.click({ timeout: 20_000 });
      } else {
        await saveBtn.click({ timeout: 20_000 });
      }
      const stillOpen = await popup.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!stillOpen) {
        usedDescription = this.stripDescriptionSuffix(candidate);
        break;
      }
      console.log(`FFDraftInvoicePage.editInvoiceItem: Description "${candidate}" was rejected (likely already present in the table) - trying the next live option.`);
    }
    if (!usedDescription) {
      throw new Error('FFDraftInvoicePage.editInvoiceItem: every live Description option was rejected as a duplicate.');
    }
    await expect(this.getInvoiceItemRowByDescription(usedDescription), 'Invoice Item row should reflect the updated Description after Update/Save').toBeVisible({ timeout: 20_000 });
    return { description: usedDescription, qty: data.qty, rate: data.rate, currency };
  }

  async deleteInvoiceItem(description: string) {
    const countBefore = await this.getInvoiceItemRowCount();
    const row = this.getInvoiceItemRowByDescription(description);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
    await expect(async () => {
      expect(await this.getInvoiceItemRowCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 25_000 });
  }

  /** Real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickUpdate() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
  }

  /**
   * Clicks the LIST row's own "Print" action and detects whatever the app ACTUALLY does with it
   * (never assumed in advance, per this continuation's own explicit requirement) - races a real
   * Playwright `download` event against a new tab/page opening against a same-tab navigation.
   * A genuine `download` event is this app's own confirmed "Save" step elsewhere in this suite (CB's
   * own Final Invoice) - `download.saveAs()` IS the save, no further click needed. A new tab/page or
   * same-tab navigation to a PDF/viewer URL is reported as such (a native browser PDF viewer's own
   * toolbar is not part of the page DOM and cannot be reliably driven via Playwright locators) so the
   * caller can log the real, observed mechanism instead of a fabricated one.
   */
  async clickListPrintAndHandle(jobNo: string, destDir: string): Promise<{ mechanism: PrintMechanism; fileName?: string; savedPath?: string; url?: string }> {
    const urlBefore = this.page.url();
    const downloadPromise = this.page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    const newPagePromise = this.page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);

    await this.getRowByJobNo(jobNo).getByRole('button', { name: 'Print', exact: true }).click({ timeout: 20_000 });

    const download = await downloadPromise;
    if (download) {
      const fileName = download.suggestedFilename();
      const savedPath = path.join(destDir, fileName);
      await download.saveAs(savedPath);
      return { mechanism: 'download', fileName, savedPath };
    }

    const newPage = await newPagePromise;
    if (newPage) {
      await newPage.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
      const newPageDownload = await newPage.waitForEvent('download', { timeout: 5_000 }).catch(() => null);
      if (newPageDownload) {
        const fileName = newPageDownload.suggestedFilename();
        const savedPath = path.join(destDir, fileName);
        await newPageDownload.saveAs(savedPath);
        await newPage.close().catch(() => {});
        return { mechanism: 'download', fileName, savedPath };
      }
      const url = newPage.url();
      return { mechanism: 'new-tab', url };
    }

    const urlAfter = this.page.url();
    if (urlAfter !== urlBefore) {
      return { mechanism: 'same-tab-navigation', url: urlAfter };
    }

    return { mechanism: 'unknown' };
  }
}

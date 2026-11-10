import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, selectFromOpenDropdownPanel } from '../utils/commonActions';

export interface FFVendorBillRowData {
  jobNo: string;
  combinedJobNo: string;
  customerName: string;
  sbNo: string;
  vendorBillNo: string;
  vendorName: string;
  vendorGst: string;
  grandTotal: string;
  status: string;
}

/** Real values read back from the Create/Edit/View form fields (never assumed). */
export interface FFVendorBillFormValues {
  vendorName: string;
  jobNo: string;
  vendorGst: string;
  companyGst: string;
  vendorBillNo: string;
  vendorBillDate: string;
}

/**
 * FF Export Sea's own "Vendor Bill" (FF -> "FF - Export Sea" submenu -> "Vendor Bill", route
 * `/ff/exportSeaVendorBill`, heading "Vendor Bills") - a DIFFERENT screen from CB's own
 * (`VendorBillPage.ts`, `/cb/commonvendorbill`), which is left untouched. Confirmed live via direct
 * UI discovery (never assumed):
 *
 * - List columns, confirmed real order: Job No. / Combined Job No. / Customer Name / SB/BE No. /
 *   Vendor Bill No / Vendor Name / Vendor GST / Grand Total / Status / Actions (each a direct child
 *   `div` of the row's own `div[style*="grid-template-columns"]`). A row's Job No./Combined Job No.
 *   cells can hold several comma-joined values (one bill can cover several jobs). Actions: View
 *   (index 0) / Edit (index 1), both icon-only.
 * - Filter panel (opened via "Filter", dismissed via the "close-filter-popup" button): exactly 5
 *   real fields, confirmed via their own `name` attributes - `child_job_no` ("Job No"),
 *   `booking_job_no` ("Combined Job No"), `customer_name` ("Customer Name"), `invoice_bl_no`
 *   ("SB/BE Number"), `vendor_name` ("Vendor Name"). There is NO Vendor Bill No / Vendor GST /
 *   Company GST / Vendor Bill Date filter on this screen.
 * - "+ Create" opens "Create Vendor Bill" (which also renders an unrelated "Vendor Bill Filters"
 *   strip of its own, never used here). Real fields: Vendor Name (`role=combobox`, searchable,
 *   ~300 options) / Job No. (a plain `<button>` trigger - NOT `role=combobox`; options look like
 *   "(SB-18928) - FFJOB-001139" and are NOT scoped to the chosen vendor) / Vendor ID (auto-fills
 *   once Vendor Name is chosen, e.g. "VEND-000094") / Vendor GST (a real `role=combobox` here,
 *   unlike CB - options are "— None —", "Select GST", then the vendor's own real GST(s), if any) /
 *   Company GST (`role=combobox`: "— None —", "Select Company GST", then real "<State> - <City> -
 *   <GSTIN>" entries) / Vendor Bill No (`name="vendor_bill_no"`) / Vendor Bill Date (native
 *   `type=date`, `name="vendorbill_date"`). "+ Add New" opens the same Job Details line-item popup
 *   shape as CB's. Cancel/Create buttons.
 */
export class FFVendorBillPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly createButton: Locator;
  readonly filterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'Vendor Bills', exact: true });
    this.createButton = this.page.getByRole('button', { name: /Create/i }).first();
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'FF', exact: true }).click({ timeout: 15_000 });
    const link = this.page.getByRole('button', { name: 'Vendor Bill', exact: true });
    const visible = await link.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
    if (!visible) {
      await this.page.getByRole('button', { name: 'FF - Export Sea', exact: true }).click({ timeout: 15_000 });
    }
  }

  /** The "+ Create" button's presence is what confirms we're on the LIST - the Create form shares the "Vendor Bills" filter strip heading. */
  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Vendor Bill', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible({ timeout: 20_000 });
    await expect(this.createButton).toBeVisible({ timeout: 15_000 });
  }

  /** Waits out a lingering react-hot-toast overlay (confirmed to intercept clicks elsewhere in this suite) - never a forced click. */
  private async clickAfterToastClears(locator: Locator, timeout = 20_000) {
    await this.page.locator('[data-rht-toaster]').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
    await locator.click({ timeout });
  }

  private async fillAndVerify(field: Locator, value: string, label: string) {
    let actual = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await field.fill(value, { timeout: 20_000 });
      actual = await field.inputValue().catch(() => '');
      if (actual === value) return;
      console.log(`FFVendorBillPage.fillAndVerify: "${label}" did not hold value "${value}" (got "${actual}") on attempt ${attempt} - retrying.`);
    }
    throw new Error(`FFVendorBillPage.fillAndVerify: "${label}" still reads "${actual}" instead of "${value}" after 3 attempts.`);
  }

  private group(label: string): Locator {
    return this.page.locator('div.relative.group', { has: this.page.getByText(label, { exact: true }) }).first();
  }

  getRowByVendorBillNo(vendorBillNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: vendorBillNo }).first();
  }

  /** Cells are anchored on the stable "FFJOB-" prefix of the Job No cell (not fixed indices), same convention as FFJobPage. */
  async readRowData(vendorBillNo: string): Promise<FFVendorBillRowData> {
    const row = this.getRowByVendorBillNo(vendorBillNo);
    await expect(row).toBeVisible({ timeout: 20_000 });
    let cells: string[] = [];
    let jobNoIndex = -1;
    await expect(async () => {
      cells = (await row.locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
      jobNoIndex = cells.findIndex((c) => c.startsWith('FFJOB-'));
      expect(jobNoIndex).toBeGreaterThanOrEqual(0);
      expect(cells[jobNoIndex + 4]).not.toBe('');
    }).toPass({ timeout: 20_000 }).catch(() => {});
    const at = (offset: number) => (jobNoIndex >= 0 ? (cells[jobNoIndex + offset] ?? '').trim() : '');
    return {
      jobNo: at(0),
      combinedJobNo: at(1),
      customerName: at(2),
      sbNo: at(3),
      vendorBillNo: at(4),
      vendorName: at(5),
      vendorGst: at(6),
      grandTotal: at(7),
      status: at(8),
    };
  }

  async openCreateForm() {
    await this.clickAfterToastClears(this.createButton, 15_000);
    await expect(this.page.getByRole('heading', { name: 'Create Vendor Bill', exact: true })).toBeVisible({ timeout: 15_000 });
  }

  async selectVendorName(vendorName: string) {
    await selectCustomDropdown(this.page, 'Vendor Name', vendorName);
  }

  /** Job No. trigger is a plain `<button>`; options read "(SB-XXXXX) - FFJOB-XXXXXX", matched by the exact FFJOB number (never "first option"). */
  async selectJobNo(jobNo: string) {
    await this.group('Job No.').locator('button').first().click({ timeout: 15_000 });
    await selectFromOpenDropdownPanel(this.page, jobNo, 'contains', true);
  }

  /**
   * Opens a real `role=combobox` and picks the first real option - skipping the "— None —" /
   * "Select ..." placeholder entries every one of these dropdowns lists first. `offered` is the
   * option clicked ('' if the dropdown genuinely offers nothing but placeholders); `retained` is what
   * the field actually displays afterwards ('' if it still shows a placeholder - confirmed live for
   * this suite's own QA vendors, whose only Vendor GST entry has no GSTIN and does not stick).
   * Reported by the caller, never invented.
   */
  private async selectFirstRealOption(label: string): Promise<{ offered: string; retained: string }> {
    const combo = this.group(label).getByRole('combobox').first();
    await combo.click({ timeout: 15_000 });
    const options = this.page.locator('li').filter({ hasNotText: /^\s*(—\s*None\s*—|Select\b.*)$/i });
    const found = await options.first().waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (!found) {
      await this.page.keyboard.press('Escape');
      return { offered: '', retained: '' };
    }
    const offered = (await options.first().innerText()).trim();
    await options.first().click({ timeout: 10_000 });
    const shown = (await combo.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const retained = /^(—\s*None\s*—|Select\b.*)$/i.test(shown) ? '' : shown;
    return { offered, retained };
  }

  async selectVendorGst() {
    return this.selectFirstRealOption('Vendor GST');
  }

  async selectCompanyGst() {
    return this.selectFirstRealOption('Company GST');
  }

  async fillVendorBillNo(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="vendor_bill_no"]'), value, 'Vendor Bill No');
  }

  /** `value` must be `YYYY-MM-DD` (native `type=date` input value format). */
  async fillVendorBillDate(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="vendorbill_date"]'), value, 'Vendor Bill Date');
  }

  /** Reads back what the form actually holds right now (Create/Edit; View is read by `readViewValues`). */
  async readFormValues(): Promise<FFVendorBillFormValues> {
    const comboText = async (label: string) => (await this.group(label).getByRole('combobox').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const jobText = (await this.group('Job No.').locator('button').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    return {
      vendorName: await comboText('Vendor Name'),
      jobNo: jobText,
      vendorGst: await comboText('Vendor GST'),
      companyGst: await comboText('Company GST'),
      vendorBillNo: await this.page.locator('input[name="vendor_bill_no"]').inputValue().catch(() => ''),
      vendorBillDate: await this.page.locator('input[name="vendorbill_date"]').inputValue().catch(() => ''),
    };
  }

  /** The real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickCreate() {
    await this.clickAfterToastClears(this.page.getByRole('button', { name: 'Create', exact: true }));
  }

  async clickUpdate() {
    const update = this.page.getByRole('button', { name: 'Update', exact: true });
    await update.waitFor({ state: 'visible', timeout: 20_000 });
    await this.clickAfterToastClears(update);
  }

  async editVendorBill(vendorBillNo: string) {
    await this.clickAfterToastClears(this.getRowByVendorBillNo(vendorBillNo).locator('button').nth(1));
    await expect(this.page.getByRole('button', { name: 'Update', exact: true })).toBeVisible({ timeout: 20_000 });
  }

  async viewVendorBill(vendorBillNo: string) {
    await this.clickAfterToastClears(this.getRowByVendorBillNo(vendorBillNo).locator('button').nth(0));
    await expect(this.page.getByRole('button', { name: 'Back', exact: true })).toBeVisible({ timeout: 20_000 });
  }

  async backToList() {
    await this.clickAfterToastClears(this.page.getByRole('button', { name: 'Back', exact: true }));
    await expect(this.listHeading).toBeVisible({ timeout: 20_000 });
    await expect(this.createButton).toBeVisible({ timeout: 15_000 });
  }

  async openFilter() {
    const alreadyOpen = await this.page.locator('input[name="child_job_no"]').isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.clickAfterToastClears(this.filterButton, 15_000);
    }
    await expect(this.page.locator('input[name="child_job_no"]')).toBeVisible({ timeout: 15_000 });
  }

  async search() {
    await this.clickAfterToastClears(this.page.getByRole('button', { name: 'Search', exact: true }), 15_000);
  }

  async filterByJobNo(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="child_job_no"]'), value, 'Filter Job No');
    await this.search();
  }
  async filterByCombinedJobNo(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="booking_job_no"]'), value, 'Filter Combined Job No');
    await this.search();
  }
  async filterByCustomerName(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="customer_name"]'), value, 'Filter Customer Name');
    await this.search();
  }
  async filterBySbNo(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="invoice_bl_no"]'), value, 'Filter SB/BE Number');
    await this.search();
  }
  async filterByVendorName(value: string) {
    await this.fillAndVerify(this.page.locator('input[name="vendor_name"]'), value, 'Filter Vendor Name');
    await this.search();
  }

  /**
   * Confirmed live: Search closes the filter popup and the list then reads "N of M records"; Reset
   * (on the list toolbar) returns it to the unfiltered "M records" summary. Verified here by that
   * summary AND by reopening the popup to confirm every input really is empty, then closing it again.
   */
  async resetFilter(): Promise<boolean> {
    await this.clickAfterToastClears(this.page.getByRole('button', { name: 'Reset', exact: true }), 15_000);
    await expect(this.listHeading).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
    await this.openFilter();
    let allEmpty = true;
    for (const name of ['child_job_no', 'booking_job_no', 'customer_name', 'invoice_bl_no', 'vendor_name']) {
      if ((await this.page.locator(`input[name="${name}"]`).inputValue().catch(() => 'x')) !== '') allEmpty = false;
    }
    await this.page.getByRole('button', { name: 'close-filter-popup' }).click({ timeout: 10_000 });
    await expect(this.page.locator('input[name="child_job_no"]')).toBeHidden({ timeout: 10_000 });
    return allEmpty;
  }
}

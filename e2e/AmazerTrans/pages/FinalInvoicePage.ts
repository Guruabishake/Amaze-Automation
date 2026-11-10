import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';

export interface FinalInvoiceRowData {
  finalInvoiceNo: string;
  draftInvoiceNo: string;
  jobNo: string;
  sbNo: string;
  invoiceDate: string;
  shipper: string;
  consignee: string;
}

/**
 * Final Invoice (CB -> "CB - Export Sea" submenu -> "Final Invoice", route `/cb/cbEsFinalInvoice`,
 * heading "CB ES Final Invoice") - reached after Draft Invoice List's own "Initiate Final" action.
 * Confirmed live via direct UI discovery (never assumed):
 *
 * - List columns, confirmed real order: Final Invoice No / Draft Invoice No / Job No. / SB/BE No. /
 *   Invoice Date / Shipper / Consignee / Grand Total / Status / Actions - each a direct child `div`
 *   of the row's own `div[style*="grid-template-columns"]` container, same convention already used
 *   throughout this suite (`:scope > div`).
 * - A row has exactly TWO actions (confirmed live, NOT a separate "Download" icon as might be
 *   assumed from the task wording): an icon-only "View" (title="View", index 0) and an icon-only
 *   "Print" (title="Print", index 1). Confirmed live the LIST's own "Print" action does NOT itself
 *   trigger a download - it navigates to the SAME View form URL as "View"
 *   (`cbEsFinalInvoiceForm?...&id={id}&view=true&returnPage=1`, heading "CB ES Final Invoice" - the
 *   SAME heading text as the list itself, so the `Filter` button's presence, not the heading, is
 *   what actually distinguishes "on the list" from "on the view form" here).
 * - The View form itself has its own "Back"/"Print" buttons. Confirmed live real mechanism: clicking
 *   THAT "Print" button fires a genuine Playwright `download` event for a PDF named
 *   `<FinalInvoiceNo>.pdf` (e.g. "CB-ES-FINV-000024.pdf") - no new tab, no print-preview page, no JS
 *   dialog. This is the real "Download -> Print -> Save" mechanism for this app: a single "Print"
 *   click IS the download trigger, and Playwright's own `download.saveAs()` IS the "Save" step (this
 *   app has no separate visible Save button/dialog - the browser download is the save).
 * - Filter panel: 7 real fields, confirmed live via their own `name` attributes (none of the 7 has
 *   an `aria-label`, so targeting by `name` attribute directly is more reliable than assuming
 *   placeholder text resolves as an accessible name): `final_invoice_no` ("Final Invoice No"),
 *   `invoice_no` ("Draft Invoice No"), `invoice_date` (native `type=date`), `child_job_no`
 *   ("Job No"), `actual_invoice_number` ("SB/BE Number" - confirmed live to be the real SB/BE Number
 *   field despite its own misleading `name` attribute), `shipper`, `consignee`. Same Search/Reset
 *   toolbar convention as every other list in this suite.
 */
export class FinalInvoicePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly filterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = this.page.getByRole('heading', { name: 'CB ES Final Invoice', exact: true });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const linkVisible = await this.page.getByRole('button', { name: 'Final Invoice', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  /** Confirmed live: List and View share the exact same heading text - the Filter button (List-only) is what actually confirms we're on the list, not the view form. */
  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Final Invoice', exact: true }).click({ timeout: 15_000 });
    await expect(this.heading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  getRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  /** Reads the row's own real column values - used so every later Download/Print/Filter step validates against ACTUAL business data, never a guessed/reconstructed value. */
  async readRowData(sbNo: string): Promise<FinalInvoiceRowData> {
    const cells = await this.getRowBySbNo(sbNo).locator(':scope > div').allInnerTexts();
    return {
      finalInvoiceNo: (cells[0] ?? '').trim(),
      draftInvoiceNo: (cells[1] ?? '').trim(),
      jobNo: (cells[2] ?? '').trim(),
      sbNo: (cells[3] ?? '').trim(),
      invoiceDate: (cells[4] ?? '').trim(),
      shipper: (cells[5] ?? '').trim(),
      consignee: (cells[6] ?? '').trim(),
    };
  }

  async viewFinalInvoice(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(0).click({ timeout: 20_000 });
    await expect(this.page.getByRole('button', { name: 'Back', exact: true })).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Clicks the LIST row's own "Print" icon (title="Print", index 1) - the closest real equivalent
   * to a "Download" trigger on this list (confirmed live: there is no separate Download icon).
   * Lands on the exact same View form as `viewFinalInvoice` (confirmed live, same URL/heading) -
   * the real PDF download itself only happens once THAT form's own "Print" button is clicked (see
   * `downloadFinalInvoicePdf`).
   */
  async clickListPrintIcon(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.page.getByRole('button', { name: 'Back', exact: true })).toBeVisible({ timeout: 20_000 });
  }

  async backToFinalInvoiceList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.heading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Must be called while ON the View form (see `viewFinalInvoice`). Clicks the View form's own
   * "Print" button and saves the resulting real browser download (confirmed live: a genuine
   * Playwright `download` event, not a new tab/dialog/print-preview) to `destDir`. Returns the
   * real suggested filename and the saved path.
   */
  async downloadFinalInvoicePdf(destDir: string): Promise<{ fileName: string; savedPath: string }> {
    const downloadPromise = this.page.waitForEvent('download', { timeout: 20_000 });
    await this.page.getByRole('button', { name: 'Print', exact: true }).click({ timeout: 20_000 });
    const download = await downloadPromise;
    const fileName = download.suggestedFilename();
    const savedPath = path.join(destDir, fileName);
    await download.saveAs(savedPath);
    return { fileName, savedPath };
  }

  async openFilter() {
    const alreadyOpen = await this.page.locator('input[name="final_invoice_no"]').isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click();
    }
    await expect(this.page.locator('input[name="final_invoice_no"]')).toBeVisible();
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  async filterByFinalInvoice(value: string) {
    await this.page.locator('input[name="final_invoice_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByDraftInvoiceNo(value: string) {
    await this.page.locator('input[name="invoice_no"]').fill(value);
    await this.searchAndWait();
  }
  /** `value` must be `YYYY-MM-DD` (native `type=date` input value format) - convert from the row's own displayed `DD-MM-YYYY` before calling. */
  async filterByInvoiceDate(value: string) {
    await this.page.locator('input[name="invoice_date"]').fill(value);
    await this.searchAndWait();
  }
  async filterByJobNo(value: string) {
    await this.page.locator('input[name="child_job_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterBySbNumber(value: string) {
    await this.page.locator('input[name="actual_invoice_number"]').fill(value);
    await this.searchAndWait();
  }
  async filterByShipper(value: string) {
    await this.page.locator('input[name="shipper"]').fill(value);
    await this.searchAndWait();
  }
  async filterByConsignee(value: string) {
    await this.page.locator('input[name="consignee"]').fill(value);
    await this.searchAndWait();
  }

  /** Same standalone-toolbar-Reset convention already confirmed on Job List/Shipping Bill List. Confirmed live (same real staging-concurrency issue already fixed on several other lists' own resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky since other real activity on the shared staging environment can genuinely change it in between - checking that a "N records" summary reappears at all is the real, reliable success signal. */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.heading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }
}

import { Page, Locator, expect } from '@playwright/test';

export interface ShippingBillCreateData {
  portOfFinalDestination: string;
  consigneeName: string;
  invoiceDate: string;
  cinNo: string;
  cinDate: string;
  cinSiteId: string;
  leoNo: string;
  leoDate: string;
}

/**
 * "Initiate SB" (Create Shipping Bill, `/cb/shippingBillForm?child_job_id={id}`) and the Shipping
 * Bill List (`/cb/shippingBill`, reached via CB -> "CB - Export Sea" submenu -> "Shipping Bill").
 * Confirmed live via direct UI discovery (never assumed):
 *
 * - Create Shipping Bill's real fields (screenshot-verified): SB No. / SB Date. / PKG / Gross Wt -
 *   Kgs/Lbs / NET Weight / Port of Loading / Port of Discharge / Exporter Name / Invoice No are ALL
 *   already pre-filled, carried straight over from the CB Job itself (Port of Loading genuinely
 *   shows the real value, e.g. "HARYANA" - confirmed live, not re-selected here). Only Port of
 *   Final Destination / Consignee Name / Invoice Date / CIN No. / CIN Dt / CIN SITE ID / LEO No. /
 *   LEO Date are genuinely empty and need filling. A Container table (Container No. / Seal No. /
 *   Product Type / Actions) is also pre-populated with the CB Job's own real container(s) - this is
 *   the first link in the Combined Job -> CB Job -> Shipping Bill -> Stuffing container chain this
 *   suite validates end-to-end. Buttons: Back / Cancel / Create.
 * - Shipping Bill List columns (confirmed live): Job No. / Combined Job No. / SB No. / SB Date /
 *   LEO No / Container No / Port of Loading / Port of Discharge / Actions. Confirmed live
 *   "Combined Job No." renders BLANK for jobs created through this automation's own flow (a real,
 *   confirmed app data-linkage gap, not a bug here) - SB No. (this suite's own generated value)
 *   remains the reliable row identifier. A row's own Actions are two icon-only buttons (View/Edit,
 *   confirmed by DOM order matching every other list in this suite's own convention) plus a text
 *   action that reads "Initiate Stuffing" before stuffing exists, or "Stuffing Initiated" (plain
 *   text, no longer clickable) once it does. The real Filter panel fields (confirmed live): SB No,
 *   Port of Loading, Port of Discharge, SB Date, Container No., LEO No., Job No., Combined Job No.
 */
export class ShippingBillPage {
  readonly page: Page;
  readonly createHeading: Locator;
  readonly pageHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createHeading = this.page.getByRole('heading', { name: 'Create Shipping Bill', exact: true });
    this.pageHeading = this.page.getByRole('heading', { name: 'Shipping Bill', exact: true });
  }

  async expectOnCreateForm() {
    await expect(this.createHeading).toBeVisible();
  }

  private async fillByLabel(label: string, value: string) {
    const field = this.page.locator('div.relative.group', { hasText: label }).first();
    await field.getByRole('textbox').fill(value);
  }

  private async fillDateByLabel(label: string, value: string) {
    const field = this.page.locator('div.relative.group', { hasText: label }).first();
    await field.locator('input[type="date"]').fill(value);
  }

  /** Fills only the genuinely empty fields - SB No./SB Date/PKG/Gross Wt/Net Weight/Port of Loading/Port of Discharge/Exporter Name/Invoice No are already pre-filled from the CB Job (confirmed live, never touched here). */
  async fillShippingBillCreateForm(data: ShippingBillCreateData) {
    await this.fillByLabel('Port of Final Destination', data.portOfFinalDestination);
    await this.fillByLabel('Consignee Name', data.consigneeName);
    await this.fillDateByLabel('Invoice Date', data.invoiceDate);
    await this.fillByLabel('CIN No.', data.cinNo);
    await this.fillDateByLabel('CIN Dt', data.cinDate);
    await this.fillByLabel('CIN SITE ID', data.cinSiteId);
    await this.fillByLabel('LEO No.', data.leoNo);
    await this.fillDateByLabel('LEO Date', data.leoDate);
  }

  /** Reads the Container No. column of the pre-populated Container table on the Create Shipping Bill form - the real values carried over from the CB Job, used for the end-to-end container cross-validation. Not anchored to row-start (this table's own Container No. happens to be the first column, but other Container tables in this chain are not shaped the same way - see StuffingPage's own comment). */
  async readContainerNumbers(): Promise<string[]> {
    const rows = this.page.locator('tbody tr').filter({ hasText: /[A-Z]{4}[0-9]{7}/ });
    const count = await rows.count();
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      const containerNo = cells[0]?.trim();
      if (containerNo) {
        numbers.push(containerNo);
      }
    }
    return numbers;
  }

  async clickCreate() {
    await this.page.getByRole('button', { name: 'Create', exact: true }).click();
  }

  // ---------- Shipping Bill List ----------

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const shippingBillVisible = await this.page.getByRole('button', { name: 'Shipping Bill', exact: true }).isVisible().catch(() => false);
    if (!shippingBillVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Shipping Bill', exact: true }).click({ timeout: 15_000 });
    await expect(this.pageHeading).toBeVisible();
  }

  getRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  async openFilter() {
    const alreadyOpen = await this.page.getByPlaceholder('SB No', { exact: true }).isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.page.getByRole('button', { name: 'Filter', exact: true }).click();
    }
    await expect(this.page.getByPlaceholder('SB No', { exact: true })).toBeVisible();
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 20_000 });
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  // Confirmed live these are plain placeholder-text inputs (no accessible role="textbox" name of
  // their own, unlike most fields elsewhere in this suite) - `getByPlaceholder` matches the visible
  // placeholder attribute directly rather than relying on accessible-name computation, which hung
  // indefinitely for "Port of Loading" specifically (root-caused via a real 15+ minute hung run).
  async filterBySbNo(value: string) {
    await this.page.getByPlaceholder('SB No', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByPortOfLoading(value: string) {
    await this.page.getByPlaceholder('Port of Loading', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByPortOfDischarge(value: string) {
    await this.page.getByPlaceholder('Port of Discharge', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterBySbDate(value: string) {
    await this.page.locator('div.relative.group', { hasText: 'SB Date' }).first().locator('input[type="date"]').fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByContainerNo(value: string) {
    await this.page.getByPlaceholder('Container No.', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByLeoNo(value: string) {
    await this.page.getByPlaceholder('LEO No.', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByJobNo(value: string) {
    await this.page.getByPlaceholder('Job No.', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }
  async filterByCombinedJobNo(value: string) {
    await this.page.getByPlaceholder('Combined Job No.', { exact: true }).fill(value, { timeout: 20_000 });
    await this.searchAndWait();
  }

  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /**
   * Same real behavior confirmed on Job List: the Filter panel auto-closes once Search succeeds,
   * leaving only the standalone toolbar "Reset" button (not scoped inside any `<form>`). Also
   * confirmed live (same real staging-concurrency issue already fixed on several other lists' own
   * resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky since
   * other real activity on the shared staging environment can genuinely change it in between -
   * checking that a "N records" summary reappears at all is the real, reliable success signal.
   */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  /** The row's first icon-only action button (confirmed-live DOM-order convention: View before Edit, same as every other list in this suite). */
  async viewShippingBill(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(0).click({ timeout: 20_000 });
  }

  async editShippingBill(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(1).click({ timeout: 20_000 });
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
  }

  async clickUpdate() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
  }

  /** Row action present while stuffing has not yet been initiated for this Shipping Bill (confirmed live - becomes plain, non-clickable text "Stuffing Initiated" afterward). */
  async initiateStuffing(sbNo: string) {
    await this.getRowBySbNo(sbNo).getByRole('button', { name: 'Initiate Stuffing', exact: true }).click({ timeout: 15_000 });
  }
}

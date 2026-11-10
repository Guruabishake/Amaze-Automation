import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown } from '../utils/commonActions';

export interface DraftInvoiceGeneralInfo {
  noOfInvoiceCopies: string;
  consigneeAddress1: string;
  consigneeAddress2: string;
  consigneeAddress3: string;
}

export interface DraftInvoiceItemEntry {
  description: string;
  qty: string;
  rate: string;
  currency: string;
}

/**
 * Draft Invoice (CB -> "CB - Export Sea" submenu -> "Draft Invoice", route `/cb/draftInvoice`,
 * heading "Draft Invoice") - reached from CB Job List's own "Initiate Draft Invoice" row action
 * (which creates the record directly, no separate creation form). Confirmed live via direct UI
 * discovery (never assumed):
 *
 * - List columns: Job No. / Combined Job No. / Invoice No. / SB/BE No. / Invoice Date / Shipper /
 *   Consignee / Status / Actions. A row has FOUR real actions, confirmed live DOM order: "Print"
 *   (text, index 0), an icon-only View (index 1), an icon-only Edit (index 2), "Initiate Final"
 *   (text, index 3).
 * - View route `draftInvoiceForm?...&id={id}&view=true`, heading (confirmed live, NOT "Draft
 *   Invoice - View" as might be assumed) "View More" - Back button only, read-only. Shows every
 *   General Information field plus the full Invoice Items table.
 * - Edit route `draftInvoiceForm?...&id={id}` (no `view=true`), heading "Draft Invoice - Edit".
 *   Confirmed live real fields: Invoice Date / Combined Job No / Contract / Sub Contract / Enquiry
 *   No / Quote No / Shipper / Shipper Address / SB / BE No / No of Invoice Copies / Shipper Invoice
 *   No / POL / POD / Commodity / Consignee / Consignee Address 1 / Consignee Address 2 / Consignee
 *   Address 3 / Cargo Type / Gross Wt / Net Wt / No of Packages / Container No - all pre-filled,
 *   carried over from the whole upstream chain (Enquiry/Quotation/Pricing/CB Job/Shipping Bill).
 *   This suite only fills the specific fields the real task requires: No of Invoice Copies,
 *   Consignee Address 1/2/3.
 * - The Invoice Items table arrives ALREADY populated (confirmed live: 16 real rows, one per real
 *   Buy/Sell charge entered earlier in Quotation/Pricing - Base Charge, Container Freight Security
 *   Surcharge, Customs Clearance & Documentation Fee, etc.) - "+Add New" (confirmed live real
 *   accessible name has the "+" and "Add New" as separate text nodes, so an exact match never
 *   resolves - a regex `/Add New/i` is required) opens a popup to add MORE items on top of those.
 *   Popup fields: Description (a real searchable combobox, same live Charge Description master
 *   list already confirmed elsewhere in this suite, "-Direct Incomes (CB)" tagged entries) / HSN/
 *   SAC Code (textbox, auto-fills from Description) / UOM (combobox) / Qty (textbox) / Rate
 *   (textbox) / Currency (combobox) / Exchange Rate (textbox, auto-fills from Currency) / Value in
 *   INR (textbox, auto-computes) / Taxable / Non Taxable (textboxes) - Cancel/Add buttons.
 * - Clicking "Update" on the Edit form navigates back to the Draft Invoice LIST with a real toast
 *   (`[role="status"]`) - captured by the caller via `captureToastAndScreenshot`, never assumed.
 * - "Initiate Final" (List row action): first click - toast "Final Invoice initiated successfully."
 *   and creates the real record on the separate "Final Invoice" list (`/cb/cbEsFinalInvoice`).
 *   Confirmed live the Draft Invoice row's own action button stays labelled "Initiate Final" even
 *   after this succeeds (no "already generated" state change on this list) - clicking it AGAIN on
 *   the SAME row is the real, confirmed way to exercise a genuine second invoice-initiation attempt
 *   (there is no separate "Initiate Invoice" button anywhere in the reachable UI - re-confirmed via
 *   a full DOM scan of both the Draft Invoice and Final Invoice lists). Its own real, distinct toast
 *   on that second click: "Final Invoice already initiated for this Draft Invoice."
 */
export class DraftInvoicePage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly viewHeading: Locator;
  readonly editHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'Draft Invoice', exact: true });
    this.viewHeading = this.page.getByRole('heading', { name: 'View More', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'Draft Invoice - Edit', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const linkVisible = await this.page.getByRole('button', { name: 'Draft Invoice', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Draft Invoice', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
  }

  getRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  async viewDraftInvoice(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible();
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
  }

  async editDraftInvoice(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(2).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible();
  }

  private async fillByLabel(label: string, value: string) {
    const field = this.page.locator('div.relative.group', { hasText: label }).first();
    await field.getByRole('textbox').fill(value, { timeout: 20_000 });
  }

  async fillGeneralInformation(data: DraftInvoiceGeneralInfo) {
    await this.fillByLabel('No of Invoice Copies', data.noOfInvoiceCopies);
    await this.fillByLabel('Consignee Address 1', data.consigneeAddress1);
    await this.fillByLabel('Consignee Address 2', data.consigneeAddress2);
    await this.fillByLabel('Consignee Address 3', data.consigneeAddress3);
  }

  /**
   * Confirmed live: "+Add New" real accessible name splits the "+" and "Add New" into separate
   * text nodes - an exact match never resolves, a regex is required (same real pattern already
   * confirmed on CB's own Add Package/Container/Cargo triggers). Description/Currency use the
   * same `selectCustomDropdown` default (exact match, Enter-to-select) already confirmed working
   * for this same master list elsewhere in this suite (PricingPage's own "Charge Description"/
   * "Buy Currency"/"Sell Currency" fields) - no field-specific override here since neither was
   * itself confirmed live to need one.
   *
   * Confirmed live real validation: the popup rejects a Description already present in the Draft
   * Invoice's own table ("This Charge description has already been added in the table.") without
   * closing itself - explicitly verifying the popup actually closes after "Add" turns that silent-
   * looking rejection into a clear failure instead of letting a caller believe the item was added.
   */
  async addInvoiceItem(data: DraftInvoiceItemEntry) {
    await this.page.getByRole('button', { name: /Add New/i }).click({ timeout: 20_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 20_000 });
    await selectCustomDropdown(this.page, 'Description', data.description);
    await this.fillByLabel('Qty', data.qty);
    await this.fillByLabel('Rate', data.rate);
    await selectCustomDropdown(this.page, 'Currency', data.currency);
    await this.page.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 20_000 });
    await expect(
      popup,
      `Add Invoice Item popup should close after "Add" - if it is still open, Description "${data.description}" was likely rejected as a duplicate already present in the table`
    ).not.toBeVisible({ timeout: 10_000 });
  }

  /** Real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickUpdate() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
  }

  /** First click on a given row creates the real Final Invoice record; a second click on the SAME row is the confirmed, real way to exercise a repeat invoice-initiation attempt (see class comment) - both produce their own distinct real toast, captured by the caller. */
  async initiateFinal(sbNo: string) {
    await this.getRowBySbNo(sbNo).getByRole('button', { name: 'Initiate Final', exact: true }).click({ timeout: 20_000 });
  }
}

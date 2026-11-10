import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectCustomDropdown } from '../utils/commonActions';

export interface CRORowData {
  jobNo: string;
  enquiryNo: string;
  croNo: string;
  croDate: string;
  linerBookingNo: string;
  productType: string;
  status: string;
}

export interface FFTransportPlanRecord {
  from: string;
  to: string;
  transhipmentPort: string;
  mode: string;
  vesselName: string;
  voyageNo: string;
  etd: string;
  eta: string;
}

/**
 * FF Export Sea's own "CRO List" (FF -> "FF - Export Sea" submenu -> "CRO", route
 * `/ff/exportseacro`, heading "CRO List") - reached from the FF Job List's own "Initiate CRO" row
 * action, which was already confirmed live (see FFJobPage.ts) to create a real, bare CRO record
 * immediately (no separate creation form - same "click action -> record auto-created" pattern
 * already confirmed for Draft Invoice/Final Invoice). Confirmed live via direct UI discovery
 * (never assumed):
 *
 * - List columns, confirmed real order: Job No. / Enquiry No / CRO No / CRO Date / Liner Booking No
 *   / Product Type / Status / Actions - `:scope > div` convention. Confirmed live real Status
 *   progression seen: "CRO Initiated" (bare, just-created) -> "CRO Received" (after the FF Job
 *   List's own Update Status action - a SEPARATE real record's own status was already "CRO
 *   Received" when explored). "Liner Booking No" is genuinely blank on a bare CRO - confirmed live
 *   it is a manually-entered field on the CRO Edit form (Contract No's own sibling), NOT
 *   auto-generated, unlike some other "No." fields elsewhere in this suite.
 * - A row has 3 real actions: icon-only View (index 0, heading "View More"), icon-only Edit
 *   (index 1, heading "CRO List - Edit"), and a real, confirmed-live "Initiate Stuffing" button
 *   (index 2) - confirmed live this is DISABLED until the CRO record is genuinely complete (exact
 *   full prerequisite not confirmed in isolation - a live exploration run against an already
 *   heavily-modified stale record found it disabled on every row shown, consistent with the CRO
 *   needing a complete state - Contract No, Equipment, Transport Plan, Document - before this
 *   suite's own full Edit flow below has ever been exercised on it). Callers must not assume it is
 *   always clickable.
 * - Filter panel: 5 real fields, confirmed live via their own `name` attributes: `child_job_no`
 *   ("Job No"), `enquiry_no` ("Enquiry No"), `cro_no` ("CRO No"), `cro_date` (native `type=date`),
 *   `liner_booking_no` ("Liner Booking No"). Same standalone Search/Reset toolbar convention as
 *   every other list in this suite.
 * - CRO Edit form (heading "CRO List - Edit") real sections, in order: basic fields (Job No./
 *   Enquiry No/CRO No/CRO Date read-only, Liner Booking No/Contract No fillable, Source/Destination
 *   read-only auto-filled from the source Combined Job, Shipper/Consignee) / "Equipment" (a real
 *   table pre-populated with ALL of the source Combined Job's own real containers - confirmed live
 *   the SAME containers this suite's own CB Export Sea automation already created - columns
 *   Container No./Size/Type/Temperature/Sub Equip/Gross Weight/Pack Qty-Kind/Cargo Volume/Actions,
 *   each row's own pencil=Edit, trash=Delete icons) / "Intended Transport Plan" (its own "+Add New"
 *   popup, real fields From/To as genuine searchable `role=combobox` pickers over a real 41-entry
 *   location master list e.g. "Adalaj"/"Agra ICD"/"Bangalore"/"Chennai Air", Transhipment
 *   Port/Mode/Vessel Name/Voyage No as plain textboxes, ETD/ETA as native `type=date` inputs) /
 *   "Upload Document" (Document Type combobox with exactly ONE real confirmed option, "CRO" - a
 *   single-purpose document category for this screen - + a native file input + "+Add Document").
 *   Cancel/Update buttons.
 * - Equipment row Edit (pencil icon): confirmed live opens a real popup (`div.fixed.inset-0.z-40`,
 *   the same backdrop convention already confirmed for Draft Invoice's own Add Item popup) with
 *   Container No./Size/Type (read-only/pre-filled), Sub Equip (the real fillable field, placeholder
 *   "Sub Equip"), Gross Weight/Pack Qty-Kind/Cargo Volume, and its OWN Cancel/Update buttons -
 *   confirmed live there are then TWO "Update" buttons on the page simultaneously (the popup's own
 *   and the main form's), so this suite always scopes to the popup's own button while it is open.
 *   Confirmed live: no `[role="status"]` toast was ever observed for this specific action across
 *   several live attempts - the real, reliable success signal is the Equipment table row's own
 *   value actually changing, which this suite verifies directly instead of assuming a toast exists.
 * - Equipment row Delete (trash icon): confirmed live opens a real confirmation popup (heading
 *   "Confirm Delete", buttons "No"/"Yes"). Confirmed live clicking "Yes" genuinely removes the row
 *   (table's own row count decreases by exactly one) - same real "no toast observed for this
 *   action" behavior as the Sub Equip update, so row-count change is the real success signal used
 *   here too.
 * - Main "Update" button: confirmed live real navigation back to the CRO List on success (heading
 *   "CRO List") - same "no `[role="status"]` toast observed" behavior confirmed live across
 *   multiple attempts for this whole CRO Edit screen's actions, so this suite treats the real
 *   navigation back to the List as the primary, confirmed success signal, while still attempting a
 *   best-effort toast capture (never hard-failing on its absence, and never fabricating text).
 */
export class CROPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly filterButton: Locator;
  readonly editHeading: Locator;
  readonly viewHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'CRO List', exact: true });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'CRO List - Edit', exact: true });
    this.viewHeading = this.page.getByRole('heading', { name: 'View More', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'FF', exact: true }).click();
    await this.page.waitForTimeout(300);
    const linkVisible = await this.page.getByRole('button', { name: 'CRO', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'FF - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'CRO', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  getRowByJobNo(jobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: jobNo }).first();
  }

  async readRowData(jobNo: string): Promise<CRORowData> {
    const row = this.getRowByJobNo(jobNo);
    await expect(row).toBeVisible({ timeout: 15_000 });
    let cells: string[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      cells = await row.locator(':scope > div').allInnerTexts();
      if ((cells[2] ?? '').trim() !== '') {
        break;
      }
      await this.page.waitForTimeout(500);
    }
    return {
      jobNo: (cells[0] ?? '').trim(),
      enquiryNo: (cells[1] ?? '').trim(),
      croNo: (cells[2] ?? '').trim(),
      croDate: (cells[3] ?? '').trim(),
      linerBookingNo: (cells[4] ?? '').trim(),
      productType: (cells[5] ?? '').trim(),
      status: (cells[6] ?? '').trim(),
    };
  }

  async openFilter() {
    const alreadyOpen = await this.page.locator('input[name="child_job_no"]').isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click();
    }
    await expect(this.page.locator('input[name="child_job_no"]')).toBeVisible();
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  async filterByJobNo(value: string) {
    await this.page.locator('input[name="child_job_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByEnquiryNo(value: string) {
    await this.page.locator('input[name="enquiry_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByCroNo(value: string) {
    await this.page.locator('input[name="cro_no"]').fill(value);
    await this.searchAndWait();
  }
  /** `value` must be `YYYY-MM-DD` (native `type=date` input value format). */
  async filterByCroDate(value: string) {
    await this.page.locator('input[name="cro_date"]').fill(value);
    await this.searchAndWait();
  }
  async filterByLinerBookingNo(value: string) {
    await this.page.locator('input[name="liner_booking_no"]').fill(value);
    await this.searchAndWait();
  }

  /** Confirmed live (same real staging-concurrency issue already fixed on several other lists' own resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky since other real activity on the shared staging environment can genuinely change it in between - checking that a "N records" summary reappears at all is the real, reliable success signal. */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  async viewCRO(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(0).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible();
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  async editCRO(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible();
  }

  async fillLinerBookingNo(value: string) {
    await this.page.locator('input[name="liner_booking_no"]').fill(value);
  }

  async fillContractNo(value: string) {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText('Contract No', { exact: true }) }).first();
    await field.getByRole('textbox').fill(value);
  }

  private getEquipmentTable(): Locator {
    return this.page.locator('table', { hasText: 'CONTAINER NO.' }).first();
  }

  getEquipmentRowByContainerNo(containerNo: string): Locator {
    return this.getEquipmentTable().locator('tbody tr').filter({ hasText: containerNo }).first();
  }

  async getEquipmentRowCount(): Promise<number> {
    return this.getEquipmentTable().locator('tbody tr').count();
  }

  /**
   * Confirmed live: opens a real popup (backdrop `div.fixed.inset-0.z-40`) with its own Sub Equip
   * field and its own Update button (a SECOND "Update" button coexists with the main form's while
   * this popup is open). Confirmed live no toast appears for this action - the row's own Sub Equip
   * cell value actually changing is the real, verified success signal, checked by the caller.
   */
  async editEquipmentSubEquip(containerNo: string, subEquip: string) {
    const row = this.getEquipmentRowByContainerNo(containerNo);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.page.getByPlaceholder('Sub Equip').fill(subEquip);
    await popup.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  /** Confirmed live: a real "Confirm Delete" popup with No/Yes buttons - only confirms via "Yes" when that popup is actually displayed. */
  async deleteEquipment(containerNo: string) {
    const row = this.getEquipmentRowByContainerNo(containerNo);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
  }

  private getTransportPlanTable(): Locator {
    return this.page.locator('table', { hasText: 'FROM' }).first();
  }

  async getTransportPlanRowCount(): Promise<number> {
    return this.getTransportPlanTable().locator('tbody tr').count();
  }

  /**
   * The 2nd "+Add New" button on the CRO Edit form belongs to Intended Transport Plan (the 1st
   * belongs to Equipment). Confirmed live across several real runs that checking the table's own
   * aggregate ROW COUNT as the success signal is fundamentally unreliable here - it can be fooled
   * by timing coincidences (another record's own insert landing at the moment this one is polled),
   * repeatedly producing an exact "created 9 of 10" undercount with no thrown error pointing at
   * which record was actually missing. Waiting for THIS record's own row (matched by its unique
   * Voyage No) to become visible is the real, direct success condition - it can never be satisfied
   * by an unrelated row, unlike a bare count.
   */
  async addTransportPlanRecord(record: FFTransportPlanRecord) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.getByRole('button', { name: /Add New/i }).nth(1).click({ timeout: 20_000 });
        await selectCustomDropdown(this.page, 'From', record.from);
        await selectCustomDropdown(this.page, 'To', record.to);
        await this.page.locator('div.relative.group', { hasText: 'Transhipment Port' }).first().getByRole('textbox').fill(record.transhipmentPort);
        await this.page.locator('div.relative.group', { hasText: 'Mode' }).first().getByRole('textbox').fill(record.mode);
        await this.page.locator('div.relative.group', { hasText: 'Vessel Name' }).first().getByRole('textbox').fill(record.vesselName);
        await this.page.locator('div.relative.group', { hasText: 'Voyage No' }).first().getByRole('textbox').fill(record.voyageNo);
        await this.page.locator('div.relative.group', { hasText: 'ETD' }).first().locator('input').fill(record.etd);
        await this.page.locator('div.relative.group', { hasText: 'ETA' }).first().locator('input').fill(record.eta);
        await this.page.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 20_000 });
        await expect(this.getTransportPlanTable().locator('tbody tr').filter({ hasText: record.voyageNo }).first()).toBeVisible({ timeout: 25_000 });
        return;
      } catch (err) {
        lastError = err;
        console.log(`addTransportPlanRecord attempt ${attempt} for voyage "${record.voyageNo}" did not register - retrying.`);
        // Best-effort: if the popup is still open from the failed attempt, close it via ITS OWN
        // Cancel (scoped to the popup backdrop) before retrying - never the main form's own
        // same-labeled Cancel, which would discard every other real change already made on this
        // CRO Edit form (Liner Booking No/Contract No/Equipment edits/prior transport records).
        const popup = this.page.locator('div.fixed.inset-0.z-40').first();
        if (await popup.isVisible().catch(() => false)) {
          await popup.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 5_000 }).catch(() => {});
        }
      }
    }
    throw lastError;
  }

  /** Confirmed live: exactly ONE real Document Type option, "CRO". */
  async uploadDocument(documentType: string, filePath: string) {
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath, { timeout: 20_000 });
    await this.page.getByRole('button', { name: /Add Document/i }).click({ timeout: 20_000 });
    const fileName = path.basename(filePath);
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Confirmed live: submits and navigates back to the real CRO List on success - the real,
   * confirmed success signal (no toast was ever observed for this action across several live
   * attempts). Also attempts a best-effort toast read for reporting, never hard-failing on its
   * absence.
   */
  async clickMainUpdate(): Promise<string> {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
    let toastText = '';
    for (let i = 0; i < 6; i++) {
      const toast = this.page.locator('[role="status"]').first();
      if (await toast.isVisible().catch(() => false)) {
        toastText = (await toast.innerText().catch(() => '')).trim();
        if (toastText) break;
      }
      await this.page.waitForTimeout(300);
    }
    await expect(this.listHeading, 'CRO Update should navigate back to the real CRO List on success').toBeVisible({ timeout: 20_000 });
    return toastText;
  }

  /** Confirmed live: this button is genuinely DISABLED until the CRO record is complete - callers must check `isEnabled` rather than assume it is always clickable. */
  getInitiateStuffingButton(jobNo: string): Locator {
    return this.getRowByJobNo(jobNo).getByRole('button', { name: 'Initiate Stuffing', exact: true });
  }
}

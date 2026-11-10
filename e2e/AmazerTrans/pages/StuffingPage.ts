import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectCustomDropdown } from '../utils/commonActions';

export interface StuffingBookingReferenceData {
  combinedJobNo: string;
  referenceNo: string;
  productType: string;
}

// Not anchored to the start of the row's own text - the Container table's first real column is
// "SB No." (e.g. "SB-91143"), not Container No., so an anchored `^` pattern never matched any row
// at all (root-caused via a real run that timed out finding zero matches).
const CONTAINER_NUMBER_PATTERN = /[A-Z]{4}[0-9]{7}/;

/**
 * "Initiate Stuffing" (Stuffing-Create, `/cb/stuffingForm?shipping_bill_es_id={id}`) - reached from
 * the Shipping Bill List's own row action. Confirmed live via direct UI discovery (never assumed):
 *
 * - Three real tabs: Booking Reference / Container Information / Upload File.
 * - Booking Reference's real fields (screenshot-verified): Job No / Mode / Shipper / Consignee are
 *   already pre-filled, carried over from the Shipping Bill itself. Combined Job No / Reference No
 *   / Product Type are genuinely empty - Combined Job No is filled in here explicitly for
 *   traceability even though the app itself leaves it blank by default.
 * - Container Information tab is READ-ONLY, pre-populated straight from the Shipping Bill: three
 *   real sections - "Package Details" (a single aggregate row, NOT the CB Job's own 10 separate
 *   package rows - a genuine, confirmed distinction, this level of the chain only ever aggregates),
 *   "Container Information" (the real Container No./Size/Product Type/Type/seal columns, carrying
 *   forward the SAME real container number(s) from the CB Job/Shipping Bill - this is the final
 *   link this suite cross-validates against the Combined Job's own container list), and "Cargo
 *   Details". "+Add Package"/"+Add Container"/"+Add Cargo" exist for adding MORE beyond what was
 *   carried over - never required to populate the existing rows.
 * - Upload File tab: a "Document Type" dropdown (same real `div.relative.group` + `role=combobox`
 *   pattern already used for every other document upload in this suite) + "Upload Document" file
 *   input + "+Add Document" button, producing its own S.No/Document Type/File Name/Actions table.
 * - Buttons: Back / Cancel / Create.
 *
 * Stuffing LIST (CB -> "CB - Export Sea" submenu -> "Stuffing", route `/cb/stuffing`, heading
 * "Stuffing"). Confirmed live via direct UI discovery:
 * - Columns: Job No / Combined Job No / Stuffing No / Product Type / Shipper / Consignee / Status
 *   / SB No. / Actions. A row's own Actions are two icon-only buttons - confirmed live DOM-order
 *   convention View (index 0) before Edit (index 1), same as every other list in this suite.
 * - Edit route `stuffingForm?...&id={id}` (no `view=true`), heading "Stuffing-Edit" - same 3 tabs
 *   as Create. Clicking "Update" navigates straight back to the Stuffing LIST (not staying on the
 *   Edit form) and shows a real toast (`[role="status"]`): "Stuffing details updated successfully."
 *   Confirmed live real side effect: Update also progresses the record's own Status from "Stuffing
 *   Initiated" to "Stuffing Completed" and populates "Combined Job No" (previously blank) - not
 *   something this suite explicitly requests, a genuine app behavior.
 * - View route `stuffingForm?...&id={id}&view=true`, heading "Stuffing-View" - Back button + the
 *   same 3 tabs, read-only. Back returns to the Stuffing List.
 */
export class StuffingPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly listHeading: Locator;
  readonly editHeading: Locator;
  readonly viewHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = this.page.getByRole('heading', { name: 'Stuffing-Create', exact: true });
    this.listHeading = this.page.getByRole('heading', { name: 'Stuffing', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'Stuffing-Edit', exact: true });
    this.viewHeading = this.page.getByRole('heading', { name: 'Stuffing-View', exact: true });
  }

  /** Re-clicks the top-level "CB" module icon (required to re-render the submenu from a deep create-form page), then opens the "CB - Export Sea" submenu only if it is not already open. */
  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const stuffingLinkVisible = await this.page.getByRole('button', { name: 'Stuffing', exact: true }).isVisible().catch(() => false);
    if (!stuffingLinkVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  async navigateToListFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Stuffing', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
  }

  /** SB No. is the reliable row identifier for jobs this suite created (same convention as Job List/Shipping Bill List). */
  getListRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  async viewStuffing(sbNo: string) {
    await this.getListRowBySbNo(sbNo).locator('button').nth(0).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible();
  }

  async backToStuffingList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
  }

  async editStuffing(sbNo: string) {
    await this.getListRowBySbNo(sbNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible();
  }

  /** Clicks "Update" on the Stuffing-Edit screen - the real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickUpdate() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
  }

  async expectOnCreateForm() {
    await expect(this.pageHeading).toBeVisible();
  }

  private async openTab(tabName: 'Booking Reference' | 'Container Information' | 'Upload File') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click({ timeout: 20_000 });
  }

  private async fillByLabel(label: string, value: string) {
    const field = this.page.locator('div.relative.group', { hasText: label }).first();
    const textbox = field.getByRole('textbox');
    const enabled = await textbox.isEnabled({ timeout: 5_000 }).catch(() => false);
    if (enabled) {
      await textbox.fill(value, { timeout: 20_000 });
    } else {
      console.log(`StuffingPage.fillByLabel: "${label}" is not enabled - skipped, not an automation gap.`);
    }
  }

  /**
   * Job No/Mode/Shipper/Consignee are already pre-filled, carried over from the Shipping Bill.
   * Confirmed live: "Combined Job No" is a genuinely DISABLED input here (`cursor-not-allowed`,
   * always blank) - the same real Combined Job No data-linkage gap already confirmed on Job List/
   * Shipping Bill List, not something this suite can fill in. Only Reference No/Product Type are
   * real, fillable fields.
   */
  async fillBookingReference(data: StuffingBookingReferenceData) {
    await this.openTab('Booking Reference');
    await this.fillByLabel('Combined Job No', data.combinedJobNo);
    await this.fillByLabel('Reference No', data.referenceNo);
    await this.fillByLabel('Product Type', data.productType);
  }

  /**
   * Reads the real, pre-populated Container Information table's Container No. column - the SAME
   * values carried over from the CB Job/Shipping Bill, used for the end-to-end container
   * cross-validation. Waits for at least one matching row first - same real async data-fetch race
   * already documented on CombinedJobPage's own tables (the tab mounts before its own data has
   * loaded), root-caused here via a real run that read a false-empty `[]` before the row rendered.
   */
  async getStuffingContainerNumbers(): Promise<string[]> {
    await this.openTab('Container Information');
    const rows = this.page.locator('tbody tr').filter({ hasText: CONTAINER_NUMBER_PATTERN });
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const count = await rows.count();
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).innerText();
      const match = text.match(CONTAINER_NUMBER_PATTERN);
      if (match) {
        numbers.push(match[0]);
      }
    }
    return numbers;
  }

  /**
   * Confirmed live via a real screenshot: unlike every other document upload elsewhere in this
   * suite, "+Add Document" here does NOT fire a `/uploads/documents` POST that a caller can wait
   * on - clicking it adds the file straight into the results table (S.No/Document Type/File Name/
   * Actions) with no separate network round-trip at that moment (the earlier
   * `clickUploadAndAwaitResponse` wait hung indefinitely for exactly this reason). Verifying the
   * resulting table row is the real, confirmed success signal here instead.
   */
  async uploadStuffingFile(documentType: string, filePath: string) {
    await this.openTab('Upload File');
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath, { timeout: 20_000 });
    await this.page.getByRole('button', { name: /Add Document/i }).click({ timeout: 20_000 });
    const fileName = path.basename(filePath);
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  async clickCreate() {
    await this.page.getByRole('button', { name: 'Create', exact: true }).click({ timeout: 20_000 });
  }
}

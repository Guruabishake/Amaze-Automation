import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectFromOpenDropdownPanel } from '../utils/commonActions';
import { FFHblPartyData, FFHblGeneralInfoData, FFHblContainerEditData, FFHblFreightRateEditData } from '../utils/testData';

export interface FFHblRowData {
  hblNo: string;
  productType: string;
  shipper: string;
  consignee: string;
  status: string;
}

export type PrintMechanism = 'download' | 'new-tab' | 'same-tab-navigation' | 'unknown';

/**
 * FF Export Sea's own "HBL Generation" module - reached from the FF Job List's own "Initiate HBL"
 * row action. Confirmed live via direct UI discovery (never assumed):
 *
 * - List columns: HBL No / Product Type / Shipper / Consignee / Status / Actions. A row has 3
 *   icon-only actions, confirmed live DOM order: View (index 0), Edit (index 1), Print (index 2).
 *   Print triggers a real in-app PDF generation flow (toasts "Fetching details & generating
 *   PDF..." then "PDF generated successfully.") - the REAL resulting artifact (download/new tab/
 *   navigation) is detected live, never assumed.
 * - The Create/Edit screen is a SINGLE continuous scrollable page (route-distinct heading "HBL
 *   Generation - Create" vs "HBL Generation - Edit"), NOT a tabbed form. Header fields (read-only,
 *   pre-filled): Job No/Enquiry No/HBL No/HBL Date/MBL No. Below that, 6 COLLAPSIBLE ACCORDION
 *   sections (collapsed by default, click the section's own heading text to expand - confirmed
 *   live plain clickable text, not a `role=button`): "Shipper", "Consignee", "Notify Party",
 *   "Forwarder Agent", "General Information", "Upload Document". "Freight Rates,Weight and/Or
 *   Measurement" is its own heading but NOT collapsible - its table is always visible once
 *   General Information's own accordion (which the Container table and this Freight Rates section
 *   both visually follow) is expanded.
 * - Shipper/Consignee/Notify Party/Forwarder Agent all share the SAME real 7-field set: Company
 *   Name / Address 1 / Address 2 / Address 3 / Mobile No / Land Line No / Email (confirmed live
 *   label is "Land Line No", not "Lead Line No"). Shipper's own Company Name is a real combobox
 *   pre-filled from the upstream Customer record; Consignee's likely the same. Notify Party/
 *   Forwarder Agent are free-standing entities - their Company Name is a plain fillable textbox.
 * - General Information's real fields, confirmed live: Export Reference / Export Instruction /
 *   Pre Carriage By / Place of Receipt By Pre-carrier / Exporting Carrier Voyage (textboxes) /
 *   Port of Loading / Port of Discharge (real comboboxes, pre-filled from the upstream chain, left
 *   as-is) / Port of Delivery (real combobox, confirmed live empty - a real option is selected,
 *   never guessed) / Loading Pier/Terminal (textbox) / Type of Move (real combobox, confirmed live
 *   PRE-FILLED "Port To Port" already - left as-is if already set) / No Of Originals / Vessel &
 *   Voyage No / Point & Country of Origin of Goods / Freight Payable at (textboxes) /
 *   "Containerized" - a single real `<input type=checkbox>` (NOT a per-container-row selection
 *   table as might be assumed; the Container Information table below has no checkbox column of
 *   its own - confirmed live via a full page scan, only one checkbox exists anywhere on this form).
 * - Container Information table (no own section heading - renders directly after the Containerized
 *   checkbox once General Information is expanded), confirmed real column order: MARK AND NUMBERS
 *   / CONTAINER NO. / CONTAINER SEAL NO. / NUMBER OF PACKAGES / DESCRIPTION OF COMMODITIES / GROSS
 *   WEIGHT / MEASUREMENT (CBM) / SHIPPING ON BOARD / ACTIONS. Arrives pre-populated with this
 *   job's own real containers (same "data arrives already filled" convention already confirmed on
 *   Stuffing/CB). Confirmed live: the row's own pencil Edit icon does NOT open a popup - it
 *   switches the ROW ITSELF into inline edit (each cell becomes a real textarea/input in place),
 *   and the same Actions cell button (now a save/tick icon, the only button left in that row)
 *   commits it - there is no separate Cancel in this inline mode.
 * - "Freight Rates,Weight and/Or Measurement" table, confirmed real column order: SUBJECT
 *   CORRECTION / PREPAID / COLLECT / GRAND TOTAL (auto-computed, never filled) / ACTIONS - same
 *   real inline-edit-via-pencil/tick mechanism as the Container table.
 * - "Upload Document" accordion: a Document Type combobox (real option list never confirmed live -
 *   the first real, live-rendered option is selected, same defensible pattern already used
 *   elsewhere in this suite) + a native file input + its own small table (S.NO/DOCUMENT
 *   TYPE/FILE NAME/ACTIONS) listing already-uploaded documents.
 * - "Place and Date Of Issue" / "Shipping Line Name" are two more standalone textboxes that sit
 *   AFTER the Upload Document accordion, not inside any of the sections above.
 */
export class HBLPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly createHeading: Locator;
  readonly editHeading: Locator;
  readonly filterButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'HBL Generation', exact: true });
    this.createHeading = this.page.getByRole('heading', { name: /HBL Generation\s*-\s*Create/i });
    this.editHeading = this.page.getByRole('heading', { name: /HBL Generation\s*-\s*Edit/i });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
  }

  async expectOnCreateScreen() {
    await expect(this.createHeading).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Confirmed live: unlike Stuffing No, "HBL No" is NOT yet assigned on a fresh Create screen (the
   * field is genuinely empty until the first Update actually persists the record) - callers should
   * capture the real HBL No from the LIST after Update instead (see `readTopRow`), not from this
   * header field pre-Update. Explicit timeout + empty-string fallback so a genuinely blank field
   * fails fast rather than hanging the whole run.
   */
  async getHblNo(): Promise<string> {
    return this.page.locator('div.relative.group', { hasText: 'HBL No' }).first().getByRole('textbox').inputValue({ timeout: 10_000 }).catch(() => '');
  }

  /** The topmost real data row on the List - confirmed live convention throughout this suite that a freshly created/updated record sorts first. Used to capture the real HBL No once Update has actually persisted it, when no other identifier is available yet. */
  async readTopRow(): Promise<FFHblRowData> {
    const rows = this.page.locator('div[style*="grid-template-columns"]');
    const row = rows.nth(1);
    await expect(row).toBeVisible({ timeout: 15_000 });
    let cells: string[] = [];
    await expect(async () => {
      cells = await row.locator(':scope > div').allInnerTexts();
      expect((cells[0] ?? '').trim()).not.toBe('');
    }).toPass({ timeout: 8_000 }).catch(() => {});
    return {
      hblNo: (cells[0] ?? '').trim(),
      productType: (cells[1] ?? '').trim(),
      shipper: (cells[2] ?? '').trim(),
      consignee: (cells[3] ?? '').trim(),
      status: (cells[4] ?? '').trim(),
    };
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'FF', exact: true }).click();
    const linkVisible = await this.page.getByRole('button', { name: 'HBL Generation', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'FF - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'HBL Generation', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible({ timeout: 15_000 });
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  getRowByHblNo(hblNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: hblNo }).first();
  }

  async readRowData(hblNo: string): Promise<FFHblRowData> {
    const row = this.getRowByHblNo(hblNo);
    await expect(row).toBeVisible({ timeout: 15_000 });
    let cells: string[] = [];
    await expect(async () => {
      cells = await row.locator(':scope > div').allInnerTexts();
      expect((cells[0] ?? '').trim()).not.toBe('');
    }).toPass({ timeout: 8_000 }).catch(() => {});
    return {
      hblNo: (cells[0] ?? '').trim(),
      productType: (cells[1] ?? '').trim(),
      shipper: (cells[2] ?? '').trim(),
      consignee: (cells[3] ?? '').trim(),
      status: (cells[4] ?? '').trim(),
    };
  }

  async openFilter() {
    const alreadyOpen = await this.page.getByPlaceholder(/HBL No/i).first().isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click({ timeout: 15_000 });
    }
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click({ timeout: 15_000 });
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible({ timeout: 20_000 });
  }

  async filterByHbl(value: string) {
    await this.page.getByPlaceholder(/HBL No/i).first().fill(value, { timeout: 15_000 });
    await this.searchAndWait();
  }

  /** Real control type for this filter was never confirmed live - tries a combobox first (this suite's own common pattern for "Product Type"), falling back to a plain text filter. */
  async filterByProductType(value: string) {
    const combo = this.page.locator('div.relative.group', { has: this.page.getByText('Product Type', { exact: true }) }).first().getByRole('combobox');
    if (await combo.isVisible().catch(() => false)) {
      await combo.click({ timeout: 10_000 });
      await selectFromOpenDropdownPanel(this.page, value, 'exact', false);
    } else {
      await this.page.getByPlaceholder(/Product Type/i).first().fill(value, { timeout: 15_000 });
    }
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

  /** Same real staging-concurrency issue already fixed on every other list's own resetFilter in this suite: checking that a "N records" summary reappears at all is the reliable success signal, not an exact pre-filter count. */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  async viewHbl(hblNo: string) {
    await this.getRowByHblNo(hblNo).locator('button').nth(0).click({ timeout: 20_000 });
  }

  async editHbl(hblNo: string) {
    await this.getRowByHblNo(hblNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible({ timeout: 15_000 });
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Confirmed live: a lingering react-hot-toast overlay (`[data-rht-toaster]`) can sit directly
   * over a submit button and intercept pointer events on it for the entire default click timeout
   * - same real issue already confirmed on FFStuffingPage's own popups. Waiting for it to clear
   * first, then falling back to a forced click if it's somehow still in the way.
   */
  private async clickResilient(locator: Locator, timeout = 20_000) {
    const toast = this.page.locator('[data-rht-toaster]').first();
    await toast.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
    await locator.click({ timeout }).catch(async () => {
      await locator.click({ timeout: 10_000, force: true });
    });
  }

  /**
   * Confirmed live via direct DOM inspection: filling a field can silently drop the value if
   * something else on the page re-renders at the same moment (same real React controlled-input
   * race already confirmed on FFStuffingPage's own Vessel popup and FFDraftInvoicePage's own
   * fields). Verifying the field's actual value after each fill and retrying closes that race.
   */
  private async fillAndVerify(field: Locator, value: string, label: string) {
    let actual = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await field.fill(value, { timeout: 20_000 });
      actual = await field.inputValue().catch(() => '');
      if (actual === value) return;
      console.log(`HBLPage.fillAndVerify: "${label}" did not hold value "${value}" (got "${actual}") on attempt ${attempt} - retrying.`);
    }
    throw new Error(`HBLPage.fillAndVerify: "${label}" still reads "${actual}" instead of "${value}" after 3 attempts.`);
  }

  private groupField(label: string, instanceIndex = 0): Locator {
    return this.page.locator('div.relative.group', { hasText: label }).nth(instanceIndex);
  }

  private async fillByLabel(label: string, value: string, instanceIndex = 0) {
    await this.fillAndVerify(this.groupField(label, instanceIndex).getByRole('textbox'), value, label);
  }

  /**
   * Confirmed live: section headers are plain clickable text, not `role=button` - clicking the
   * SAME section twice would toggle it back closed, so this probes a field unique to that section
   * first and skips the click if it is already expanded/visible.
   */
  private async expandSection(name: string, probeLabel: string, probeIndex = 0) {
    const probe = this.groupField(probeLabel, probeIndex);
    const alreadyVisible = await probe.isVisible().catch(() => false);
    if (!alreadyVisible) {
      await this.page.getByText(name, { exact: true }).first().click({ timeout: 15_000 });
      await expect(probe).toBeVisible({ timeout: 10_000 });
    }
  }

  /** Scoped to the FIRST (Shipper) occurrence of these shared field labels - confirmed live Shipper is first in DOM order among the four party sections. */
  async fillShipper(data: { address3: string; landLineNo: string }) {
    await this.expandSection('Shipper', 'Address 1', 0);
    await this.fillByLabel('Address 3', data.address3, 0);
    await this.fillByLabel('Land Line No', data.landLineNo, 0);
  }

  /** Scoped to the SECOND (Consignee) occurrence of these shared field labels. */
  async fillConsignee(data: { address1: string; mobileNo: string; landLineNo: string; email: string }) {
    await this.expandSection('Consignee', 'Address 1', 1);
    await this.fillByLabel('Address 1', data.address1, 1);
    await this.fillByLabel('Mobile No', data.mobileNo, 1);
    await this.fillByLabel('Land Line No', data.landLineNo, 1);
    await this.fillByLabel('Email', data.email, 1);
  }

  /** Scoped to the THIRD (Notify Party) occurrence. */
  async fillNotifyParty(data: FFHblPartyData) {
    await this.expandSection('Notify Party', 'Address 1', 2);
    await this.fillByLabel('Company Name', data.companyName, 2);
    await this.fillByLabel('Address 1', data.address1, 2);
    await this.fillByLabel('Address 2', data.address2, 2);
    await this.fillByLabel('Address 3', data.address3, 2);
    await this.fillByLabel('Mobile No', data.mobileNo, 2);
    await this.fillByLabel('Land Line No', data.landLineNo, 2);
    await this.fillByLabel('Email', data.email, 2);
  }

  /** Scoped to the FOURTH (Forwarder Agent) occurrence. */
  async fillForwarderAgent(data: FFHblPartyData) {
    await this.expandSection('Forwarder Agent', 'Address 1', 3);
    await this.fillByLabel('Company Name', data.companyName, 3);
    await this.fillByLabel('Address 1', data.address1, 3);
    await this.fillByLabel('Address 2', data.address2, 3);
    await this.fillByLabel('Address 3', data.address3, 3);
    await this.fillByLabel('Mobile No', data.mobileNo, 3);
    await this.fillByLabel('Land Line No', data.landLineNo, 3);
    await this.fillByLabel('Email', data.email, 3);
  }

  /** Selects the first real, live-rendered option for a combobox field whose real option list was never confirmed live - same defensible technique used elsewhere in this suite, never a guessed value. */
  private async selectFirstAvailableOption(label: string): Promise<string> {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText(label, { exact: true }) }).first();
    await field.getByRole('combobox').click({ timeout: 15_000 });
    const option = this.page.locator('li').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    const value = (await option.innerText()).trim();
    await selectFromOpenDropdownPanel(this.page, value, 'exact', false);
    return value;
  }

  /** Returns the real Type of Move value actually used, since it is confirmed live to sometimes already be pre-filled on an existing record (left as-is rather than forced) though it starts genuinely empty on a fresh record. */
  async fillGeneralInformation(data: FFHblGeneralInfoData): Promise<{ typeOfMove: string }> {
    await this.expandSection('General Information', 'Export Reference');
    await this.fillByLabel('Export Reference', data.exportReference);
    await this.fillByLabel('Export Instruction', data.exportInstruction);
    await this.fillByLabel('Pre Carriage By', data.preCarriageBy);
    await this.fillByLabel('Place of Receipt By Pre-carrier', data.placeOfReceiptByPreCarrier);
    // Confirmed live: despite sitting beside the real Port of Loading/Port of Discharge
    // comboboxes, "Port of Delivery" is itself a plain textbox, not a combobox.
    await this.fillByLabel('Port of Delivery', data.portOfDelivery);
    await this.fillByLabel('Loading Pier/Terminal', data.loadingPierTerminal);
    const typeOfMoveCombo = this.groupField('Type of Move').getByRole('combobox');
    const existingTypeOfMove = (await typeOfMoveCombo.innerText().catch(() => '')).trim();
    const typeOfMove = existingTypeOfMove || (await this.selectFirstAvailableOption('Type of Move'));
    if (existingTypeOfMove) {
      console.log(`HBLPage.fillGeneralInformation: "Type of Move" is already set to "${existingTypeOfMove}" - left as-is.`);
    }
    await this.fillByLabel('No Of Originals', data.noOfOriginals);
    await this.fillByLabel('Point & Country of Origin of Goods', data.pointCountryOriginOfGoods);
    await this.fillByLabel('Freight Payable at', data.freightPayableAt);
    await this.fillByLabel('Vessel & Voyage No', data.vesselVoyageNo);
    await this.fillByLabel('Place and Date Of Issue', data.placeAndDateOfIssue);
    await this.fillByLabel('Shipping Line Name', data.shippingLineName);
    return { typeOfMove };
  }

  /** The single real "Containerized" checkbox (confirmed live - not a per-row selection table). */
  async checkContainerized(): Promise<boolean> {
    const checkbox = this.page.getByRole('checkbox');
    const alreadyChecked = await checkbox.isChecked().catch(() => false);
    if (!alreadyChecked) {
      await checkbox.check({ timeout: 10_000 });
    }
    return checkbox.isChecked();
  }

  private getContainerTable(): Locator {
    return this.page.locator('table', { hasText: 'MARK AND NUMBERS' }).first();
  }

  async getContainerRowCount(): Promise<number> {
    return this.getContainerTable().locator('tbody tr').count();
  }

  getContainerRowByContainerNo(containerNo: string): Locator {
    return this.getContainerTable().locator('tbody tr').filter({ hasText: containerNo }).first();
  }

  /** Confirmed real column order: Mark and Numbers(0)/Container No.(1)/Container Seal No(2)/Number of Packages(3)/Description of Commodities(4)/Gross Weight(5)/Measurement (CBM)(6)/Shipping on Board(7). Column 1 (Container No.) is intentionally left untouched. */
  async getContainerNumbersInTable(): Promise<string[]> {
    const rows = this.getContainerTable().locator('tbody tr');
    const count = await rows.count();
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).locator('td').allInnerTexts();
      numbers.push((cells[1] ?? '').trim());
    }
    return numbers;
  }

  /**
   * Confirmed live: the row's own pencil Edit icon switches the ROW ITSELF into inline edit
   * (textarea/input per cell) - no popup. The same Actions-cell button (now a save/tick icon)
   * commits it. Confirmed live via a real failure: locating the row by `hasText: containerNo`
   * (via `getContainerRowByContainerNo`) stops matching ANYTHING once edit mode starts, because
   * the Container No. cell's own text then lives inside an `<input value="...">` - an input's
   * value is never part of its text content, so a `hasText` filter re-evaluated after that point
   * resolves to zero elements. Locating the row by its stable POSITION in the table instead (found
   * once, before entering edit mode) survives that transition.
   */
  async editContainerRow(containerNo: string, data: FFHblContainerEditData) {
    const allRows = this.getContainerTable().locator('tbody tr');
    const rowCount = await allRows.count();
    let rowIndex = -1;
    for (let i = 0; i < rowCount; i++) {
      const text = await allRows.nth(i).innerText().catch(() => '');
      if (text.includes(containerNo)) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) {
      throw new Error(`HBLPage.editContainerRow: no row found for container ${containerNo}.`);
    }
    const row = allRows.nth(rowIndex);
    await row.locator('button').first().click({ timeout: 15_000 });
    const cells = row.locator('td');
    await this.fillAndVerify(cells.nth(0).locator('textarea, input'), data.markAndNumbers, `Container ${containerNo} - Mark and Numbers`);
    await this.fillAndVerify(cells.nth(2).locator('textarea, input'), data.containerSealNo, `Container ${containerNo} - Container Seal No`);
    await this.fillAndVerify(cells.nth(3).locator('textarea, input'), data.numberOfPackages, `Container ${containerNo} - Number of Packages`);
    await this.fillAndVerify(cells.nth(4).locator('textarea, input'), data.descriptionOfCommodities, `Container ${containerNo} - Description of Commodities`);
    await this.fillAndVerify(cells.nth(5).locator('textarea, input'), data.grossWeight, `Container ${containerNo} - Gross Weight`);
    await this.fillAndVerify(cells.nth(6).locator('textarea, input'), data.measurementCbm, `Container ${containerNo} - Measurement (CBM)`);
    await this.fillAndVerify(cells.nth(7).locator('textarea, input'), data.shippingOnBoard, `Container ${containerNo} - Shipping on Board`);
    await this.clickResilient(row.locator('button').first());
    await expect(row.locator('textarea, input')).toHaveCount(0, { timeout: 15_000 });
  }

  private getFreightRateTable(): Locator {
    return this.page.locator('table', { hasText: 'SUBJECT CORRECTION' }).first();
  }

  async getFreightRateRowCount(): Promise<number> {
    return this.getFreightRateTable().locator('tbody tr').count();
  }

  /** Confirmed real column order: Subject Correction(0)/Prepaid(1)/Collect(2)/Grand Total(3, auto-computed, never filled). Same inline pencil/tick edit mechanism as the Container table. */
  async editFreightRateRow(rowIndex: number, data: FFHblFreightRateEditData) {
    const row = this.getFreightRateTable().locator('tbody tr').nth(rowIndex);
    await row.locator('button').first().click({ timeout: 15_000 });
    const cells = row.locator('td');
    await this.fillAndVerify(cells.nth(0).locator('textarea, input'), data.subjectCorrection, 'Freight Rate - Subject Correction');
    await this.fillAndVerify(cells.nth(1).locator('textarea, input'), data.prepaid, 'Freight Rate - Prepaid');
    await this.fillAndVerify(cells.nth(2).locator('textarea, input'), data.collect, 'Freight Rate - Collect');
    await this.clickResilient(row.locator('button').first());
    await expect(row.locator('textarea, input')).toHaveCount(0, { timeout: 15_000 });
  }

  /** Document Type's real option list was never confirmed live - the first real, live-rendered option is selected and returned, never a guessed value. */
  async uploadDocument(filePath: string): Promise<string> {
    await this.expandSection('Upload Document', 'Document Type');
    const docType = await this.selectFirstAvailableOption('Document Type');
    await this.page.locator('input[type="file"]').first().setInputFiles(filePath);
    await this.clickResilient(this.page.getByRole('button', { name: /Add Document/i }));
    return docType;
  }

  /** Confirmed live: the submit button reads "Create" on the fresh Create screen (first-ever save) and "Update" on the Edit screen for an already-created record - checked rather than assumed. */
  async clickUpdate() {
    const updateBtn = this.page.getByRole('button', { name: 'Update', exact: true });
    const createBtn = this.page.getByRole('button', { name: 'Create', exact: true });
    // Confirmed live: on Edit the form renders after navigation, so an immediate isVisible() can
    // run before either button exists and wrongly fall through to "Create" - wait for one first.
    await updateBtn.or(createBtn).first().waitFor({ state: 'visible', timeout: 20_000 });
    if (await updateBtn.isVisible().catch(() => false)) {
      await this.clickResilient(updateBtn);
    } else {
      await this.clickResilient(createBtn);
    }
  }

  /**
   * Clicks the LIST row's own Print action and detects whatever the app ACTUALLY does with it
   * (never assumed in advance) - races a real Playwright `download` event against a new tab/page
   * opening against a same-tab navigation, same proven strategy already used on FF's own Draft
   * Invoice list Print action. Confirmed live this action shows its own real toasts ("Fetching
   * details & generating PDF..." then "PDF generated successfully.") before the real artifact
   * (whichever it turns out to be) appears.
   */
  async clickListPrintAndHandle(hblNo: string, destDir: string): Promise<{ mechanism: PrintMechanism; fileName?: string; savedPath?: string; url?: string }> {
    const urlBefore = this.page.url();
    const downloadPromise = this.page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
    const newPagePromise = this.page.context().waitForEvent('page', { timeout: 20_000 }).catch(() => null);

    await this.getRowByHblNo(hblNo).locator('button').nth(2).click({ timeout: 20_000 });

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

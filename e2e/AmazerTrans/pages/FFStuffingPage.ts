import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectCustomDropdown, selectFromOpenDropdownPanel } from '../utils/commonActions';

export interface FFStuffingRowData {
  jobNo: string;
  combinedJobNo: string;
  enquiryNo: string;
  stuffingNo: string;
  sbNo: string;
  productType: string;
  shipper: string;
  consignee: string;
  status: string;
}

export interface FFBookingReferenceData {
  mblNo: string;
  hblNo: string;
}

export interface FFScheduleData {
  carrier: string;
  scac: string;
  haulage: string;
  originOffice: string;
  carrierBkg: string;
}

export interface FFVesselRecord {
  vessel: string;
  voyageMode: string;
  voyageNo: string;
  from: string;
  to: string;
  siCutOff: string;
  vgmCutOff: string;
  gateIn: string;
  amsCutOff: string;
  imoNo: string;
  etd: string;
  eta: string;
}

export interface FFPackageRecord {
  noOfPkgs: string;
  grossWeight: string;
  netWeight: string;
  uom: string;
}

export interface FFContainerRecord {
  containerNo: string;
  size: string;
  type: string;
  customsSeal: string;
  shipperSeal: string;
  linerSeal: string;
}

export interface FFCargoRecord {
  cargoName: string;
  hsCode: string;
  commodity: string;
}

export interface FFHblGroupRecord {
  sbNo: string;
  sbDate: string;
  hblGrouping: string;
  hblBkgForm: string;
  noOfPackages: string;
  kindOfPkgs: string;
  grossWeight: string;
  netWeight: string;
  cbm: string;
}

/**
 * FF Export Sea's own "Stuffing" screen (FF -> "FF - Export Sea" submenu -> "Stuffing", route
 * `/ff/exportSeaStuffing`, heading "Stuffing") - reached from the CRO List's own "Initiate
 * Stuffing" row action once a CRO record is fully complete (see CROPage.ts). This is a DIFFERENT,
 * unrelated screen from CB's own Stuffing (`StuffingPage.ts`, CB Export Sea's `/cb/stuffing*`
 * routes) - no code/locators are shared between them. Confirmed live via direct UI discovery
 * (never assumed):
 *
 * - List columns, confirmed real order: Job No. / Enquiry No / Stuffing No / SB No. / Product Type
 *   / Shipper / Consignee / Status / Actions - `:scope > div` convention. Real confirmed Status
 *   values: "Stuffing Initiated" (fresh) / "Stuffing Completed" (after the real Update flow below
 *   fully succeeds) - the EXACT string this suite's own final status check requires.
 * - A row has 2 icon-only actions, same real DOM-order convention as every other list in this
 *   suite: View (index 0, heading "Stuffing-View" - unlike other lists' own "View More", this
 *   screen follows the same "Stuffing-X" convention as its own Edit screen) then Edit (index 1,
 *   heading "Stuffing-Edit").
 * - Filter panel: 7 real fields, confirmed live via their own `name` attributes: `child_job_no`
 *   ("Job No"), `enquiry_no` ("Enquiry No"), `stuffing_no` ("stuffing No"), `product_type`
 *   ("product type"), `shipper` ("shipper"), `consignee` ("consignee"), `actual_invoice_number`
 *   ("SB Number" - the SAME real field name already confirmed reused for Vendor Bill's own SB
 *   filter). Same standalone Search/Reset toolbar convention as every other list in this suite.
 * - Edit form (heading "Stuffing-Edit") has 5 real tabs: "Booking Reference" (Job No/Enquiry
 *   No/Reference No/Stuffing No read-only, MBL No/HBL No plain fillable textboxes, Mode/Product
 *   Type read-only, BL/AWB Type a real `role=combobox`, Shipper/Consignee read-only) / "Schedule"
 *   (Carrier/SCAC/Haulage/Contract/Origin Office/Destination Office/Carrier BKG plain textboxes;
 *   POL/POD read-only, auto-filled from the source Combined Job) / "Vessel Information" (its own
 *   "+Add Vessel" popup) / "Container Information" (confirmed live this ONE tab bundles FOUR real
 *   sub-sections together - Package Details/Container Information/Cargo Details/HBL Group - each
 *   with its own "+Add ..." trigger, NOT four separate top-level tabs as might be assumed) /
 *   "Upload File" (Document Type combobox + native file input + "+Add Document").
 * - Confirmed live real DATA CONTINUITY across this suite's own already-completed stages: the
 *   Vessel Information table arrives PRE-POPULATED with this SAME job's own 10 real Intended
 *   Transport Plan records already entered on the CRO Edit form (same Vessel/Voyage/From/To/ETD/
 *   ETA values) - Package Details/Container Information/Cargo Details similarly arrive
 *   pre-populated from the source Combined Job's own real package/container/cargo data (the SAME
 *   10 real containers, seals already carried over from the original CB Job creation). This
 *   suite's own "add N records" checks must therefore always use a before/after row-count DELTA,
 *   never an absolute expected total.
 * - "+Add Vessel" popup real fields, confirmed live: Vessel (textbox) / Voyage Mode (`role=
 *   combobox`) / Voyage No (textbox) / From (`role=combobox`, the SAME real location master list
 *   already confirmed on CRO's own Transport Plan) / To (`role=combobox`) / SI Cut Off/VGM Cut
 *   Off/Gate In/AMS Cut Off (native `type=date`) / IMO No (textbox) / ETD/ETA (native `type=date`).
 *   Cancel/Add buttons (a SECOND "Cancel" coexists with the main form's own while this is open).
 * - "+Add Package" popup: No of Pkgs/Gross Weight/Net Weight/UOM, all plain textboxes.
 *   Cancel/Save buttons (this popup submits via "Save", not "Add").
 * - "+Add Container" popup: Container No. (textbox) / Size (`role=combobox`) / Type (`role=
 *   combobox`) / Customs seal no./Shipper seal no./Liner seal no. (plain textboxes).
 *   Cancel/Save buttons.
 * - "+Add Cargo" popup: Cargo Name (confirmed live NOT a real master-list picker despite its
 *   `role=combobox` markup - opening it shows zero options and no search box; the app's own real
 *   existing Cargo Name values are themselves freely-generated strings, e.g. "QA CB Cargo 49087" -
 *   this suite fills it directly as free text) / HS Code / Commodity (plain textboxes).
 *   Cancel/Save buttons.
 * - "+Add New" (HBL Group) popup: SB No./HBL Grouping/HBL BKG form/No of Packages/Kind of
 *   Pkgs/Gross Weight(KGs)/Net Weight(KGs)/CBM (plain textboxes) / SB Date (native `type=date`) /
 *   POL/POD (`role=combobox`, pre-filled from the source Combined Job, same real location list).
 *   Cancel/Add buttons (this popup submits via "Add", unlike Package/Container/Cargo's "Save").
 * - Row Edit (pencil, index 0)/Delete (trash, index 1) icons confirmed live for Vessel and Package
 *   rows, same real popup (`div.fixed.inset-0.z-40`) + "Confirm Delete" (No/Yes) convention already
 *   established for CRO's own Equipment table.
 */
export class FFStuffingPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly filterButton: Locator;
  readonly editHeading: Locator;
  readonly viewHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'Stuffing', exact: true });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'Stuffing-Edit', exact: true });
    // Confirmed live: unlike other lists in this suite (which use "View More"), this screen's own
    // real heading follows the same "Stuffing-X" convention as its Edit screen ("Stuffing-Edit").
    this.viewHeading = this.page.getByRole('heading', { name: 'Stuffing-View', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'FF', exact: true }).click();
    await this.page.waitForTimeout(300);
    const linkVisible = await this.page.getByRole('button', { name: 'Stuffing', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'FF - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Stuffing', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  getRowByJobNo(jobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: jobNo }).first();
  }

  async readRowData(jobNo: string): Promise<FFStuffingRowData> {
    const row = this.getRowByJobNo(jobNo);
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The app has added a "Combined Job No" column between Job No and Enquiry No since this was
    // first written (confirmed live via error-context.md header dump: Job No / Combined Job No /
    // Enquiry No / Stuffing No / SB No. / Product Type / Shipper / Consignee / Status / Actions) -
    // same real column-shift class of issue already confirmed on FFJobPage's own readRowData, so
    // every field after Job No is read as an OFFSET from the real Job No column (matched by its own
    // stable "FFJOB-" prefix), not an absolute position, to survive further shifts.
    let cells: string[] = [];
    let jobNoIndex = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
      cells = (await row.locator(':scope > div').allInnerTexts()).map((c) => c.trim());
      jobNoIndex = cells.findIndex((c) => c.startsWith('FFJOB-'));
      if (jobNoIndex >= 0 && (cells[jobNoIndex + 3] ?? '') !== '') {
        break;
      }
      await this.page.waitForTimeout(500);
    }
    const at = (offset: number) => (jobNoIndex >= 0 ? (cells[jobNoIndex + offset] ?? '').trim() : '');
    return {
      jobNo: jobNoIndex >= 0 ? cells[jobNoIndex] : '',
      combinedJobNo: at(1),
      enquiryNo: at(2),
      stuffingNo: at(3),
      sbNo: at(4),
      productType: at(5),
      shipper: at(6),
      consignee: at(7),
      status: at(8),
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
  async filterByStuffingNo(value: string) {
    await this.page.locator('input[name="stuffing_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByProductType(value: string) {
    await this.page.locator('input[name="product_type"]').fill(value);
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
  async filterBySbNo(value: string) {
    await this.page.locator('input[name="actual_invoice_number"]').fill(value);
    await this.searchAndWait();
  }

  /** Confirmed live (same real staging-concurrency issue already fixed on several other lists' own resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky since other real activity on the shared staging environment can genuinely change it in between - checking that a "N records" summary reappears at all is the real, reliable success signal. */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  async viewStuffing(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(0).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible();
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.filterButton).toBeVisible({ timeout: 15_000 });
  }

  async editStuffing(jobNo: string) {
    await this.getRowByJobNo(jobNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible();
  }

  async openTab(tabName: 'Booking Reference' | 'Schedule' | 'Vessel Information' | 'Container Information' | 'Upload File') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click({ timeout: 20_000 });
  }

  /**
   * Confirmed live via direct DOM inspection: filling several of this popup's fields back-to-back
   * in immediate succession can silently drop or truncate a value (e.g. a date field left "" after
   * `.fill()` reported success, or "IMO999" landing as just "999") - a real React controlled-input
   * timing race, not a scripting mistake. Verifying the field's actual `value` after each fill and
   * retrying closes that race instead of trusting `.fill()`'s own resolution.
   */
  private async fillAndVerify(locator: Locator, value: string, label: string) {
    let actual = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      await locator.fill(value, { timeout: 15_000 });
      actual = await locator.inputValue().catch(() => '');
      if (actual === value) return;
      console.log(`FFStuffingPage.fillAndVerify: "${label}" did not hold value "${value}" (got "${actual}") on attempt ${attempt} - retrying.`);
      await this.page.waitForTimeout(400);
    }
    throw new Error(`FFStuffingPage.fillAndVerify: "${label}" still reads "${actual}" instead of "${value}" after 3 attempts.`);
  }

  /**
   * Confirmed live: a lingering react-hot-toast overlay (`[data-rht-toaster]`) can sit directly
   * over one of these popups' own submit button ("Add"/"Save"/"Update") and intercept ALL pointer
   * events on it for the entire default click timeout - not the button being genuinely
   * disabled/hidden/covered by another field, just an unrelated toast still finishing its own
   * dismiss animation. Waiting (bounded) for it to clear first, then falling back to a forced
   * click if it's somehow still in the way, avoids failing on it.
   */
  private async clickResilient(locator: Locator, timeout = 20_000) {
    const toast = this.page.locator('[data-rht-toaster]').first();
    await toast.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
    await locator.click({ timeout }).catch(async () => {
      await locator.click({ timeout: 10_000, force: true });
    });
  }

  /** Confirmed live: "Origin Office" is genuinely disabled on this form (same real "skip disabled fields, don't force them" convention already established elsewhere in this suite, e.g. CB's own StuffingPage.fillByLabel) - checks enabled state first rather than assuming every textbox is fillable. */
  private async fillGroupTextbox(label: string, value: string) {
    const textbox = this.page.locator('div.relative.group', { hasText: label }).first().getByRole('textbox');
    const enabled = await textbox.isEnabled({ timeout: 10_000 }).catch(() => false);
    if (enabled) {
      await this.fillAndVerify(textbox, value, label);
    } else {
      console.log(`FFStuffingPage.fillGroupTextbox: "${label}" is not enabled - skipped, not an automation gap.`);
    }
  }

  private async fillGroupDateInput(label: string, value: string) {
    const input = this.page.locator('div.relative.group', { hasText: label }).first().locator('input');
    await this.fillAndVerify(input, value, label);
  }

  /**
   * Confirmed live via direct DOM inspection (Vessel popup's own SI/VGM/Gate In/AMS Cut Off
   * fields): a field can silently stay "" after a normal `.fill()` if one of ITS OWN SIBLING
   * date fields hasn't been filled yet - a real cross-field validation dependency ("Gate In" kept
   * resetting to "" until AMS Cut Off/ETD/ETA also had values, even though Gate In's own value was
   * perfectly valid on its own). Filling every field in the group once, then re-checking and
   * re-filling any that didn't hold across a few passes, resolves this without needing to know the
   * exact dependency rule or reorder the fill sequence to guess it.
   */
  private async fillAndReconcileGroup(entries: Array<{ label: string; value: string }>) {
    const locatorFor = (label: string) => this.page.locator('div.relative.group', { hasText: label }).first().locator('input');
    for (const { label, value } of entries) {
      await locatorFor(label).fill(value, { timeout: 15_000 }).catch(() => {});
    }
    for (let pass = 1; pass <= 3; pass++) {
      let allOk = true;
      for (const { label, value } of entries) {
        const loc = locatorFor(label);
        const actual = await loc.inputValue().catch(() => '');
        if (actual !== value) {
          allOk = false;
          await loc.fill(value, { timeout: 15_000 }).catch(() => {});
        }
      }
      if (allOk) return;
    }
    for (const { label, value } of entries) {
      const actual = await locatorFor(label).inputValue().catch(() => '');
      if (actual !== value) {
        console.log(`FFStuffingPage.fillAndReconcileGroup: "${label}" still reads "${actual}" instead of "${value}" after reconciliation.`);
      }
    }
  }

  /** Selects the first real, live-rendered option for a combobox field whose real option list was never confirmed live - same defensible technique used for BL/AWB Type/Document Type/Vendor Bill's Company GST, never a guessed value. */
  private async selectFirstAvailableOption(label: string): Promise<string> {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText(label, { exact: true }) }).first();
    await field.getByRole('combobox').click({ timeout: 15_000 });
    const option = this.page.locator('li').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    const value = (await option.innerText()).trim();
    await selectFromOpenDropdownPanel(this.page, value, 'exact', false);
    return value;
  }

  /**
   * `BL/AWB Type`'s real option list was never confirmed live (a real `role=combobox`, but its
   * options were not inspected) - rather than guess a value, this selects the first real,
   * live-rendered option (same defensible technique already used for Vendor Bill's own Company
   * GST) and returns the actual selected text for the caller to report.
   */
  async fillBookingReference(data: FFBookingReferenceData): Promise<string> {
    await this.openTab('Booking Reference');
    await this.fillGroupTextbox('MBL No', data.mblNo);
    await this.fillGroupTextbox('HBL No', data.hblNo);
    return this.selectFirstAvailableOption('BL/AWB Type');
  }

  /** Confirmed live: "Haulage" is a real `role=combobox`, not a plain textbox as first assumed (that wrong assumption caused a real, unbounded hang before a timeout guard existed) - its real option list was never confirmed, so the first available real option is selected rather than a guessed value. */
  async fillSchedule(data: FFScheduleData): Promise<string> {
    await this.openTab('Schedule');
    await this.fillGroupTextbox('Carrier', data.carrier);
    await this.fillGroupTextbox('SCAC', data.scac);
    const haulageUsed = await this.selectFirstAvailableOption('Haulage');
    await this.fillGroupTextbox('Origin Office', data.originOffice);
    await this.fillGroupTextbox('Carrier BKG', data.carrierBkg);
    return haulageUsed;
  }

  // ---------------- Vessel Information ----------------

  private getVesselTable(): Locator {
    return this.page.locator('table', { hasText: 'VOYAGE MODE' }).first();
  }

  async getVesselRowCount(): Promise<number> {
    return this.getVesselTable().locator('tbody tr').count();
  }

  getVesselRowByVoyageNo(voyageNo: string): Locator {
    return this.getVesselTable().locator('tbody tr').filter({ hasText: voyageNo }).first();
  }

  private async fillVesselPopupFields(record: FFVesselRecord) {
    await this.fillGroupTextbox('Vessel', record.vessel);
    await selectCustomDropdown(this.page, 'Voyage Mode', record.voyageMode);
    await this.fillGroupTextbox('Voyage No', record.voyageNo);
    await selectCustomDropdown(this.page, 'From', record.from);
    await selectCustomDropdown(this.page, 'To', record.to);
    await this.fillAndReconcileGroup([
      { label: 'SI Cut Off', value: record.siCutOff },
      { label: 'VGM Cut Off', value: record.vgmCutOff },
      { label: 'Gate In', value: record.gateIn },
      { label: 'AMS Cut Off', value: record.amsCutOff },
      { label: 'ETD', value: record.etd },
      { label: 'ETA', value: record.eta },
    ]);
    await this.fillGroupTextbox('IMO No', record.imoNo);
  }

  /**
   * Bounded retry (as already confirmed necessary for this same shared popup component on CRO's
   * own Transport Plan). Confirmed live across several real runs that checking the table's own
   * aggregate ROW COUNT as the success signal is fundamentally unreliable - it can be fooled by
   * timing coincidences, repeatedly producing an undercount with no thrown error pointing at which
   * record was actually missing. Waiting for THIS record's own row (by its unique Voyage No) is
   * the real, direct success condition instead.
   */
  async addVesselRecord(record: FFVesselRecord) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.page.getByRole('button', { name: /Add Vessel/i }).click({ timeout: 20_000 });
        await this.fillVesselPopupFields(record);
        await this.clickResilient(this.page.getByRole('button', { name: 'Add', exact: true }));
        await expect(this.getVesselRowByVoyageNo(record.voyageNo)).toBeVisible({ timeout: 25_000 });
        return;
      } catch (err) {
        lastError = err;
        console.log(`addVesselRecord attempt ${attempt} for voyage "${record.voyageNo}" did not register - retrying.`);
        const popup = this.page.locator('div.fixed.inset-0.z-40').first();
        if (await popup.isVisible().catch(() => false)) {
          await popup.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 5_000 }).catch(() => {});
        }
      }
    }
    throw lastError;
  }

  async editVesselRecord(voyageNo: string, newValues: FFVesselRecord) {
    const row = this.getVesselRowByVoyageNo(voyageNo);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.fillVesselPopupFields(newValues);
    await popup.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  async openVesselEditThenCancel(voyageNo: string) {
    const row = this.getVesselRowByVoyageNo(voyageNo);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await popup.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 15_000 });
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  // ---------------- Package Information ----------------

  private getPackageTable(): Locator {
    return this.page.locator('table', { hasText: 'NO OF PKGS' }).first();
  }

  async getPackageRowCount(): Promise<number> {
    return this.getPackageTable().locator('tbody tr').count();
  }

  getPackageRowByGrossWeight(grossWeight: string): Locator {
    return this.getPackageTable().locator('tbody tr').filter({ hasText: grossWeight }).first();
  }

  private async fillPackagePopupFields(record: FFPackageRecord) {
    await this.fillGroupTextbox('No of Pkgs', record.noOfPkgs);
    await this.fillGroupTextbox('Gross Weight', record.grossWeight);
    await this.fillGroupTextbox('Net Weight', record.netWeight);
    await this.fillGroupTextbox('UOM', record.uom);
  }

  async addPackageRecord(record: FFPackageRecord) {
    await this.page.getByRole('button', { name: /Add Package/i }).click({ timeout: 20_000 });
    await this.fillPackagePopupFields(record);
    await this.clickResilient(this.page.getByRole('button', { name: 'Save', exact: true }));
    await expect(this.getPackageRowByGrossWeight(record.grossWeight)).toBeVisible({ timeout: 25_000 });
  }

  async editPackageRecord(grossWeight: string, newValues: FFPackageRecord) {
    const row = this.getPackageRowByGrossWeight(grossWeight);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.fillPackagePopupFields(newValues);
    // Confirmed live: like Cargo's own edit popup, this submits via "Save" (matching its Add
    // popup), not "Update" - checked rather than assumed.
    const updateBtn = popup.getByRole('button', { name: 'Update', exact: true });
    const saveBtn = popup.getByRole('button', { name: 'Save', exact: true });
    if (await updateBtn.isVisible().catch(() => false)) {
      await this.clickResilient(updateBtn);
    } else {
      await this.clickResilient(saveBtn);
    }
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  async deletePackageRecord(grossWeight: string) {
    const countBefore = await this.getPackageRowCount();
    const row = this.getPackageRowByGrossWeight(grossWeight);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
    await expect(async () => {
      expect(await this.getPackageRowCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 25_000 });
  }

  // ---------------- Container Information ----------------

  private getContainerTable(): Locator {
    return this.page.locator('table', { hasText: 'CONTAINER NO.' }).first();
  }

  async getContainerRowCount(): Promise<number> {
    return this.getContainerTable().locator('tbody tr').count();
  }

  getContainerRowByContainerNo(containerNo: string): Locator {
    return this.getContainerTable().locator('tbody tr').filter({ hasText: containerNo }).first();
  }

  private async fillContainerPopupFields(record: FFContainerRecord) {
    await this.fillGroupTextbox('Container No.', record.containerNo);
    await selectCustomDropdown(this.page, 'Size', record.size);
    await selectCustomDropdown(this.page, 'Type', record.type);
    await this.fillGroupTextbox('Customs seal no.', record.customsSeal);
    await this.fillGroupTextbox('Shipper seal no.', record.shipperSeal);
    await this.fillGroupTextbox('Liner seal no.', record.linerSeal);
  }

  async addContainerRecord(record: FFContainerRecord) {
    await this.page.getByRole('button', { name: /Add Container/i }).click({ timeout: 20_000 });
    await this.fillGroupTextbox('Container No.', record.containerNo);
    await selectCustomDropdown(this.page, 'Size', record.size);
    await selectCustomDropdown(this.page, 'Type', record.type);
    await this.fillGroupTextbox('Customs seal no.', record.customsSeal);
    await this.fillGroupTextbox('Shipper seal no.', record.shipperSeal);
    // Confirmed live elsewhere in this suite: "Liner seal no." is genuinely disabled for GP
    // containers - fill it only if enabled, never force it.
    const linerField = this.page.locator('div.relative.group', { hasText: 'Liner seal no.' }).first().getByRole('textbox');
    if (await linerField.isEnabled({ timeout: 5_000 }).catch(() => false)) {
      await linerField.fill(record.linerSeal, { timeout: 15_000 });
    }
    await this.clickResilient(this.page.getByRole('button', { name: 'Save', exact: true }));
    await expect(this.getContainerRowByContainerNo(record.containerNo)).toBeVisible({ timeout: 25_000 });
  }

  async editContainerRecord(containerNo: string, newValues: FFContainerRecord) {
    const row = this.getContainerRowByContainerNo(containerNo);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.fillGroupTextbox('Container No.', newValues.containerNo);
    await selectCustomDropdown(this.page, 'Size', newValues.size);
    await selectCustomDropdown(this.page, 'Type', newValues.type);
    await this.fillGroupTextbox('Customs seal no.', newValues.customsSeal);
    await this.fillGroupTextbox('Shipper seal no.', newValues.shipperSeal);
    // Confirmed live: like Package/Cargo's own edit popups, this submits via "Save" (matching its
    // Add popup), not "Update" - checked rather than assumed.
    const updateBtn = popup.getByRole('button', { name: 'Update', exact: true });
    const saveBtn = popup.getByRole('button', { name: 'Save', exact: true });
    if (await updateBtn.isVisible().catch(() => false)) {
      await this.clickResilient(updateBtn);
    } else {
      await this.clickResilient(saveBtn);
    }
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  async deleteContainerRecord(containerNo: string) {
    const countBefore = await this.getContainerRowCount();
    const row = this.getContainerRowByContainerNo(containerNo);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
    await expect(async () => {
      expect(await this.getContainerRowCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 25_000 });
  }

  // ---------------- Cargo Details ----------------

  private getCargoTable(): Locator {
    return this.page.locator('table', { hasText: 'CARGO NAME' }).first();
  }

  async getCargoRowCount(): Promise<number> {
    return this.getCargoTable().locator('tbody tr').count();
  }

  getCargoRowByName(cargoName: string): Locator {
    return this.getCargoTable().locator('tbody tr').filter({ hasText: cargoName }).first();
  }

  /** Confirmed live: despite its `role=combobox` markup, this field has no real option list/search box - it is filled directly as free text. */
  private async fillCargoPopupFields(record: FFCargoRecord) {
    const cargoNameField = this.page.locator('div.relative.group', { hasText: 'Cargo Name' }).first();
    await cargoNameField.locator('input').fill(record.cargoName, { timeout: 15_000 });
    await this.fillGroupTextbox('HS Code', record.hsCode);
    await this.fillGroupTextbox('Commodity', record.commodity);
  }

  async addCargoRecord(record: FFCargoRecord) {
    await this.page.getByRole('button', { name: /Add Cargo/i }).click({ timeout: 20_000 });
    await this.fillCargoPopupFields(record);
    await this.clickResilient(this.page.getByRole('button', { name: 'Save', exact: true }));
    await expect(this.getCargoRowByName(record.cargoName)).toBeVisible({ timeout: 25_000 });
  }

  /** Confirmed live via the real UI: this row's own Update action is labelled "Save" like Add, not "Update" - inspected live rather than assumed. */
  async editCargoRecord(cargoName: string, newValues: FFCargoRecord) {
    const row = this.getCargoRowByName(cargoName);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.fillCargoPopupFields(newValues);
    const updateBtn = popup.getByRole('button', { name: 'Update', exact: true });
    const saveBtn = popup.getByRole('button', { name: 'Save', exact: true });
    if (await updateBtn.isVisible().catch(() => false)) {
      await this.clickResilient(updateBtn);
    } else {
      await this.clickResilient(saveBtn);
    }
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  async deleteCargoRecord(cargoName: string) {
    const countBefore = await this.getCargoRowCount();
    const row = this.getCargoRowByName(cargoName);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
    await expect(async () => {
      expect(await this.getCargoRowCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 25_000 });
  }

  // ---------------- HBL Group ----------------

  private getHblGroupTable(): Locator {
    return this.page.locator('table', { hasText: 'HBL GROUPING' }).first();
  }

  async getHblGroupRowCount(): Promise<number> {
    const rows = this.getHblGroupTable().locator('tbody tr');
    const count = await rows.count();
    if (count === 1 && (await rows.first().innerText()).includes('No data available')) {
      return 0;
    }
    return count;
  }

  getHblGroupRowBySbNo(sbNo: string): Locator {
    return this.getHblGroupTable().locator('tbody tr').filter({ hasText: sbNo }).first();
  }

  private async fillHblGroupPopupFields(record: FFHblGroupRecord) {
    await this.fillGroupTextbox('SB No.', record.sbNo);
    await this.fillGroupDateInput('SB Date', record.sbDate);
    await this.fillGroupTextbox('HBL Grouping', record.hblGrouping);
    await this.fillGroupTextbox('HBL BKG form', record.hblBkgForm);
    await this.fillGroupTextbox('No of Packages', record.noOfPackages);
    await this.fillGroupTextbox('Kind of Pkgs', record.kindOfPkgs);
    await this.fillGroupTextbox('Gross Weight(KGs)', record.grossWeight);
    await this.fillGroupTextbox('Net Weight(KGs)', record.netWeight);
    await this.fillGroupTextbox('CBM', record.cbm);
  }

  async addHblGroupRecord(record: FFHblGroupRecord) {
    await this.page.getByRole('button', { name: /Add New/i }).last().click({ timeout: 20_000 });
    await this.fillHblGroupPopupFields(record);
    await this.clickResilient(this.page.getByRole('button', { name: 'Add', exact: true }));
    await expect(this.getHblGroupRowBySbNo(record.sbNo)).toBeVisible({ timeout: 25_000 });
  }

  async editHblGroupRecord(sbNo: string, newValues: FFHblGroupRecord) {
    const row = this.getHblGroupRowBySbNo(sbNo);
    await row.locator('button').nth(0).click({ timeout: 15_000 });
    const popup = this.page.locator('div.fixed.inset-0.z-40').first();
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await this.fillHblGroupPopupFields(newValues);
    // Defensive dual-check (same real ambiguity already confirmed on Package/Container/Cargo's own
    // edit popups): this Add popup submits via "Add", so "Update" is expected here, but checked
    // rather than assumed since this path has not yet been exercised live.
    const updateBtn = popup.getByRole('button', { name: 'Update', exact: true });
    const saveBtn = popup.getByRole('button', { name: 'Save', exact: true });
    if (await updateBtn.isVisible().catch(() => false)) {
      await this.clickResilient(updateBtn);
    } else {
      await this.clickResilient(saveBtn);
    }
    await expect(popup).not.toBeVisible({ timeout: 15_000 });
  }

  async deleteHblGroupRecord(sbNo: string) {
    const countBefore = await this.getHblGroupRowCount();
    const row = this.getHblGroupRowBySbNo(sbNo);
    await row.locator('button').nth(1).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Confirm Delete', exact: true })).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('button', { name: 'Yes', exact: true }).click({ timeout: 15_000 });
    await expect(async () => {
      expect(await this.getHblGroupRowCount()).toBe(countBefore - 1);
    }).toPass({ timeout: 25_000 });
  }

  // ---------------- Upload / Update ----------------

  /**
   * `Document Type`'s real option list for this specific Upload File tab was never confirmed live -
   * rather than guess a value, this selects the first real, live-rendered option (same defensible
   * technique already used for Vendor Bill's own Company GST) and returns the actual selected text.
   */
  async uploadDocument(filePath: string): Promise<string> {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText('Document Type', { exact: true }) }).first();
    await field.getByRole('combobox').click({ timeout: 15_000 });
    const option = this.page.locator('li').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    const documentType = (await option.innerText()).trim();
    await selectFromOpenDropdownPanel(this.page, documentType, 'exact', false);

    await this.page.locator('input[type="file"]').setInputFiles(filePath, { timeout: 20_000 });
    await this.page.getByRole('button', { name: /Add Document/i }).click({ timeout: 20_000 });
    const fileName = path.basename(filePath);
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20_000 });
    return documentType;
  }

  /** Real success signal is navigation back to the List (same confirmed convention as CRO's own main Update) - a best-effort toast read is also attempted, never fabricated if absent. */
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
    await expect(this.listHeading, 'Stuffing Update should navigate back to the real Stuffing List on success').toBeVisible({ timeout: 20_000 });
    return toastText;
  }
}

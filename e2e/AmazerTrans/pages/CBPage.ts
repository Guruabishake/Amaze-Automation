import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown } from '../utils/commonActions';

export interface CBPackageEntry {
  noOfPackages: string;
  grossWeight: string;
  netWeight: string;
  uom: string;
}

export interface CBContainerEntry {
  containerNo: string;
  size: '20' | '40' | '45';
  type: string;
  /** Optional - confirmed live real field labels are "Customs seal no.", "Shipper seal no.", "Liner seal no." (not "Shipping Bill Number", which does not exist on this popup - the SB No. field already lives on General Information). */
  customsSealNo?: string;
  shipperSealNo?: string;
  linerSealNo?: string;
}

export interface CBCargoEntry {
  cargoName: string;
  hsCode: string;
  commodity: string;
}

export interface CBGeneralInfoBE {
  /** Real Customer name (matched via `contains` against the live `"<name> [CUST-ID]"` option format - same convention as Enquiry's own Customer Id picker). */
  importer: string;
  beNo: string;
  /** dd-mm-yyyy is what the input DISPLAYS, but `<input type="date">` always takes yyyy-mm-dd via `.fill()` - same convention already used throughout this suite. */
  beDate: string;
  portOfLoading: string;
  portOfDischarge: string;
  portCode: string;
  modeOfTransport: 'Air' | 'Sea';
}

export interface CBGeneralInfoSB {
  exporter: string;
  sbNo: string;
  sbDate: string;
  portOfLoading: string;
  portOfDischarge: string;
}

/**
 * CB (Customs Broker) - a completely separate top-level application module (own left-rail icon,
 * alongside CRM/FF/TMS/INVOICE/HRMS/WMS/Finance/Master/Access/OCR/Others), route `/cb/cbDashboard`.
 * Confirmed live via direct UI discovery (never assumed - see utils/cbConfig.ts's own header
 * comment for the Direction->DocumentType/Port-logic business rules this Page Object deliberately
 * does NOT decide):
 *
 * - The sidebar's "Create CB Job" is the ONE real creation entry point (route
 *   `/cb/createcbjobform`) - the four "CB - Export Sea"/"CB - Export Air"/"CB - Import Sea"/
 *   "CB - Import Air" sidebar entries are dashboard-style filtered views, not separate creation
 *   forms. That screen offers exactly two document-type buttons, "Bill of Entry (BE)" and
 *   "Shipping Bill (SB)", each navigating to its OWN real route/heading
 *   (`/cb/createManualJobBE` "Create Manual Job - BE" / `/cb/createManualJobSB` "Create Manual Job
 *   - SB").
 * - BE's real tabs: General Information / IGMS Information / Invoice Information / Cargo
 *   Information. SB's real tabs: General Information / Invoice Information / Cargo Information (no
 *   IGMS tab at all) - MAWB No/HAWB No are inline fields on SB's own General Information tab
 *   instead of a separate tab, a genuine, confirmed difference between the two document types.
 * - Every dropdown (Importer/Exporter, Port of Loading, Port of Discharge, Mode of Transport, and
 *   the Add Package/Container popups' own UOM/Size/Type) uses the SAME real `div.relative.group` +
 *   `role="combobox"` pattern as every other module in this suite - `selectCustomDropdown` works
 *   unmodified. "BE Type" LOOKS like it could be a dropdown next to these but is confirmed live to
 *   be a plain free-text input (no chevron, no combobox role) - not a mistake here.
 * - Real, confirmed-live required fields (from the app's own validation messages on an empty
 *   submit): BE requires Importer, BE No, BE Date, Port of Loading, Port of Discharge, Port Code,
 *   Mode of Transport. SB requires Exporter, SB No, SB Date, Port of Loading, Port of Discharge
 *   (SB's own Port Code is NOT required, unlike BE's). Every other General Information field on
 *   both forms (addresses, Port of Final Destination, Country of Origin, Nature of Contract,
 *   Consignee fields, MAWB No/HAWB No on SB) is optional there - CB automation still fills
 *   MAWB/HAWB itself (this suite's own required test data), just not because the app demands it on
 *   this tab.
 * - Root-caused via a real hung/failing run (never assumed): filling MAWB No on the SB form makes
 *   the ENTIRE Container Information section (heading, "+Add Container", table) disappear from the
 *   Cargo Information tab - the app reads a filled MAWB No as "this is actually an air shipment"
 *   (SB, unlike BE, has no explicit Mode of Transport field to signal that itself). The calling spec
 *   only fills MAWB/HAWB on SB for Air-mode scenarios for exactly this reason (see cb.spec.ts).
 * - Confirmed live (root-caused via a real screenshot, not an automation gap): "+Add Package"
 *   disappears from the DOM entirely once ONE Package row exists - only ONE real Package row is
 *   ever possible here, the same one-row-only constraint already confirmed on Combined Job's own
 *   Package table. There is no way to create multiple separate Package rows through this screen.
 * - Add Package popup real fields: "No of Packages" (a `role="spinbutton"` with no accessible
 *   label of its own - located via the same `div.relative.group` + floating-label wrapper as every
 *   unlabelled field elsewhere), Gross Weight/Net Weight (plain textboxes), UOM (dropdown).
 *   Add Container popup real fields: Container No (textbox), Size (dropdown: 20/40/45, confirmed
 *   live to cascade Type same as Combined Job's own Container popup), Type (dropdown),
 *   Customs/Shipper/Liner seal no. (all optional textboxes, not filled by this Page Object). Add
 *   Cargo popup real fields: Cargo Name (a `role="combobox"` free-text autocomplete, same shape as
 *   Combined Job's own Cargo Name field), HS Code/Commodity (plain textboxes) - confirmed live NO
 *   "Is DG" field exists in CB's own Add Cargo popup, unlike Combined Job's.
 *
 * Scenario decisions (which document type, which Port gets HARYANA, which Direction/Mode this run
 * even represents) are made entirely OUTSIDE this Page Object, in utils/cbConfig.ts and the calling
 * spec/helper - this class only knows how to operate whichever screen it is told to.
 */
export class CBPage {
  readonly page: Page;
  readonly dashboardHeading: Locator;
  readonly createJobHeading: Locator;
  readonly beFormHeading: Locator;
  readonly sbFormHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardHeading = page.getByRole('heading', { name: 'CB Dashboard', exact: true });
    this.createJobHeading = page.getByRole('heading', { name: 'Create CB Job', exact: true });
    this.beFormHeading = page.getByRole('heading', { name: 'Create Manual Job - BE', exact: true });
    this.sbFormHeading = page.getByRole('heading', { name: 'Create Manual Job - SB', exact: true });
  }

  async openCBModule() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await expect(this.dashboardHeading).toBeVisible();
  }

  async openCreateCBJob() {
    await this.page.getByRole('button', { name: 'Create CB Job', exact: true }).click();
    await expect(this.createJobHeading).toBeVisible();
  }

  async selectBillOfEntry() {
    await this.page.getByRole('button', { name: 'Bill of Entry (BE)', exact: true }).click();
    await expect(this.beFormHeading).toBeVisible();
  }

  async selectShippingBill() {
    await this.page.getByRole('button', { name: 'Shipping Bill (SB)', exact: true }).click();
    await expect(this.sbFormHeading).toBeVisible();
  }

  private async openTab(tabName: 'General Information' | 'IGMS Information' | 'Invoice Information' | 'Cargo Information') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }

  /** Scopes to the field's own floating-label wrapper - same convention as `selectCustomDropdown`'s own field lookup, needed here because `<input type="date">` has no reliable accessible name of its own. */
  private async fillDateField(label: string, value: string) {
    await this.page.locator('div.relative.group', { hasText: label }).first().locator('input[type="date"]').fill(value);
  }

  async fillGeneralInformationBE(data: CBGeneralInfoBE) {
    await this.openTab('General Information');
    await selectCustomDropdown(this.page, 'Importer', data.importer, 'contains');
    await this.page.getByRole('textbox', { name: 'BE No', exact: true }).fill(data.beNo);
    await this.fillDateField('BE Date', data.beDate);
    await selectCustomDropdown(this.page, 'Port of Loading', data.portOfLoading);
    await selectCustomDropdown(this.page, 'Port of Discharge', data.portOfDischarge);
    await this.page.getByRole('textbox', { name: 'Port Code', exact: true }).fill(data.portCode);
    await selectCustomDropdown(this.page, 'Mode of Transport', data.modeOfTransport);
  }

  async fillGeneralInformationSB(data: CBGeneralInfoSB) {
    await this.openTab('General Information');
    await selectCustomDropdown(this.page, 'Exporter', data.exporter, 'contains');
    await this.page.getByRole('textbox', { name: 'SB No', exact: true }).fill(data.sbNo);
    await this.fillDateField('SB Date', data.sbDate);
    await selectCustomDropdown(this.page, 'Port of Loading', data.portOfLoading);
    await selectCustomDropdown(this.page, 'Port of Discharge', data.portOfDischarge);
  }

  /** BE only - MAWB/BL No. and HAWB/HBL No. live on the separate IGMS Information tab. */
  async fillMawb(documentType: 'Bill of Entry (BE)', mawb: string): Promise<void>;
  async fillMawb(documentType: 'Shipping Bill (SB)', mawb: string): Promise<void>;
  async fillMawb(documentType: 'Bill of Entry (BE)' | 'Shipping Bill (SB)', mawb: string) {
    if (documentType === 'Bill of Entry (BE)') {
      await this.openTab('IGMS Information');
      await this.page.getByRole('textbox', { name: 'MAWB/BL No.', exact: true }).fill(mawb);
    } else {
      await this.openTab('General Information');
      await this.page.getByRole('textbox', { name: 'MAWB No', exact: true }).fill(mawb);
    }
  }

  async fillHawb(documentType: 'Bill of Entry (BE)' | 'Shipping Bill (SB)', hawb: string) {
    if (documentType === 'Bill of Entry (BE)') {
      await this.openTab('IGMS Information');
      await this.page.getByRole('textbox', { name: 'HAWB/HBL No.', exact: true }).fill(hawb);
    } else {
      await this.openTab('General Information');
      await this.page.getByRole('textbox', { name: 'HAWB No', exact: true }).fill(hawb);
    }
  }

  async fillInvoiceInformation(invoiceNo: string) {
    await this.openTab('Invoice Information');
    await this.page.getByRole('textbox', { name: 'Invoice No.', exact: true }).fill(invoiceNo);
  }

  async openCargoInformationTab() {
    await this.openTab('Cargo Information');
    await expect(this.page.getByRole('button', { name: /Add Package/i })).toBeVisible();
  }

  /** Locates the Package/Container/Cargo table by its own thead content (never a fixed index - same rationale as CombinedJobPage's own `sectionByHeader`, since these three tables can each independently have zero or many rows). */
  private sectionByHeader(headerText: string): Locator {
    return this.page.locator('table').filter({ has: this.page.locator('thead', { hasText: headerText }) });
  }

  async getPackageRowCount(): Promise<number> {
    return this.sectionByHeader('NO OF PACKAGES').locator('tbody tr').count();
  }

  async getContainerRowCount(): Promise<number> {
    return this.sectionByHeader('CONTAINER NO').locator('tbody tr').count();
  }

  /** The popup's own "Add" button - confirmed live to be the only element on the whole page whose text is the exact string "Add" while a popup is open (unambiguous, no extra scoping needed). */
  private addButton(): Locator {
    return this.page.getByRole('button', { name: 'Add', exact: true });
  }

  /**
   * These Add popups are real modals (`div.fixed.inset-0.z-40` backdrop - same shape already
   * documented on Combined Job's own Filter panel). Root-caused via a real hung run: clicking the
   * popup's own "Add" button while the app's client-side validation silently rejects the submission
   * (e.g. an invalid Container No) leaves the SAME modal open - a caller that immediately clicks the
   * next "+Add X" trigger without checking this hangs indefinitely behind that still-open backdrop
   * (no actionTimeout is configured anywhere in this repo). Waiting for the backdrop to actually
   * disappear after "Add" turns that silent-validation-failure hang into a clear, fast, informative
   * failure right at the point real data was rejected, instead of a much later, harder-to-diagnose
   * timeout on an unrelated next step.
   */
  private async submitAddPopup(popupLabel: string) {
    const backdrop = this.page.locator('div.fixed.inset-0.z-40');
    await this.addButton().click();
    await expect(backdrop, `${popupLabel} popup should close after Add - if it is still open, the app's own validation likely rejected the submitted values`).not.toBeVisible({ timeout: 10000 });
  }

  /** Bounded click timeout on these specific triggers only (not a global policy change) - turns a genuine future stall into a fast, clearly-attributed failure instead of running out the whole test's multi-minute timeout before failing. Explicitly scrolls first since the on-failure screenshot is viewport-only and this trigger can legitimately sit below the fold once earlier rows have been added. */
  private async clickAddTrigger(namePattern: RegExp) {
    const trigger = this.page.getByRole('button', { name: namePattern });
    const domCount = await trigger.count();
    if (domCount === 0) {
      throw new Error(`No "${namePattern}" trigger button exists in the DOM at all (not just off-screen) - real, confirmed app state, not an automation gap.`);
    }
    await trigger.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await trigger.click({ timeout: 20_000 });
  }

  async addPackage(data: CBPackageEntry) {
    await this.clickAddTrigger(/Add Package/i);
    await this.page.locator('div.relative.group', { hasText: 'No of Packages' }).first().getByRole('spinbutton').fill(data.noOfPackages);
    await this.page.getByRole('textbox', { name: 'Gross Weight', exact: true }).fill(data.grossWeight);
    await this.page.getByRole('textbox', { name: 'Net Weight', exact: true }).fill(data.netWeight);
    // preferClick: true - these Add popups are their own <form>; Enter-to-select (this suite's
    // usual default) risks bubbling to the popup's native form submit, same real category of risk
    // already documented on Contract's own Customer picker. A direct <li> click avoids that.
    await selectCustomDropdown(this.page, 'UOM', data.uom, 'exact', this.page, true);
    await this.submitAddPopup('Add Package');
  }

  async addContainer(data: CBContainerEntry) {
    await this.clickAddTrigger(/Add Container/i);
    await this.page.getByRole('textbox', { name: 'Container No', exact: true }).fill(data.containerNo, { timeout: 20_000 });
    await selectCustomDropdown(this.page, 'Size', data.size, 'exact', this.page, true);
    await selectCustomDropdown(this.page, 'Type', data.type, 'exact', this.page, true);
    // Bounded timeouts on these three optional fields specifically (not a global policy change) -
    // turns any future stall into a fast, clearly-attributed failure instead of running out the
    // whole test's multi-minute timeout, same rationale as `clickAddTrigger`.
    if (data.customsSealNo !== undefined) {
      await this.page.getByRole('textbox', { name: 'Customs seal no.', exact: true }).fill(data.customsSealNo, { timeout: 20_000 });
    }
    if (data.shipperSealNo !== undefined) {
      await this.page.getByRole('textbox', { name: 'Shipper seal no.', exact: true }).fill(data.shipperSealNo, { timeout: 20_000 });
    }
    if (data.linerSealNo !== undefined) {
      const linerSealField = this.page.getByRole('textbox', { name: 'Liner seal no.', exact: true });
      const linerSealEnabled = await linerSealField.isEnabled({ timeout: 5_000 }).catch(() => false);
      if (linerSealEnabled) {
        await linerSealField.fill(data.linerSealNo, { timeout: 20_000 });
      } else {
        console.log(`CBPage.addContainer: "Liner seal no." is not enabled for container ${data.containerNo} (Type ${data.type}) - skipped, not an automation gap.`);
      }
    }
    await this.submitAddPopup('Add Container');
  }

  async addCargo(data: CBCargoEntry) {
    await this.clickAddTrigger(/Add Cargo/i);
    await this.page.getByRole('combobox', { name: 'Cargo Name', exact: true }).fill(data.cargoName);
    await this.page.getByRole('textbox', { name: 'HS Code', exact: true }).fill(data.hsCode);
    await this.page.getByRole('textbox', { name: 'Commodity', exact: true }).fill(data.commodity);
    await this.submitAddPopup('Add Cargo');
  }

  /** Clicks the page-level "Create Job" button. Confirmed live real client-side validation blocks submission with "Please fill in all required fields." when a required field is missing - the caller verifies actual success (real generated Job No, list/navigation) itself, never assumed here. */
  async clickCreateJob() {
    await this.page.getByRole('button', { name: 'Create Job', exact: true }).click();
  }

  /** Real validation toast text confirmed live on an empty-form submit attempt - exposed so a caller can assert against it if needed rather than the constant being reproduced ad hoc. */
  requiredFieldsValidationText(): string {
    return 'Please fill in all required fields.';
  }
}

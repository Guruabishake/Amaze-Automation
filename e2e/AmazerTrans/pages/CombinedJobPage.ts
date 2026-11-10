import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { generateUniqueContainerNumbers, recordContainersForCombinedJob, getPersistedContainersByCombinedJob } from '../utils/containerRegistry';

export interface ContainerData {
  size: '20' | '40' | '45';
  type: 'FR' | 'GP' | 'OT' | 'RF' | 'TK';
  kindOfPackages: string;
}

export interface CargoData {
  cargoName: string;
  hsnCode: string;
  commodity: string;
  isDg: 'Yes' | 'No';
}

/**
 * Combined Job List (CRM -> Sales Management -> "Combined Job", the sidebar's own exact button
 * text) is reached only via Confirm Order List's own "Confirm Master Job" action - there is no
 * standalone Create here, same convention as every other stage in this pipeline. Confirmed live
 * via real page snapshots and a full DOM scan on every screen (never assumed):
 *
 * - The sidebar button reads "Combined Job", but the screen's own heading reads "Combined Job
 *   List" - the same kind of sidebar-label-vs-heading pattern already documented for Pricing/Quote
 *   Approval/Confirm Order List. Route is `/crm/bookingJobGeneration`.
 * - Columns: Combined Job No / Liner Booking No / SB/BE No / Enquiry No / Quote No / Customer Name
 *   / Customer ID / Combined Job Status / Actions. A row shows FOUR real actions: an icon-only
 *   "View More", an icon-only "Edit", and two text buttons "Update" and "Report".
 * - "View More" opens "Combined Job View" (`/crm/bookingJobForm?...&view=true`) - Back button plus
 *   4 real tabs: General Information / Product Information / Destination Information / Cargo
 *   Information. Every field is read-only.
 * - The icon "Edit" opens "Update Combined Job" at the SAME `/crm/bookingJobForm` route (no
 *   `view=true`) with the SAME 4 tabs - confirmed live every field is disabled EXCEPT Cargo
 *   Information's own "Cargo Ready Date", plus Cancel/Update buttons.
 * - The text "Update" row action opens a SEPARATE, much richer form at
 *   `/crm/bookingJobGenerationForm`, headed "Update Combined Job" too (same text, different route -
 *   distinguished here by what's on screen, not the heading alone). This is where the actual
 *   business data entry happens: General/Job info (Liner Booking No, Document Reference Number),
 *   a small "Cargo Details" section (Transhipment Port Date / CFS Nomination [dropdown] / HSS
 *   [dropdown]), a "Package Information" table (one existing row, Edit-only - no Add), a
 *   "Container Information" table (Edit existing + "+Add Container"), a SECOND "Cargo Details"
 *   section further down that is actually the cargo RECORDS table (Edit existing + "+Add Cargo"),
 *   and "File Uploads". The page's own bottom "Update" button persists this whole form.
 * - Add Container popup fields (confirmed live): Container No / Size (dropdown: 20, 40, 45) / Type
 *   (dropdown, CASCADES on Size - only populates after Size is chosen; confirmed options for a 20ft
 *   container: FR, GP, OT, RF, TK) / Kind Of Packages - Cancel/Save. "RF Temp" is a table column
 *   but not a field in this popup for a non-Reefer Type - conditional, not fabricated here.
 * - Add Cargo popup fields (confirmed live): Cargo Name / HSN Code / Commodity - all plain
 *   free-text fields (Cargo Name's `list="datalist-cargo_name"` attribute is an empty,
 *   dynamically-populated autocomplete hint, not a fixed option set - confirmed live it has zero
 *   `<option>`s and its input, despite carrying `role="combobox"`, never produces the app's usual
 *   `<li>` option list) - plus Is DG (a real dropdown: Yes/No - the real field is "Is DG", not
 *   "Is IG") - Cancel/Save.
 */
export class CombinedJobPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly viewFormHeading: Locator;
  readonly updateFormHeading: Locator;
  readonly reportHeading: Locator;
  readonly filterButton: Locator;
  readonly backButton: Locator;

  /** Real, observed evidence for the defect-detection framework (utils/validateAndRecord.ts) - never fabricated. Updated as the real signals actually occur, exposed via the getters below. */
  private lastSearchApiInfo: { endpoint: string; status: number } | null = null;
  private lastConsoleError: string | null = null;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Combined Job List', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'Combined Job View', exact: true });
    this.updateFormHeading = page.getByRole('heading', { name: 'Update Combined Job', exact: true });
    // Confirmed live: the row's "Report" action opens a real "Job wise P&L" screen at
    // `/crm/jobwise-PL`, backed by `GET /crm-reports/jobwisePnLReport/{jobNo}` - not a print dialog
    // or a new tab, a normal same-tab navigation with just its own "Back" button.
    this.reportHeading = page.getByRole('heading', { name: 'Job wise P&L', exact: true });
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        this.lastConsoleError = msg.text();
      }
    });
  }

  /** The real endpoint/status of the most recent Combined Job List search - only ever set from an actual observed response (see `searchAndWait`), never guessed. */
  getLastSearchApiInfo(): { endpoint: string; status: number } | undefined {
    return this.lastSearchApiInfo ?? undefined;
  }

  /** The most recent browser console error message observed on this page, if any - real evidence for a BugReport, not fabricated. */
  getLastConsoleError(): string | undefined {
    return this.lastConsoleError ?? undefined;
  }

  /**
   * Real app navigation: sidebar CRM -> Sales Management -> "Combined Job". Same toggle-safe
   * pattern as every other Page Object here. Explicit timeouts throughout (confirmed live: this
   * suite's own playwright.config.ts sets no global actionTimeout, so an action with none can hang
   * for the ENTIRE remaining test budget instead of failing fast - a real, confirmed occurrence
   * here under heavier staging load).
   */
  async navigateFromSidebar() {
    const link = this.page.getByRole('button', { name: 'Combined Job', exact: true });
    // Confirmed live: the sidebar's own "CRM" icon click can occasionally not register/switch the
    // currently-open module menu (a genuine transient UI hiccup, not a design issue - this exact
    // click pattern works reliably everywhere else in this suite) - bounded retry, same convention
    // already used for other confirmed transient UI hiccups in this suite.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.page.getByRole('button', { name: 'CRM', exact: true }).click({ timeout: 15_000 });
      if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
        break;
      }
      const salesManagementVisible = await this.page.getByRole('button', { name: 'Sales Management', exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
      if (salesManagementVisible) {
        await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click({ timeout: 15_000 });
        if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
          break;
        }
      }
      console.log(`CombinedJobPage.navigateFromSidebar: CRM submenu not ready on attempt ${attempt} - retrying.`);
    }
    await link.click({ timeout: 15_000 });
    await expect(this.pageHeading).toBeVisible({ timeout: 15_000 });
  }

  /** Enquiry No is globally unique - the reliable way to locate exactly one record, never by row position. Same grid-row pattern already used throughout this suite. */
  getRowByEnquiryNumber(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  /**
   * Reads every real column of the row matching `enquiryNo` - confirmed live column order:
   * Combined Job No / Liner Booking No / SB-BE No / Enquiry No / Quote No / Customer Name /
   * Customer ID / Combined Job Status / Actions. Used both to capture this transaction's own real
   * values (never hardcoded) and to validate a filtered search actually returned the right record.
   */
  async readRowByEnquiryNumber(enquiryNo: string): Promise<{
    combinedJobNo: string;
    linerBookingNo: string;
    sbBeNo: string;
    enquiryNo: string;
    quoteNo: string;
    customerName: string;
    customerId: string;
    status: string;
  }> {
    const cells = await this.getRowByEnquiryNumber(enquiryNo).locator(':scope > div').allInnerTexts();
    return {
      combinedJobNo: cells[0]?.trim() ?? '',
      linerBookingNo: cells[1]?.trim() ?? '',
      sbBeNo: cells[2]?.trim() ?? '',
      enquiryNo: cells[3]?.trim() ?? '',
      quoteNo: cells[4]?.trim() ?? '',
      customerName: cells[5]?.trim() ?? '',
      customerId: cells[6]?.trim() ?? '',
      status: cells[7]?.trim() ?? '',
    };
  }

  /**
   * Idempotent by design - confirmed live via a real hung run: the Filter panel is a real modal
   * (a `div.fixed.inset-0` backdrop, not an inline panel), so clicking "Filter" again while it is
   * ALREADY open is not a harmless no-op - the button sits behind its own modal's backdrop and the
   * click retries against it indefinitely (no timeout is configured anywhere in this repo, so this
   * hangs until the test's own overall timeout kills it, not a fast failure). Checking first, and
   * only clicking when the panel is genuinely closed, is what makes every "open again before
   * Reset"-style call sequence in this Page Object safe to call back-to-back.
   */
  async openFilter() {
    const alreadyOpen = await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click();
    }
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No', exact: true })).toBeVisible();
  }

  /**
   * Confirmed live via the network tab: GET /middleware/api/v1/bookingjobs/getAllJobs. Root-caused
   * via a real failing run: without waiting for this specific response, the record-count text
   * assertion alone can pass on a STALE count already on screen from before this search (the
   * regex matches whatever count is currently showing, not necessarily the new filtered one), so
   * a caller reading the list immediately after could see the previous, unfiltered rows - exactly
   * what made `getContainersByCombinedJob` wrongly report zero containers for a job that was
   * genuinely on the very next page load.
   */
  private async searchAndWait() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/bookingjobs/getAllJobs') && res.request().method() === 'GET');
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    const response = await responsePromise;
    this.lastSearchApiInfo = { endpoint: response.url(), status: response.status() };
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  /** Real filter field labels, confirmed live via a full DOM scan of the Filter panel (10 real fields, never invented): BL/AWB/Invoice, Customer Name, Document Reference No, Liner Booking No, Enquiry No, Quote Number, Combined Job No, Customer ID, Import/Export, Combined Status. */
  async filterByBlAwbInvoice(value: string) {
    await this.page.getByRole('textbox', { name: 'BL/AWB/Invoice', exact: true }).fill(value);
    await this.searchAndWait();
  }

  async filterByCustomerName(value: string) {
    await this.page.getByRole('textbox', { name: 'Customer Name', exact: true }).fill(value);
    await this.searchAndWait();
  }

  /** Confirmed live: the Filter panel's own label is "Document Reference No" (no "Number"), unlike the Update form's own field of the same meaning which IS labelled "Document Reference Number" - two different screens, not a typo here. */
  async filterByDocumentReferenceNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Document Reference No', exact: true }).fill(value);
    await this.searchAndWait();
  }

  async filterByLinerBookingNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Liner Booking No', exact: true }).fill(value);
    await this.searchAndWait();
  }

  async filterByEnquiryNumber(enquiryNo: string) {
    await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).fill(enquiryNo);
    await this.searchAndWait();
  }

  async filterByQuoteNumber(quoteNo: string) {
    await this.page.getByRole('textbox', { name: 'Quote Number', exact: true }).fill(quoteNo);
    await this.searchAndWait();
  }

  async filterByCombinedJobNo(combinedJobNo: string) {
    await this.page.getByRole('textbox', { name: 'Combined Job No', exact: true }).fill(combinedJobNo);
    await this.searchAndWait();
  }

  async filterByCustomerId(customerId: string) {
    await this.page.getByRole('textbox', { name: 'Customer ID', exact: true }).fill(customerId);
    await this.searchAndWait();
  }

  async filterByDirection(direction: 'Import' | 'Export') {
    await selectCustomDropdown(this.page, 'Import/Export', direction);
    await this.searchAndWait();
  }

  /** Confirmed live: the real dropdown options are "Booking Job Generated" and "Completed" - never a guessed status name. */
  async filterByCombinedStatus(status: 'Booking Job Generated' | 'Completed') {
    await selectCustomDropdown(this.page, 'Combined Status', status);
    await this.searchAndWait();
  }

  /** Reads the real Combined Job No of the first row matching `enquiryNo` currently on screen - never hardcoded. */
  async readCombinedJobNumber(enquiryNo: string): Promise<string> {
    const cells = await this.getRowByEnquiryNumber(enquiryNo).locator(':scope > div').allInnerTexts();
    return cells[0]?.trim() ?? '';
  }

  async readCombinedJobStatus(enquiryNo: string): Promise<string> {
    const cells = await this.getRowByEnquiryNumber(enquiryNo).locator(':scope > div').allInnerTexts();
    return cells[7]?.trim() ?? '';
  }

  /** Confirmed live: same dual "{total} records" / "{matched} of {total} records" format already proven on every other list in this suite. */
  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /**
   * Confirmed live: the same duplicate-Reset situation already proven on Pricing/Confirm Order
   * List (an outer quick-clear Reset once a filter is active, plus the popup's own inside the one
   * real `<form>`) - scoping to `form` resolves it the same way. Also confirmed live (same real
   * staging-concurrency issue already fixed on FFJobPage/VendorBillPage/CBJobPage's own
   * resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky since
   * other real activity on the shared staging environment can genuinely change it in between -
   * checking that a "N records" summary reappears at all is the real, reliable success signal.
   */
  async resetFilter() {
    await this.page.locator('form').getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  /** Row text action "Report" - opens the real "Job wise P&L" screen for this exact job (same tab, no print dialog, no new tab - confirmed live). */
  async clickReport(enquiryNo: string) {
    await this.getRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Report', exact: true }).click();
    await expect(this.reportHeading).toBeVisible();
  }

  /** Confirmed live real report fields: JOB NO, CUSTOMER NAME, SERVICE TYPE, ESTIMATED/ACTUAL COST/REVENUE/PROFIT, MARGIN - this only checks the two identifying fields that tie the report back to the SAME transaction. */
  async verifyReportContent(expected: { combinedJobNumber: string; customerName: string }) {
    await expect(this.page.getByText(expected.combinedJobNumber, { exact: true })).toBeVisible();
    await expect(this.page.getByText(expected.customerName, { exact: true })).toBeVisible();
  }

  async backFromReport() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** "View More" - opens the fully read-only "Combined Job View" screen. */
  async viewCombinedJob(enquiryNo: string) {
    await this.getRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  private async openTopTab(tabName: 'General Information' | 'Product Information' | 'Destination Information' | 'Cargo Information') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }
  async openGeneralInformationTab() {
    await this.openTopTab('General Information');
  }
  async openProductInformationTab() {
    await this.openTopTab('Product Information');
  }
  async openDestinationInformationTab() {
    await this.openTopTab('Destination Information');
  }
  async openCargoInformationTab() {
    await this.openTopTab('Cargo Information');
  }

  /** Verifies the View/Edit screen's General Information tab belongs to the expected transaction - never a hardcoded expectation. */
  async verifyGeneralInformation(expected: { enquiryNo: string; quoteNo: string }) {
    await this.openGeneralInformationTab();
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No' })).toHaveValue(expected.enquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No' })).toHaveValue(expected.quoteNo);
  }

  /** Confirmed live (real DOM scan, not the "Product"/"Direction" labels an earlier version of this method assumed - those never actually appear here): the real field labels are "Shipment Mode" and "Shipment Direction". */
  async verifyProductInformation(expected: { shipmentMode: string; shipmentDirection: string; businessType?: string }) {
    await this.openProductInformationTab();
    await expect(this.page.getByRole('textbox', { name: 'Shipment Mode', exact: true })).toHaveValue(expected.shipmentMode);
    await expect(this.page.getByRole('textbox', { name: 'Shipment Direction', exact: true })).toHaveValue(expected.shipmentDirection);
  }

  /** Reads (rather than asserts) the real Shipment Mode/Direction shown on the View screen's Product Information tab - the source of truth `getCombinedJobSourceData` uses, never hardcoded. */
  async readProductInformation(): Promise<{ shipmentMode: string; shipmentDirection: string }> {
    await this.openProductInformationTab();
    return {
      shipmentMode: await this.page.getByRole('textbox', { name: 'Shipment Mode', exact: true }).inputValue(),
      shipmentDirection: await this.page.getByRole('textbox', { name: 'Shipment Direction', exact: true }).inputValue(),
    };
  }

  async backToList() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Icon "Edit" - the mostly read-only "Update Combined Job" screen (`bookingJobForm`, no `view=true`). Only Cargo Ready Date is editable here. */
  async editCombinedJob(enquiryNo: string) {
    await this.getRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
  }

  /** The page-level Update button on the icon-Edit screen (`bookingJobForm`). */
  async saveEditForm() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Row text action "Update" - the rich data-entry form (`bookingJobGenerationForm`): General/Job
   * info, Cargo Details, Package/Container/Cargo tables, File Uploads. Root-caused via a real
   * failing run: the "Update Combined Job" heading mounts BEFORE this job's own data has loaded -
   * confirmed live the Package/Container/Cargo `<table>`s genuinely don't exist yet at that point
   * (a real async data-fetch race, not a rendering delay only a wait could paper over). Waiting
   * for this job's own real detail-load response (`GET /bookingjobs/getJobById/{id}`) is the
   * actual synchronization point - without it, a caller could read the tables before they exist.
   */
  async openCombinedJob(enquiryNo: string) {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/bookingjobs/getJobById/') && res.request().method() === 'GET');
    await this.getRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Update', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
    await responsePromise;
    // Confirmed live: Sea/Road/Rail Combined Jobs render 4 tables (Package/Container/Cargo/File
    // Uploads); an Air-mode Combined Job renders only 3 - the whole Container Information section
    // (heading, "+Add Container", table) does not exist at all, not merely an empty table. Waiting
    // for "at least 3" (Package/Cargo/Uploads always exist) is the real, mode-independent invariant
    // - `packageSection`/`containerSection`/`cargoRecordsSection` below locate each table by its own
    // thead content rather than a fixed index, so this difference never misaligns which table is read.
    await expect(this.page.locator('table')).not.toHaveCount(0);
    const tableCount = await this.page.locator('table').count();
    expect(tableCount, 'Combined Job Update form should render 3 tables (Air) or 4 (Sea/Road/Rail)').toBeGreaterThanOrEqual(3);
  }

  /**
   * Liner Booking No / Document Reference Number - confirmed live real field labels (the app
   * calls it "Liner Booking No", not "Liner Booking Job Number"). Both must be unique per
   * generated Combined Job - the caller supplies already-unique values (see testData's own
   * incrementing conventions). `.first()`: confirmed live via a raw DOM scan that
   * "document_reference_number" renders as two real, accessible textboxes with the same name (a
   * responsive desktop/mobile duplicate, not a mistake here) - `.first()` avoids a strict-mode
   * violation.
   */
  async updateGeneralInformation(linerBookingNo: string, documentReferenceNumber: string) {
    await this.page.getByRole('textbox', { name: 'Liner Booking No', exact: true }).first().fill(linerBookingNo);
    await this.page.getByRole('textbox', { name: 'Document Reference Number', exact: true }).first().fill(documentReferenceNumber);
  }

  /** The small "Cargo Details" section (Transhipment Port Date / CFS Nomination / HSS) - confirmed live: CFS Nomination and HSS are real dropdowns (Yes/No), not free text. */
  async updateCargoDetails(transhipmentPortDate: string, cfsNomination: 'Yes' | 'No', hss: 'Yes' | 'No') {
    await this.page.locator('input[type="date"]').first().fill(transhipmentPortDate);
    await selectCustomDropdown(this.page, 'CFS Nomination', cfsNomination);
    await selectCustomDropdown(this.page, 'HSS', hss);
  }

  /**
   * Confirmed live via a real DOM scan: this form renders 4 real `<table>` elements for Sea/Road/
   * Rail (Package Information, Container Information, the records Cargo Details, File Uploads), but
   * only 3 for Air mode (no Container Information table at all - see `openCombinedJob`'s own
   * comment). `packageSection`/`containerSection`/`cargoRecordsSection` locate each table by its own
   * thead content rather than a fixed index for exactly this reason.
   */
  async expectGeneralInformationValues(linerBookingNo: string, documentReferenceNumber: string) {
    await expect(this.page.getByRole('textbox', { name: 'Liner Booking No', exact: true }).first()).toHaveValue(linerBookingNo);
    await expect(this.page.getByRole('textbox', { name: 'Document Reference Number', exact: true }).first()).toHaveValue(documentReferenceNumber);
  }

  /**
   * Locates a table by its own `<thead>` content rather than a fixed index - required because an
   * Air-mode Combined Job renders only 3 tables (no Container Information section at all), which
   * would silently shift every later table's index by one under a fixed-`nth()` lookup. Each
   * table's thead content is confirmed live and unique: Package -> "NO OF PACKAGES", Container ->
   * "CONTAINER NO", Cargo (records) -> "CARGO NAME".
   */
  private sectionByHeader(headerText: string): Locator {
    return this.page.locator('table').filter({ has: this.page.locator('thead', { hasText: headerText }) });
  }
  private packageSection(): Locator {
    return this.sectionByHeader('NO OF PACKAGES');
  }
  private containerSection(): Locator {
    return this.sectionByHeader('CONTAINER NO');
  }
  /** The records table, not the small date/nomination section of the same "Cargo Details" heading near the top of this form. */
  private cargoRecordsSection(): Locator {
    return this.sectionByHeader('CARGO NAME');
  }
  /** "+Add Container"/"+Add Cargo" are their own buttons just above each table, not inside it - scoped via the nearest preceding sibling instead of the table locator itself. */
  private addContainerButton(): Locator {
    return this.page.getByRole('button', { name: 'Add Container', exact: false });
  }
  private addCargoButton(): Locator {
    return this.page.getByRole('button', { name: 'Add Cargo', exact: false });
  }

  private dataRows(section: Locator): Locator {
    return section.getByRole('row').filter({ hasNotText: 'S.NO' }).filter({ hasText: /\d/ });
  }

  /** Edits the SAME existing Package row (there is exactly one, no "+Add" for packages - confirmed live). */
  async editPackage(data: { numberOfPackages: string; grossWeight: string; netWeight: string; cbm: string }) {
    const row = this.dataRows(this.packageSection()).first();
    await row.getByRole('button').first().click();
    const popupForm = this.page.locator('form').last();
    await popupForm.getByRole('textbox', { name: 'No Of Packages', exact: true }).fill(data.numberOfPackages);
    await popupForm.getByRole('textbox', { name: 'Gross Weight', exact: true }).fill(data.grossWeight);
    await popupForm.getByRole('textbox', { name: 'Net Weight', exact: true }).fill(data.netWeight);
    await popupForm.getByRole('textbox', { name: 'CBM', exact: true }).fill(data.cbm);
    await popupForm.getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** Edits the existing Container row (row index 0, the one record already present before this test adds any more). */
  async editContainer(containerNumber: string, data: ContainerData) {
    const row = this.dataRows(this.containerSection()).first();
    await row.getByRole('button').first().click();
    await this.fillContainerPopup(containerNumber, data);
    await this.page.locator('form').last().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** "+Add Container" - confirmed live Type only populates once Size has been chosen (a real cascading dropdown, not two independent ones). */
  async addContainer(containerNumber: string, data: ContainerData) {
    await this.addContainerButton().click();
    await this.fillContainerPopup(containerNumber, data);
    await this.page.locator('form').last().getByRole('button', { name: 'Save', exact: true }).click();
  }

  private async fillContainerPopup(containerNumber: string, data: ContainerData) {
    const popupForm = this.page.locator('form').last();
    await popupForm.getByRole('textbox', { name: 'Container No', exact: true }).fill(containerNumber);
    await selectCustomDropdown(this.page, 'Size', data.size, 'exact', popupForm);
    await selectCustomDropdown(this.page, 'Type', data.type, 'exact', popupForm);
    await popupForm.getByRole('textbox', { name: 'Kind Of Packages', exact: true }).fill(data.kindOfPackages);
  }

  /** Edits the existing Cargo row (the one record carried over from the originating Enquiry's own cargo item). */
  async editCargo(data: CargoData) {
    const row = this.dataRows(this.cargoRecordsSection()).first();
    await row.getByRole('button').first().click();
    await this.fillCargoPopup(data);
    await this.page.locator('form').last().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** "+Add Cargo" - confirmed live "Cargo Name" is a searchable combobox (existing master data), not a free-text field. */
  async addCargo(data: CargoData) {
    await this.addCargoButton().click();
    await this.fillCargoPopup(data);
    await this.page.locator('form').last().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /**
   * Confirmed live (via two rounds of real trace/DOM investigation, not assumed): "Cargo Name" is
   * a plain free-text `<input>` with an empty, dynamically-populated `<datalist>` autocomplete
   * hint - there is no fixed `<li>` option list to wait for or select from, so this app's usual
   * custom-dropdown helper (which waits for one) hangs indefinitely. Root cause of THAT hang, and
   * why `getByRole('textbox', ...)` then also failed to find it at all: Chromium exposes an
   * `<input list="...">` via the accessibility tree with role "combobox", not "textbox", purely
   * because of the `list` attribute - confirmed live via `getByRole('combobox', ...)` resolving
   * where `getByRole('textbox', ...)` found nothing. `.fill()` still works normally on it once
   * addressed by its real role - same free-text behavior as Commodity/HSN Code otherwise.
   */
  private async fillCargoPopup(data: CargoData) {
    const popupForm = this.page.locator('form').last();
    await popupForm.getByRole('combobox', { name: 'Cargo Name', exact: true }).fill(data.cargoName);
    await popupForm.getByRole('textbox', { name: 'HSN Code', exact: true }).fill(data.hsnCode);
    await popupForm.getByRole('textbox', { name: 'Commodity', exact: true }).fill(data.commodity);
    await selectCustomDropdown(this.page, 'Is DG', data.isDg, 'exact', popupForm);
  }

  async uploadDocuments(documentType: string, filePath: string) {
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    const response = await clickUploadAndAwaitResponse(this.page, this.page.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `Document upload should succeed. Status ${response.status()}`).toBeTruthy();
  }

  async expectUploadedFileName(fileName: string) {
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * The rich form's own bottom "Update" button - persists General/Job info, Cargo Details, and
   * every Package/Container/Cargo/Upload change made on this screen. Explicit, more generous
   * timeouts throughout (confirmed live: the default 5s expect timeout can genuinely fall short
   * here under heavier concurrent staging load - same real issue already confirmed and fixed
   * elsewhere in this same Page Object's own navigateFromSidebar).
   */
  async saveCombinedJob() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Generates `count` fresh, globally-unique Container Numbers (format `^[A-Z]{4}[0-9]{7}$`) and
   * immediately reserves them in the persisted registry (`utils/containerRegistry.ts`) so neither
   * this run nor any future one can ever reissue them.
   */
  generateUniqueContainerNumber(count = 1): string[] {
    return generateUniqueContainerNumbers(count);
  }

  /** Records which Container Numbers belong to `combinedJobNumber` in the persisted registry - call once the containers have actually been saved in the application. */
  recordContainers(combinedJobNumber: string, containerNumbers: string[]) {
    recordContainersForCombinedJob(combinedJobNumber, containerNumbers);
  }

  /** Reads the real Package Information table (table index 0) - the SAME real cell order confirmed live: S.NO / NO OF PACKAGES / GROSS WEIGHT / NET WEIGHT / CBM / UOM / ACTIONS. */
  async readPackageRows(): Promise<Array<{ noOfPackages: string; grossWeight: string; netWeight: string; cbm: string; uom: string }>> {
    const rows = this.dataRows(this.packageSection());
    const count = await rows.count();
    const result: Array<{ noOfPackages: string; grossWeight: string; netWeight: string; cbm: string; uom: string }> = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).getByRole('cell').allInnerTexts();
      result.push({
        noOfPackages: cells[1]?.trim() ?? '',
        grossWeight: cells[2]?.trim() ?? '',
        netWeight: cells[3]?.trim() ?? '',
        cbm: cells[4]?.trim() ?? '',
        uom: cells[5]?.trim() ?? '',
      });
    }
    return result;
  }

  /**
   * Reads the real Container Information table (table index 1) with its full field set - the SAME
   * real cell order confirmed live: S.NO / CONTAINER NO / SIZE / TYPE / RF TEMP / KIND OF PACKAGES /
   * ACTIONS. Skips rows whose Container No is still the app's own unfilled placeholder ("--" - same
   * convention `getContainersByCombinedJob` already filters) - a genuine, real row an Air-mode or
   * not-yet-container-enriched Enquiry carries over, but not a real container CB should ever copy
   * (root-caused via a real hung run: attempting to Add a Container with a literal "--" number fails
   * the app's own validation and leaves that popup open, hanging every subsequent "+Add Container"
   * click behind its own still-open backdrop).
   */
  async readContainerRowsFull(): Promise<Array<{ containerNo: string; size: string; type: string; kindOfPackages: string }>> {
    const rows = this.dataRows(this.containerSection());
    const count = await rows.count();
    const result: Array<{ containerNo: string; size: string; type: string; kindOfPackages: string }> = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).getByRole('cell').allInnerTexts();
      const containerNo = cells[1]?.trim() ?? '';
      if (!containerNo || containerNo === '--') {
        continue;
      }
      result.push({
        containerNo,
        size: cells[2]?.trim() ?? '',
        type: cells[3]?.trim() ?? '',
        kindOfPackages: cells[5]?.trim() ?? '',
      });
    }
    return result;
  }

  /** Reads the real Cargo records table (table index 2) - the SAME real cell order confirmed live: S.NO / CARGO NAME / HSN CODE / COMMODITY / IS DG / ... / ACTIONS. */
  async readCargoRowsFull(): Promise<Array<{ cargoName: string; hsnCode: string; commodity: string; isDg: string }>> {
    const rows = this.dataRows(this.cargoRecordsSection());
    const count = await rows.count();
    const result: Array<{ cargoName: string; hsnCode: string; commodity: string; isDg: string }> = [];
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).getByRole('cell').allInnerTexts();
      result.push({
        cargoName: cells[1]?.trim() ?? '',
        hsnCode: cells[2]?.trim() ?? '',
        commodity: cells[3]?.trim() ?? '',
        isDg: cells[4]?.trim() ?? '',
      });
    }
    return result;
  }

  /**
   * The normalized source-of-truth CB automation reads from - never independently generated. Pulls
   * every value from the REAL, already-created Combined Job for `enquiryNo`: identifiers off the
   * List row, Shipment Mode/Direction off the View screen's Product Information tab, and the real
   * Package/Container/Cargo records off the Update form's own tables (same tables
   * `getContainersByCombinedJob` already reads, extended here to every field CB needs to copy).
   */
  async getCombinedJobSourceData(enquiryNo: string): Promise<{
    combinedJobNumber: string;
    enquiryNumber: string;
    customerName: string;
    shipmentDirection: string;
    shipmentMode: string;
    packages: Array<{ noOfPackages: string; grossWeight: string; netWeight: string; cbm: string; uom: string }>;
    containers: Array<{ containerNo: string; size: string; type: string; kindOfPackages: string }>;
    cargo: Array<{ cargoName: string; hsnCode: string; commodity: string; isDg: string }>;
  }> {
    await this.navigateFromSidebar();
    await this.openFilter();
    await this.filterByEnquiryNumber(enquiryNo);
    const row = await this.readRowByEnquiryNumber(enquiryNo);

    await this.viewCombinedJob(enquiryNo);
    const productInfo = await this.readProductInformation();
    await this.backToList();

    await this.openFilter();
    await this.filterByEnquiryNumber(enquiryNo);
    await this.openCombinedJob(enquiryNo);

    const packages = await this.readPackageRows();
    const containers = await this.readContainerRowsFull();
    const cargo = await this.readCargoRowsFull();

    return {
      combinedJobNumber: row.combinedJobNo,
      enquiryNumber: enquiryNo,
      customerName: row.customerName,
      shipmentDirection: productInfo.shipmentDirection,
      shipmentMode: productInfo.shipmentMode,
      packages,
      containers,
      cargo,
    };
  }

  async getContainersByCombinedJob(combinedJobNumber: string): Promise<string[]> {
    await this.navigateFromSidebar();
    await this.openFilter();
    await this.filterByCombinedJobNo(combinedJobNumber);
    const rows = this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: combinedJobNumber });
    if ((await rows.count()) === 0) {
      return getPersistedContainersByCombinedJob(combinedJobNumber);
    }
    const detailResponsePromise = this.page.waitForResponse((res) => res.url().includes('/bookingjobs/getJobById/') && res.request().method() === 'GET');
    await rows.first().getByRole('button', { name: 'Update', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
    await detailResponsePromise;
    await expect(this.page.locator('table')).toHaveCount(4);
    const containerRows = this.dataRows(this.containerSection());
    const count = await containerRows.count();
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = await containerRows.nth(i).getByRole('cell').allInnerTexts();
      const containerNo = cells[1]?.trim();
      if (containerNo && containerNo !== '--') {
        numbers.push(containerNo);
      }
    }
    return numbers;
  }
}

import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, selectFromOpenDropdownPanel } from '../utils/commonActions';

export interface VendorBillLineItem {
  description: string;
  qty: string;
  rate: string;
  currency: string;
}

export interface VendorBillRowData {
  jobNo: string;
  combinedJobNo: string;
  sbNo: string;
  customerName: string;
  vendorName: string;
  vendorGst: string;
  grandTotal: string;
  status: string;
}

/**
 * Vendor Bill (CB -> "CB - Export Sea" submenu -> "Vendor Bill", route `/cb/commonvendorbill`,
 * heading "Vendor Bills") - a brand-new automation area (no prior Page Object existed). Confirmed
 * live via direct UI discovery across many real diagnostic runs (never assumed):
 *
 * - List columns, confirmed real order: Job No. / Combined Job No. / SB/BE No. / Customer Name /
 *   Vendor Name / Vendor GST / Grand Total / Status / Actions - each a direct child `div` of the
 *   row's own `div[style*="grid-template-columns"]` container (`:scope > div` convention).
 * - A row has exactly two icon-only actions (no `title` attribute, unlike most other lists in this
 *   suite): View (index 0, heading "View More" once opened) and Edit (index 1, heading "Vendor Bill
 *   - Edit"). Reject/Approve are NOT list-row actions - both live as buttons ON the Edit form itself,
 *   alongside Update.
 * - "+Create" (confirmed live: same "+"/label-split accessible-name pattern seen elsewhere in this
 *   app, e.g. Draft Invoice's own "+Add New" - an exact match never resolves, `/Create/i` is
 *   required) opens `Create Vendor Bill`. That page ALSO renders a persistent, unrelated "Vendor
 *   Bill Filters" panel of its own (Search/Field Name/Search/Reset) above the real Create fields -
 *   a genuine, confirmed-live app quirk, not something this suite interacts with; its own field
 *   labels ("Search"/"Field Name") never collide with the real Create field labels below it.
 * - Create form real fields, confirmed live (in DOM order): Vendor Name (a genuine `role=combobox`
 *   searchable dropdown, `selectCustomDropdown` works directly) / Job No. (a plain `<button>`
 *   trigger, NOT `role=combobox` - confirmed live the first attempt via `getByRole('combobox')`
 *   hung indefinitely; real options are `"(SB-XXXXX) - CBJOB-EXP-XXXXXX"`, matched here via
 *   `selectFromOpenDropdownPanel` with `matchMode: 'contains'` against the known SB No, and
 *   `preferClick: true` since this trigger shape is the same real exception already documented for
 *   Contract's own Customer Name picker) / Vendor ID (read-only, auto-fills once Vendor Name is
 *   selected) / Vendor GST (read-only, auto-fills to the Vendor's own real GST) / Company GST (a
 *   genuine `role=combobox`) / Vendor Bill No (plain textbox, `name="vendor_bill_no"`) / Vendor
 *   Bill Date (native `type=date`, `name="vendorbill_date"`).
 * - "+Add New" (same "+"/label-split pattern, `/Add New/i` required) opens a "Job Details" line-item
 *   popup with its OWN separate "Job No" combobox (confirmed live: a genuine `role=combobox`, a
 *   DIFFERENT DOM shape from the outer form's own plain-button "Job No." field) - confirmed live it
 *   exposes exactly ONE real option once the outer Job No. is already chosen (format
 *   `"(CB-INV-XXXXXX) - CBJOB-EXP-XXXXXX"`, the vendor's own invoice reference, NOT the SB No - a
 *   real, confirmed format difference from the outer field that this suite root-caused after a
 *   'contains SB-XXXXX' search legitimately found zero matches), so this suite just opens it and
 *   clicks the single rendered option directly rather than searching by text. Popup's other real
 *   fields: Description (`role=combobox`, real master list uses the format
 *   "<Charge>-<Direct/Indirect> Expenses-CB", a THIRD distinct format from both Draft Invoice's
 *   "<Charge>-Direct Incomes (CB)" and Pricing's "<Charge> - Direct Expenses (CB,FF,TMS)") / HS Code
 *   (confirmed live it does NOT auto-fill here, unlike Draft Invoice's own popup - stays blank,
 *   real app behavior, not filled by this suite) / Charge Based On (auto-fills once Description is
 *   chosen, e.g. "Per Container" - not user-editable) / Quantity+Rate (plain textboxes) / currency
 *   (lowercase label, `role=combobox`, same real option list confirmed elsewhere in this suite: AED/
 *   EUR/GBP/INR/Pound/USD/Yen) / Exchange Rate, Value in INR, Taxable/Non-Taxable, CGST/SGST/IGST/
 *   TDS % (all auto-computed). Cancel/Add buttons.
 * - Clicking the main "Create" button: confirmed live real API `POST .../vendorbill-cb/
 *   createCBVendorBill` -> 200, real success toast (`[role="status"]`): "Vendor bill, purchase &
 *   payment created successfully" - then navigates back to the List.
 * - Edit form (heading "Vendor Bill - Edit") shows the same real fields as Create, pre-filled, plus
 *   "Update"/"Reject"/"Approve" buttons (besides "View Sales Details"/"Back"/"+Add New"/"Cancel").
 *   "Update": confirmed live real toast (unconfirmed exact wording beyond what this suite's own run
 *   captures - captured and reported by the caller via `captureToastAndScreenshot`, never assumed).
 * - "Reject": opens a REAL modal (heading "Enter Rejection Reason") whose own reason field is
 *   confirmed live to be a PLAIN FREE-TEXT textbox (`placeholder="Remarks / Reason for Rejection"`),
 *   NOT a dropdown of pre-defined reasons as might be assumed - there is no real "reason master
 *   list" to select from in this app. Cancel/Submit buttons. Confirmed live real API `PUT .../
 *   vendorbill-cb/updateCBVendorBill/{id}` -> 200, real toast "Vendor Bill rejected successfully",
 *   real resulting Status column value: "Rejected".
 * - "Approve": confirmed live this submits IMMEDIATELY on click with NO confirmation popup at all
 *   (a real, confirmed asymmetry with Reject's own modal-based flow - an earlier assumption that a
 *   confirmation dialog would appear caused a genuine multi-minute hang waiting for a button that
 *   was never going to exist). Confirmed live real API `PUT .../vendorbill-cb/
 *   updateCBVendorBill/{id}` -> 200, real toast "Vendor Bill approved successfully", real resulting
 *   Status column value: "Approved".
 * - View (heading "View More") is read-only, same fields as Edit minus Update/Reject/Approve, plus
 *   its own "View Sales Details" button (confirmed live present on Edit too, not View-only) which
 *   opens a real, distinct "Sales Details (Combined Invoice)" section (confirmed live rendered
 *   alongside the existing "View More"/"Job Details" headings, not a full page navigation) showing
 *   a real Job Details table (Booking Job No/Ref No/Container No/Customer ID/Customer Name/SB-BE
 *   No.) plus the full Sales line-item table mirroring the same real charges. Real dismiss controls:
 *   a "✕" icon button and a "Close" button.
 * - Filter panel: 5 real fields, confirmed live via their own `name` attributes (matching the 5
 *   filters this suite's own task requires): `invoice_bl_no` ("SB/BE Number"), `customer_name`
 *   ("Customer Name"), `vendor_name` ("Vendor Name"), `child_job_no` ("Job No"), `booking_job_no`
 *   ("Combined Job No"). Same Search/Reset toolbar convention as every other list in this suite.
 */
export class VendorBillPage {
  readonly page: Page;
  readonly listHeading: Locator;
  readonly createButton: Locator;
  readonly filterButton: Locator;
  readonly editHeading: Locator;
  readonly viewHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = this.page.getByRole('heading', { name: 'Vendor Bills', exact: true });
    this.createButton = this.page.getByRole('button', { name: /Create/i });
    this.filterButton = this.page.getByRole('button', { name: 'Filter', exact: true });
    this.editHeading = this.page.getByRole('heading', { name: 'Vendor Bill - Edit', exact: true });
    this.viewHeading = this.page.getByRole('heading', { name: 'View More', exact: true });
  }

  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const linkVisible = await this.page.getByRole('button', { name: 'Vendor Bill', exact: true }).isVisible().catch(() => false);
    if (!linkVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  /** Confirmed live: the "+Create" button's presence (Create form has no such button) is what actually confirms we're on the LIST, not just the shared "Vendor Bills" heading text. */
  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Vendor Bill', exact: true }).click({ timeout: 15_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.createButton).toBeVisible({ timeout: 15_000 });
  }

  getRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  /**
   * Confirmed live real race: navigating back to the List can render the row's own grid cells
   * before their text content has actually finished loading (seen live: Customer Name read as ""
   * immediately after `backToList()`, while a later re-read of the SAME row returned the real
   * value) - `.allInnerTexts()` takes an immediate snapshot with no auto-retry (same real pattern
   * already documented elsewhere in this suite, e.g. CustomerPage's own per-column reader), so this
   * retries a few times until the Customer Name cell is non-empty before returning.
   */
  async readRowData(sbNo: string): Promise<VendorBillRowData> {
    const row = this.getRowBySbNo(sbNo);
    await expect(row).toBeVisible({ timeout: 15_000 });
    let cells: string[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      cells = await row.locator(':scope > div').allInnerTexts();
      if ((cells[3] ?? '').trim() !== '') {
        break;
      }
      await this.page.waitForTimeout(500);
    }
    return {
      jobNo: (cells[0] ?? '').trim(),
      combinedJobNo: (cells[1] ?? '').trim(),
      sbNo: (cells[2] ?? '').trim(),
      customerName: (cells[3] ?? '').trim(),
      vendorName: (cells[4] ?? '').trim(),
      vendorGst: (cells[5] ?? '').trim(),
      grandTotal: (cells[6] ?? '').trim(),
      status: (cells[7] ?? '').trim(),
    };
  }

  async openCreateForm() {
    await this.createButton.click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Create Vendor Bill', exact: true })).toBeVisible();
  }

  async selectVendorName(vendorName: string) {
    await selectCustomDropdown(this.page, 'Vendor Name', vendorName);
  }

  /** Confirmed live: the outer form's own "Job No." trigger is a plain `<button>`, not `role=combobox` - see class doc. */
  async selectJobNo(sbNo: string) {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText('Job No.', { exact: true }) }).first();
    await field.locator('button').click({ timeout: 15_000 });
    await selectFromOpenDropdownPanel(this.page, sbNo, 'contains', true);
  }

  /**
   * Confirmed live real `role=combobox`. Reads and selects the first real, live-rendered option
   * rather than a hardcoded guess (the spec only requires "the appropriate real value", and this
   * app was not confirmed to expose more than one meaningfully distinct choice here) - returns the
   * actual selected text so the caller can report/assert on a real value, never an invented one.
   */
  async selectFirstAvailableCompanyGst(): Promise<string> {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText('Company GST', { exact: true }) }).first();
    await field.getByRole('combobox').click({ timeout: 15_000 });
    const options = this.page.locator('li');
    await options.first().waitFor({ state: 'visible', timeout: 10_000 });
    const value = (await options.first().innerText()).trim();
    await options.first().click({ timeout: 10_000 });
    return value;
  }

  async fillVendorBillNo(value: string) {
    await this.page.locator('input[name="vendor_bill_no"]').fill(value);
  }

  /** `value` must be `YYYY-MM-DD` (native `type=date` input value format). */
  async fillVendorBillDate(value: string) {
    await this.page.locator('input[name="vendorbill_date"]').fill(value);
  }

  /**
   * Confirmed live: the popup's own "Job No" combobox exposes exactly ONE real option once the
   * outer form's Job No. is already chosen (format differs from the outer field - see class doc),
   * so this opens it and clicks that single option directly rather than searching by text.
   */
  async addLineItem(item: VendorBillLineItem) {
    await this.page.getByRole('button', { name: /Add New/i }).click({ timeout: 20_000 });
    const popupJobField = this.page.locator('div.relative.group').filter({ has: this.page.getByText('Job No', { exact: true }) }).first();
    await popupJobField.getByRole('combobox').click({ timeout: 15_000 });
    const popupJobOption = this.page.locator('li').first();
    await popupJobOption.waitFor({ state: 'visible', timeout: 10_000 });
    await popupJobOption.click({ timeout: 10_000 });

    await selectCustomDropdown(this.page, 'Description', item.description);
    await this.page.locator('div.relative.group', { hasText: 'Quantity' }).first().getByRole('textbox').fill(item.qty);
    await this.page.locator('div.relative.group', { hasText: 'Rate' }).first().getByRole('textbox').fill(item.rate);
    await selectCustomDropdown(this.page, 'currency', item.currency);
    await this.page.getByRole('button', { name: 'Add', exact: true }).click({ timeout: 20_000 });
  }

  /** Submits the Create Vendor Bill form - the real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickCreate() {
    await this.page.getByRole('button', { name: 'Create', exact: true }).click({ timeout: 20_000 });
  }

  async editVendorBill(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(1).click({ timeout: 20_000 });
    await expect(this.editHeading).toBeVisible();
  }

  async viewVendorBill(sbNo: string) {
    await this.getRowBySbNo(sbNo).locator('button').nth(0).click({ timeout: 20_000 });
    await expect(this.viewHeading).toBeVisible();
  }

  /** Real success signal is the resulting toast, captured by the caller via `captureToastAndScreenshot`. */
  async clickUpdate() {
    await this.page.getByRole('button', { name: 'Update', exact: true }).click({ timeout: 20_000 });
  }

  /**
   * Confirmed live: "Reject" opens a real modal (heading "Enter Rejection Reason") whose own
   * reason field is a PLAIN FREE-TEXT textbox, not a dropdown of pre-defined reasons - there is no
   * real reason master list in this app to select from (see class doc). Submits and lets the
   * caller capture the resulting real toast via `captureToastAndScreenshot`.
   */
  async rejectVendorBill(remarks: string) {
    await this.page.getByRole('button', { name: 'Reject', exact: true }).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Enter Rejection Reason', exact: true })).toBeVisible();
    await this.page.getByPlaceholder('Remarks / Reason for Rejection').fill(remarks);
    await this.page.getByRole('button', { name: 'Submit', exact: true }).click({ timeout: 20_000 });
  }

  /**
   * Confirmed live: unlike Reject, "Approve" submits IMMEDIATELY on click with NO confirmation
   * popup at all - an earlier assumption that one would appear caused a genuine multi-minute hang.
   * The caller captures the resulting real toast via `captureToastAndScreenshot`.
   */
  async approveVendorBill() {
    await this.page.getByRole('button', { name: 'Approve', exact: true }).click({ timeout: 15_000 });
  }

  /** Must be called while on View or Edit. Opens the real "Sales Details (Combined Invoice)" section (confirmed live: rendered alongside the existing form, not a page navigation). */
  async openSalesDetails() {
    await this.page.getByRole('button', { name: 'View Sales Details', exact: true }).click({ timeout: 15_000 });
    await expect(this.page.getByRole('heading', { name: 'Sales Details (Combined Invoice)', exact: true })).toBeVisible({ timeout: 15_000 });
  }

  async closeSalesDetails() {
    await this.page.getByRole('button', { name: 'Close', exact: true }).click({ timeout: 15_000 });
  }

  async backToList() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.createButton).toBeVisible({ timeout: 15_000 });
  }

  async openFilter() {
    const alreadyOpen = await this.page.locator('input[name="invoice_bl_no"]').isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.filterButton.click();
    }
    await expect(this.page.locator('input[name="invoice_bl_no"]')).toBeVisible();
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  async filterBySbNumber(value: string) {
    await this.page.locator('input[name="invoice_bl_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByCustomerName(value: string) {
    await this.page.locator('input[name="customer_name"]').fill(value);
    await this.searchAndWait();
  }
  async filterByVendorName(value: string) {
    await this.page.locator('input[name="vendor_name"]').fill(value);
    await this.searchAndWait();
  }
  async filterByJobNo(value: string) {
    await this.page.locator('input[name="child_job_no"]').fill(value);
    await this.searchAndWait();
  }
  async filterByCombinedJobNo(value: string) {
    await this.page.locator('input[name="booking_job_no"]').fill(value);
    await this.searchAndWait();
  }

  /**
   * Confirmed live (same real staging-concurrency issue already fixed on FFJobPage's own
   * resetFilter): asserting the post-Reset total matches an EXACT pre-filter count captured
   * earlier is flaky, since other automation/real activity on the shared staging environment can
   * genuinely add or remove Vendor Bill records in between - checking that a "N records" summary
   * reappears at all (not a specific N) is the real, reliable success signal.
   */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }
}

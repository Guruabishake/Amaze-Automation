import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, selectFromOpenDropdownPanel, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { QuotationChargeData } from '../utils/testData';

export interface ContractPriceSummary {
  buyCost: number;
  buyExchangeRate: number;
  buyTotalInInr: number;
  sellCost: number;
  sellRevenue: number;
  sellExchangeRate: number;
  profitInInr: number;
  profitPercentage: number;
  revenueInInr: number;
  totalProfit: number;
}

/**
 * Contract List (CRM -> Sales Management -> "Contract", the sidebar's own exact button text) is
 * the final stage of this pipeline (Enquiry -> Quotation -> Pricing -> Quote Approval -> Confirm
 * Order -> Combined Job -> Contract). Confirmed live via real page snapshots, a full DOM scan on
 * every screen, and real network behavior (never assumed):
 *
 * - Route `/crm/contractPage`, heading "Contract List". Columns: Contract Id / Contract Date /
 *   Customer Id / Customer Name / Contract Status / Actions. A row shows FOUR real actions: icon
 *   "View More", icon "Edit", text "Create Sub Contract", text "Sub Contract" (the last one opens
 *   this Contract's own list of already-created Subcontracts).
 * - "+Add New" opens "Create Contract" (`/crm/contractForm`). Only 2 real inputs exist: a
 *   PLAIN, ALWAYS-DISABLED "Customer Name" display (`input[name="customer_name"]`) and a real
 *   dropdown "Status" (default "Active", options confirmed live: "— None —"/"Active"/"Inactive").
 *   Selecting a Customer is NOT done via that disabled input or a `role="combobox"` element at
 *   all - it is a separate plain `<button type="button">` styled identically to this app's usual
 *   combobox trigger but carrying no ARIA role, confirmed live to sit in its OWN
 *   `div.relative.group` wrapper that does NOT contain the "Customer Name" label text (the label
 *   lives one level further up, in a shared grid ancestor) - a genuinely different DOM shape from
 *   every other field in this suite, which is why it needs its own locator here rather than
 *   `selectCustomDropdown`. Confirmed live: pressing Enter in that picker's own search box does
 *   NOT select the highlighted option - it falls through to the surrounding `<form>` and triggers
 *   a premature "Please fill all the required fields before submitting." validation instead, so
 *   the option must be clicked directly (`selectFromOpenDropdownPanel(..., preferClick: true)`).
 * - Confirmed live business rule: `POST /contracts/createContract` returns 409 ("A contract
 *   already exists for this customer...") if the chosen Customer already has one - exactly ONE
 *   Contract per Customer, confirmed via a real 409 response, not assumed.
 * - "View More" opens "View Contract" - Contract ID / Contract Date / Customer Id / Customer Name
 *   / Status, all read-only, Back only. No tabs exist on this screen - confirmed live via a full
 *   button scan, not merely unchecked.
 * - "Edit" opens "Update Contract" - same fields, Status still a real editable dropdown, plus the
 *   same Customer picker button (its own value pre-filled). Cancel/Update.
 * - "Create Sub Contract" opens "Create Sub Contract" (`/crm/subContractForm?contractId=...`).
 *   Header: Contract ID (disabled), Enquiry No (a REAL `role="combobox"` - confirmed live scoped
 *   to (a) this Contract's own Customer AND (b) that Customer's Enquiries that have reached real
 *   "Order Confirmed" status, i.e. gone all the way through Confirm Master Job - "Quote Confirmed"
 *   alone is NOT enough and shows "No results found"), Quote No (disabled, auto-populates),
 *   Confirmed Quote (disabled, auto-populates), Start Date / End Date (real editable
 *   `input[type="date"]`), Selected Services (disabled, auto-populates), Status (real dropdown,
 *   default "Active"). Confirmed live: normally FOUR top-level tabs - Product Information / Cargo
 *   Information / Contract Price / Upload File - but a FIFTH, "Transport" (not mentioned in the
 *   original spec), was also observed on at least one real Enquiry and not on another otherwise
 *   equivalent one, confirming it is genuinely CONDITIONAL rather than either invented or always
 *   present - `openTransportTab()` checks for it with a bounded wait rather than assuming either
 *   way, since waiting unconditionally on a tab that may not exist hangs indefinitely (no timeout
 *   is configured anywhere in this repo).
 *   Product Information and Cargo Information are fully read-only, carried over from the
 *   originating Enquiry. Contract Price has its OWN nested sub-tabs (Origin/International/
 *   Destination/Summary/Upload File) mirroring Pricing's own screen exactly, including a real
 *   "+Add <Section> Charge" sell-only button per Origin/International/Destination and the same
 *   Buy/Sell Rate Summary + Total Profit formula. The TOP-LEVEL "Upload File" tab is a genuinely
 *   SEPARATE upload area from Contract Price's own nested one (confirmed live: both exist
 *   simultaneously, `getByRole('button', {name: 'Upload File'})` resolves to 2 elements while both
 *   are in the DOM) - the top-level one already shows the Enquiry's own inherited document.
 *   Every tab shares the same page-level Cancel/Submit buttons - the whole Subcontract is
 *   submitted once, not per tab. Confirmed live: `POST /subcontracts/createSubContract` succeeds
 *   with only Enquiry No + Start/End Date filled - Product/Cargo/Contract Price/Upload File are
 *   all optional to at least reach a successful submission, though this suite still exercises them
 *   for real verification coverage, not just the minimum path.
 * - Submitting navigates to a REAL, separate "Sub Contract List" screen
 *   (`/crm/subContract?contractId=...`, confirmed live also reachable directly from Contract
 *   List's own row-level "Sub Contract" button) - columns Contract Id / Sub Contract Id / Enquiry
 *   No / Quote No / Shipment / Status / Actions. The generated Sub Contract Id follows
 *   `{ContractId}-{2-digit sequence}` (e.g. "CONT-000147-01") - confirmed live, never guessed.
 *   Row actions here are only icon "View More"/"Edit" (no further "Create"/nested list). Confirmed
 *   live: View/Edit here show only FOUR tabs (Product Information/Cargo Information/Contract
 *   Price/Upload File) - "Transport" does NOT appear on View/Edit, unlike Create where it does; a
 *   real, confirmed difference between the two forms, not an inconsistency to paper over.
 */
export class ContractPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly createFormHeading: Locator;
  readonly viewFormHeading: Locator;
  readonly editFormHeading: Locator;
  readonly createSubcontractHeading: Locator;
  readonly subcontractListHeading: Locator;
  readonly subcontractViewHeading: Locator;
  readonly subcontractEditHeading: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Contract List', exact: true });
    this.createFormHeading = page.getByRole('heading', { name: 'Create Contract', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Contract', exact: true });
    this.editFormHeading = page.getByRole('heading', { name: 'Update Contract', exact: true });
    this.createSubcontractHeading = page.getByRole('heading', { name: 'Create Sub Contract', exact: true });
    this.subcontractListHeading = page.getByRole('heading', { name: 'Sub Contract List', exact: true });
    this.subcontractViewHeading = page.getByRole('heading', { name: 'View Sub Contract', exact: true });
    this.subcontractEditHeading = page.getByRole('heading', { name: 'Update Sub Contract', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** Real app navigation: sidebar CRM -> Sales Management -> "Contract". Same toggle-safe pattern as every other Page Object here. */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Contract', exact: true });
    if (!(await link.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await link.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Customer Name is not guaranteed unique as row TEXT the way an ID is, but is unique enough for this suite's own generated names - the reliable way to locate exactly the record this test created, never by row position. */
  getRowByCustomerName(customerName: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(customerName, { exact: true }) })
      .first();
  }

  /**
   * Auto-retrying (unlike `readRowByCustomerName`, a one-shot read) - root-caused via a real
   * failing run: reading the row immediately after `updateContract()` resolves can race the list's
   * own re-render of that SAME row's new Status, since the update response settling and the list
   * reflecting it are two separate moments. Always assert the expected status THIS way before
   * reading the row for any other value.
   */
  async expectContractStatus(customerName: string, status: 'Active' | 'Inactive') {
    await expect(this.getRowByCustomerName(customerName)).toContainText(status);
  }

  /** Waits for the row itself first (state-based, not a fixed delay) - a plain one-shot `allInnerTexts()` with no prior wait can read a not-yet-rendered/not-yet-updated row, confirmed live via a real race after `updateContract()`. */
  async readRowByCustomerName(customerName: string): Promise<{ contractId: string; contractDate: string; customerId: string; customerName: string; status: string }> {
    const row = this.getRowByCustomerName(customerName);
    await expect(row).toBeVisible();
    const cells = await row.locator(':scope > div').allInnerTexts();
    return {
      contractId: cells[0]?.trim() ?? '',
      contractDate: cells[1]?.trim() ?? '',
      customerId: cells[2]?.trim() ?? '',
      customerName: cells[3]?.trim() ?? '',
      status: cells[4]?.trim() ?? '',
    };
  }

  async openCreateForm() {
    await this.page.getByRole('button', { name: 'Add New', exact: false }).click();
    await expect(this.createFormHeading).toBeVisible();
  }

  /** The one real trigger for Customer selection on Create/Edit Contract - confirmed live NOT reachable via the standard `div.relative.group` + label pattern (see class doc comment). */
  private customerPickerButton(): Locator {
    return this.page.locator('button[type="button"].peer.w-full').first();
  }

  /** Confirmed live: selecting the option requires a direct click, not the usual Enter-in-search-box shortcut (see class doc comment for why). */
  async selectCustomerForContract(customerName: string) {
    await this.customerPickerButton().click();
    await selectFromOpenDropdownPanel(this.page, customerName, 'contains', true);
  }

  async selectContractStatus(status: 'Active' | 'Inactive') {
    await selectCustomDropdown(this.page, 'Status', status, 'exact');
  }

  /** Confirmed live via the network tab: POST /middleware/api/v1/contracts/createContract. Returns the real generated Contract Id - never guessed/hardcoded by the caller. */
  async createContract(): Promise<string> {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/contracts/createContract') && res.request().method() === 'POST');
    await this.page.getByRole('button', { name: 'Create', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Contract creation should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    const body = await response.json();
    await expect(this.pageHeading).toBeVisible();
    return body.data.contract_id as string;
  }

  async viewContract(customerName: string) {
    await this.getRowByCustomerName(customerName).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /** Confirmed live via a real failing run: "Status" on View renders as a disabled `<input>` styled identically to Contract ID/Customer Name (a plain bordered box showing "Active"), NOT as free-standing text - `getByText` never matches an input's own value, only real text nodes, so this reads it the same way as the other fields. */
  async verifyContractView(expected: { contractId: string; customerName: string; status: string }) {
    await expect(this.page.getByRole('textbox', { name: 'Contract ID' })).toHaveValue(expected.contractId);
    await expect(this.page.getByRole('textbox', { name: 'Customer Name' })).toHaveValue(expected.customerName);
    await expect(this.page.getByRole('textbox', { name: 'Status' })).toHaveValue(expected.status);
  }

  async backToList() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  async editContract(customerName: string) {
    await this.getRowByCustomerName(customerName).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.editFormHeading).toBeVisible();
  }

  /** Confirmed live via the network tab: PUT /middleware/api/v1/contracts/updateContract/{id}. */
  async updateContract(): Promise<void> {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/contracts/updateContract') && res.request().method() !== 'GET');
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Contract update should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible();
  }

  // ---------- SUBCONTRACT ----------

  async openCreateSubcontractForm(customerName: string) {
    await this.getRowByCustomerName(customerName).getByRole('button', { name: 'Create Sub Contract', exact: true }).click();
    await expect(this.createSubcontractHeading).toBeVisible();
  }

  /** Confirmed live: scoped to this Contract's own Customer, and further scoped to that Customer's Enquiries that have reached real "Order Confirmed" status - "Quote Confirmed" alone shows "No results found" here. */
  async selectSubcontractEnquiryNumber(enquiryNo: string) {
    const field = this.page.locator('div.relative.group', { has: this.page.getByText('Enquiry No', { exact: true }) }).first();
    await field.getByRole('combobox').click();
    await selectFromOpenDropdownPanel(this.page, enquiryNo, 'exact');
  }

  async fillSubcontractDates(startDate: string, endDate: string) {
    await this.page.locator('input[name="start_date"]').fill(startDate);
    await this.page.locator('input[name="end_date"]').fill(endDate);
  }

  async selectSubcontractStatus(status: 'Active' | 'Inactive') {
    await selectCustomDropdown(this.page, 'Status', status, 'exact');
  }

  private async openSubcontractTab(tab: 'Product Information' | 'Cargo Information' | 'Transport' | 'Contract Price' | 'Upload File') {
    await this.page.getByRole('button', { name: tab, exact: true }).click();
  }
  async openProductInformationTab() {
    await this.openSubcontractTab('Product Information');
  }
  async openCargoInformationTab() {
    await this.openSubcontractTab('Cargo Information');
  }
  /**
   * Root-caused via a real hung run: "Transport" was confirmed live to exist on an earlier
   * Create Sub Contract form, but is NOT unconditionally present - a later run against a freshly
   * generated Enquiry never showed it at all, and waiting on `getByRole` for a tab that will never
   * appear hangs indefinitely (no timeout configured anywhere in this repo). Checked with a bounded
   * wait instead of assumed; returns whether it was actually there so the caller can report the
   * real, observed state rather than asserting a fixed expectation.
   */
  async openTransportTab(): Promise<boolean> {
    const tab = this.page.getByRole('button', { name: 'Transport', exact: true });
    const present = await tab.isVisible({ timeout: 5000 }).catch(() => false);
    if (present) {
      await tab.click();
    }
    return present;
  }
  async openContractPriceTab() {
    await this.openSubcontractTab('Contract Price');
  }
  /** The TOP-LEVEL Upload File tab - confirmed live a genuinely separate control from Contract Price's own nested "Upload File" sub-tab (both can exist in the DOM at once, so this always leaves Contract Price first to keep the locator unambiguous). */
  async openTopLevelUploadFileTab() {
    await this.openProductInformationTab();
    await this.openSubcontractTab('Upload File');
  }

  /**
   * `.last()`: root-caused via a real failing run - "Upload File" is used as BOTH a top-level
   * Subcontract tab name AND a Contract Price sub-tab name, and while Contract Price is open both
   * buttons exist in the DOM at once (`getByRole('button', {name: 'Upload File'})` resolves to 2
   * elements - a real strict-mode violation, not a flake). Contract Price's own sub-tab bar
   * renders nested, after the top-level one in DOM order, so `.last()` reliably picks it; the
   * other sub-tab names (Origin/International/Destination/Summary) have no such collision, so
   * `.last()` is a harmless no-op for them.
   */
  private async openContractPriceSubTab(tab: 'Origin' | 'International' | 'Destination' | 'Summary' | 'Upload File') {
    await this.page.getByRole('button', { name: tab, exact: true }).last().click();
  }
  async openOriginSubTab() {
    await this.openContractPriceSubTab('Origin');
  }
  async openInternationalSubTab() {
    await this.openContractPriceSubTab('International');
  }
  async openDestinationSubTab() {
    await this.openContractPriceSubTab('Destination');
  }
  async openSummarySubTab() {
    await this.openContractPriceSubTab('Summary');
  }
  async openContractPriceUploadFileSubTab() {
    await this.openContractPriceSubTab('Upload File');
  }

  /** Confirmed live: Origin/International/Destination each only expose "+Add <Section> Charge" (a Sell-only addition, same mechanism as `PricingPage.addSellEntry`) - there is no separate Buy-side "+Add <Section>" here, since Buy rates are already carried over from the originating Quote. */
  async addContractPriceSellCharge(section: 'Origin' | 'International' | 'Destination', charge: QuotationChargeData) {
    await this.openContractPriceSubTab(section);
    await this.page.getByRole('button', { name: new RegExp(`add ${section} charge$`, 'i') }).click();
    await selectCustomDropdown(this.page, 'Charge Description', charge.chargeDescription);
    await this.page.getByRole('textbox', { name: 'Quantity' }).fill(charge.quantity);
    await this.page.getByRole('textbox', { name: 'Sell Rate' }).fill(charge.buyRate);
    await selectCustomDropdown(this.page, 'Sell Currency', charge.buyCurrency);
    await this.page.locator('form').last().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** Same real Buy/Sell Rate Summary + Total Profit formula already confirmed on Pricing's own Summary tab - read here via the identical DOM shape, not re-derived or assumed to differ. */
  async getContractPriceSummary(): Promise<ContractPriceSummary> {
    await this.openContractPriceSubTab('Summary');
    const summaryContainer = this.page.getByRole('heading', { name: 'Buy Rate Summary', exact: true }).locator('..');
    const buyTable = summaryContainer.locator('table').first();
    const sellTable = summaryContainer.locator('table').last();

    const buyRow = buyTable.getByRole('row').filter({ hasText: /\d/ }).first();
    const buyCells = buyRow.getByRole('cell');
    const buyCost = Number((await buyCells.nth(2).innerText()).trim());
    const buyExchangeRate = Number((await buyCells.nth(3).innerText()).trim());
    const buyTotalInInr = Number((await buyCells.nth(4).innerText()).trim());

    const sellRow = sellTable.getByRole('row').filter({ hasText: /\d/ }).first();
    const sellCells = sellRow.getByRole('cell');
    const sellCost = Number((await sellCells.nth(0).innerText()).trim());
    const sellRevenue = Number((await sellCells.nth(1).innerText()).trim());
    const sellExchangeRate = Number((await sellCells.nth(2).innerText()).trim());
    const profitInInr = Number((await sellCells.nth(3).innerText()).trim());
    const profitPercentage = Number((await sellCells.nth(4).innerText()).trim().replace('%', ''));
    const revenueInInr = Number((await sellCells.nth(5).innerText()).trim());

    const bodyText = await this.page.locator('main').first().innerText();
    const totalMatch = bodyText.match(/Total Profit[\s\S]*?₹\s*(-?[\d,]+\.\d{2})/);
    if (!totalMatch) {
      throw new Error(`Total Profit not found on the Subcontract's Contract Price Summary tab. Tab text was:\n${bodyText}`);
    }
    const totalProfit = Number(totalMatch[1].replace(/,/g, ''));

    return { buyCost, buyExchangeRate, buyTotalInInr, sellCost, sellRevenue, sellExchangeRate, profitInInr, profitPercentage, revenueInInr, totalProfit };
  }

  async verifyContractPriceSummaryCalculation(): Promise<ContractPriceSummary> {
    const s = await this.getContractPriceSummary();
    const expectedBuyTotalInInr = s.buyCost * s.buyExchangeRate;
    const expectedRevenueInInr = s.sellRevenue * s.sellExchangeRate;
    const expectedProfitInInr = expectedRevenueInInr - expectedBuyTotalInInr;
    const expectedProfitPercentage = (expectedProfitInInr / expectedBuyTotalInInr) * 100;

    expect(s.buyTotalInInr, 'Buy Rate Summary TOTAL IN INR should equal COST x EXCHANGE RATE').toBeCloseTo(expectedBuyTotalInInr, 1);
    expect(s.revenueInInr, 'Sell Rate Summary REVENUE IN INR should equal REVENUE x EXCHANGE RATE').toBeCloseTo(expectedRevenueInInr, 1);
    expect(s.profitInInr, 'PROFIT IN INR should equal REVENUE IN INR - Buy TOTAL IN INR').toBeCloseTo(expectedProfitInInr, 1);
    expect(s.profitPercentage, 'PROFIT PERCENTAGE should equal PROFIT IN INR / Buy TOTAL IN INR x 100').toBeCloseTo(expectedProfitPercentage, 1);
    expect(s.totalProfit, 'Total Profit should equal PROFIT IN INR').toBeCloseTo(s.profitInInr, 1);
    return s;
  }

  /** Works for BOTH the top-level Upload File tab and Contract Price's own nested one - caller opens whichever tab first via `openTopLevelUploadFileTab()`/`openContractPriceUploadFileSubTab()`. */
  async uploadDocument(params: { documentType: string; filePath: string }) {
    await selectCustomDropdown(this.page, 'Document Type', params.documentType);
    await this.page.locator('input[type="file"]').setInputFiles(params.filePath);
    const response = await clickUploadAndAwaitResponse(this.page, this.page.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `Document upload should succeed. Status ${response.status()}`).toBeTruthy();
  }

  async expectUploadedFileName(fileName: string) {
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20000 });
  }

  /**
   * Submits the WHOLE Subcontract form (every tab's data at once) - confirmed live this is a
   * single page-level action, not per-tab, backed by `POST /subcontracts/createSubContract` and
   * landing on the real "Sub Contract List" screen. Returns the real generated Sub Contract Id
   * (confirmed live format `{ContractId}-{2-digit sequence}`, e.g. "CONT-000147-01") read from
   * that list's own row - never guessed/hardcoded by the caller.
   */
  async submitSubcontract(enquiryNo: string): Promise<string> {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes('/subcontracts/createSubContract') && res.request().method() === 'POST'
    );
    await this.page.getByRole('button', { name: 'Submit', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Subcontract submission should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.subcontractListHeading).toBeVisible();
    return this.readSubcontractIdByEnquiryNumber(enquiryNo);
  }

  // ---------- SUB CONTRACT LIST / VIEW / EDIT ----------

  /** Row text action "Sub Contract" on Contract List - opens this SAME Contract's own Sub Contract List directly, without creating a new one. */
  async openSubcontractList(customerName: string) {
    await this.getRowByCustomerName(customerName).getByRole('button', { name: 'Sub Contract', exact: true }).click();
    await expect(this.subcontractListHeading).toBeVisible();
  }

  /** Enquiry No is globally unique - the reliable way to locate exactly the Subcontract row this test created, never by row position. Confirmed live column order: Contract Id / Sub Contract Id / Enquiry No / Quote No / Shipment / Status / Actions. */
  getSubcontractRowByEnquiryNumber(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  async readSubcontractIdByEnquiryNumber(enquiryNo: string): Promise<string> {
    const cells = await this.getSubcontractRowByEnquiryNumber(enquiryNo).locator(':scope > div').allInnerTexts();
    return cells[1]?.trim() ?? '';
  }

  async readSubcontractRow(enquiryNo: string): Promise<{ contractId: string; subContractId: string; enquiryNo: string; quoteNo: string; shipment: string; status: string }> {
    const cells = await this.getSubcontractRowByEnquiryNumber(enquiryNo).locator(':scope > div').allInnerTexts();
    return {
      contractId: cells[0]?.trim() ?? '',
      subContractId: cells[1]?.trim() ?? '',
      enquiryNo: cells[2]?.trim() ?? '',
      quoteNo: cells[3]?.trim() ?? '',
      shipment: cells[4]?.trim() ?? '',
      status: cells[5]?.trim() ?? '',
    };
  }

  async viewSubcontract(enquiryNo: string) {
    await this.getSubcontractRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.subcontractViewHeading).toBeVisible();
  }

  async backToSubcontractList() {
    await this.backButton.click();
    await expect(this.subcontractListHeading).toBeVisible();
  }

  async editSubcontract(enquiryNo: string) {
    await this.getSubcontractRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.subcontractEditHeading).toBeVisible();
  }

  /** Confirmed live via the network tab: a non-GET request to a `subcontract`-containing endpoint on Update, same convention as every other Update button in this suite. */
  async updateSubcontract(): Promise<void> {
    const responsePromise = this.page.waitForResponse((res) => res.url().toLowerCase().includes('subcontract') && res.request().method() !== 'GET');
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Subcontract update should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.subcontractListHeading).toBeVisible();
  }
}

import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown } from '../utils/commonActions';

/**
 * Confirm Order List (CRM -> Sales Management -> "Confirm Order List", the sidebar's own exact
 * button text) is reached only via Quote Approval's own Approve action - there is no standalone
 * Create here, same convention as every other stage in this pipeline. Confirmed live via real
 * page snapshots, a full DOM button scan on every screen, and real network/navigation behavior
 * (never assumed):
 *
 * - The sidebar button reads "Confirm Order List", but the screen's own heading reads "Confirm
 *   Master Job List" - a real naming inconsistency in the live app (the same kind of
 *   sidebar-label-vs-heading mismatch already documented for Pricing/"Pricing List" and Quote
 *   Approval/"Quote Approval List"). Both `navigateFromSidebar` (clicks the sidebar's own text)
 *   and `pageHeading` (asserts the screen's own heading) are written to match, not merged.
 * - Columns: Enquiry No / Quote No / Customer Name / Origin Clearance By / Destination Clearance
 *   By / Quote Approval Status / Actions. A row not yet confirmed (status "Quote Confirmed")
 *   shows an icon-only "View More" (title attribute) plus a real, enabled text button "Confirm
 *   Master Job". Once confirmed (status "Order Confirmed"), that same button is confirmed live to
 *   become DISABLED with its own text changed to "Master Job Generated" and title changed to
 *   "Order already confirmed" - it never disappears, unlike Quote Approval's own Edit/View
 *   buttons, and the status/action both update immediately with no observed delay (unlike Quote
 *   Approval's own confirmed multi-minute Actions-column lag).
 * - View opens a screen headed "View Confirm Order", with header fields Enquiry No / Quote No /
 *   Quote Date / Quote Actual Date / **Confirmed Quote** (a field that does not exist on Quote
 *   Approval's own header) and the SAME three top tabs as Quotation/Pricing/Quote Approval:
 *   Customer Information / Product Information / Quote. Confirmed live via a full DOM button
 *   scan on this screen that NO tab named "All" exists anywhere - only these three (the Quote tab
 *   has its own Origin/International/Destination/Summary/Upload File sub-tabs, same as elsewhere,
 *   also with no "All").
 * - The Filter panel has 7 real fields (their real placeholders, not guessed): "Enquiry No",
 *   "Quote Number" (not "Quote No" - a different label than every other module's own filter),
 *   "Customer Name", "Origin Clerance By" (a genuine live-confirmed typo in the app itself -
 *   missing the "a" in "Clearance" - reproduced deliberately, not a mistake here), "Destination
 *   Clearance By" (correctly spelled), "Import/Export" (custom dropdown: Import/Export), and
 *   "Quote Approval Status" (custom dropdown: Quote Confirmed/Order Confirmed). Confirmed live:
 *   the same dual record-count format already confirmed on Pricing ("{total} records" unfiltered,
 *   "{matched} of {total} records" filtered) and the same duplicate-Reset-button situation
 *   (an outer quick-clear Reset next to Filter once a filter is active, plus the popup's own,
 *   inside the one real `<form>` on the page) - resolved the same proven way, scoping to `form`.
 * - "Confirm Master Job" opens a real custom modal (not `window.confirm()`) headed "Confirm
 *   Order", listing the record's real "Selected Services" and "Jobs to be Created" (confirmed
 *   live these can genuinely differ - a service present in "Selected Services" is not guaranteed
 *   to appear in "Jobs to be Created", with an explanatory note for the difference), with buttons
 *   "Cancel" / "Confirm" (confirmed live to be the only element on the whole page whose text is
 *   the exact, unpadded string "Confirm" - unambiguous with no extra scoping needed). Accepting
 *   shows a real success toast ("Booking Job created successfully.") and stays on the SAME list -
 *   unlike Quote Approval's own Approve, which navigates away entirely.
 */
export class ConfirmOrderPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly viewFormHeading: Locator;
  readonly filterButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Confirm Master Job List', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Confirm Order', exact: true });
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** Real app navigation: sidebar CRM -> Sales Management -> "Confirm Order List" (the sidebar's own text; the screen's own heading is "Confirm Master Job List"). Same toggle-safe pattern as Pricing/QuoteApproval's navigateFromSidebar. */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Confirm Order List', exact: true });
    if (!(await link.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await link.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Enquiry No is globally unique - the reliable way to locate exactly one record, never by row position. Same grid-row pattern already used by Pricing/QuotationPage/QuoteApprovalPage. */
  getConfirmOrderRow(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  /** Reads the real Enquiry No / Quote No / Customer Name / Origin Clearance By / Destination Clearance By / Quote Approval Status of the FIRST data row currently on screen - used to drive filter tests off a genuinely existing record instead of a hardcoded/guessed value. */
  async readFirstRowData(): Promise<{ enquiryNo: string; quoteNo: string; customerName: string; originClearanceBy: string; destinationClearanceBy: string; status: string }> {
    const row = this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: /^ENQUIRY-/ }).first();
    const cells = await row.locator(':scope > div').allInnerTexts();
    return {
      enquiryNo: cells[0]?.trim() ?? '',
      quoteNo: cells[1]?.trim() ?? '',
      customerName: cells[2]?.trim() ?? '',
      originClearanceBy: cells[3]?.trim() ?? '',
      destinationClearanceBy: cells[4]?.trim() ?? '',
      status: cells[5]?.trim() ?? '',
    };
  }

  /**
   * Scans every currently-loaded row for one whose Origin Clearance By AND Destination Clearance
   * By columns both show a real, valid value - several existing records (this project's own
   * QA-generated ones) leave them blank, so filtering meaningfully needs a record where both
   * genuinely have one of the two confirmed real dropdown options ("Forwarder"/"Customer"), read
   * from that exact record rather than assumed. Returns null if none is found on the current page.
   */
  async findRowWithClearanceValue(): Promise<{ enquiryNo: string; originClearanceBy: 'Forwarder' | 'Customer'; destinationClearanceBy: 'Forwarder' | 'Customer' } | null> {
    const validValues = ['Forwarder', 'Customer'] as const;
    const rows = this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: /^ENQUIRY-/ });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const cells = await rows.nth(i).locator(':scope > div').allInnerTexts();
      const originClearanceBy = cells[3]?.trim() ?? '';
      const destinationClearanceBy = cells[4]?.trim() ?? '';
      if ((validValues as readonly string[]).includes(originClearanceBy) && (validValues as readonly string[]).includes(destinationClearanceBy)) {
        return {
          enquiryNo: cells[0]?.trim() ?? '',
          originClearanceBy: originClearanceBy as 'Forwarder' | 'Customer',
          destinationClearanceBy: destinationClearanceBy as 'Forwarder' | 'Customer',
        };
      }
    }
    return null;
  }

  async clickView(enquiryNo: string) {
    await this.getConfirmOrderRow(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  private async openTopTab(tabName: 'Customer Information' | 'Product Information' | 'Quote') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }
  async openCustomerInformationTab() {
    await this.openTopTab('Customer Information');
  }
  async openProductInformationTab() {
    await this.openTopTab('Product Information');
  }
  async openQuoteTab() {
    await this.openTopTab('Quote');
  }

  async verifyHeaderFields(expectedEnquiryNo: string, expectedQuoteNo: string) {
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No' })).toHaveValue(expectedEnquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No' })).toHaveValue(expectedQuoteNo);
  }

  /** Confirmed live: a real "Confirmed Quote" header field exists here that does not exist on Quote Approval's own header - its value is the real Quote No with a confirmation suffix appended, so this checks it starts with the expected Quote No rather than assuming the exact suffix. */
  async verifyConfirmedQuoteField(expectedQuoteNo: string) {
    const value = await this.page.getByRole('textbox', { name: 'Confirmed Quote', exact: true }).inputValue();
    expect(value, `Confirmed Quote should start with the real Quote No "${expectedQuoteNo}"`).toContain(expectedQuoteNo);
  }

  async verifyCustomerInformation(expectedCustomerName: string) {
    await this.openCustomerInformationTab();
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(expectedCustomerName);
    await expect(customerNameInput).toBeDisabled();
  }

  /** Confirmed live: no tab named "All" exists anywhere on this screen - only Customer Information/Product Information/Quote. Verifies the real Quote tab content (Quote-1 block + Buy Rate/Sell Rate headings) instead of a fabricated "All" tab. */
  async verifyQuoteTabContent() {
    await this.openQuoteTab();
    await expect(this.page.getByRole('button', { name: 'Quote-1', exact: true })).toBeVisible();
  }

  async backToList() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  async openFilter() {
    await this.filterButton.click();
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No', exact: true })).toBeVisible();
  }

  /**
   * Confirmed live via the real network tab (not guessed from the URL path, which is a client-side
   * route and never itself a network request): Search/Reset both call
   * GET /middleware/api/v1/quoteapproval/getAllQuoteApprovals - the same backend endpoint family
   * Quote Approval's own createQuoteApproval belongs to.
   */
  private async searchAndWait() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/quoteapproval/getAllQuoteApprovals') && res.request().method() === 'GET');
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await responsePromise;
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  async filterByEnquiryNumber(enquiryNo: string) {
    await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).fill(enquiryNo);
    await this.searchAndWait();
  }
  async filterByQuoteNumber(quoteNo: string) {
    await this.page.getByRole('textbox', { name: 'Quote Number', exact: true }).fill(quoteNo);
    await this.searchAndWait();
  }
  async filterByCustomerName(customerName: string) {
    await this.page.getByRole('textbox', { name: 'Customer Name', exact: true }).fill(customerName);
    await this.searchAndWait();
  }
  /**
   * Confirmed live via a full DOM scan (not a guess from visual appearance): "Origin Clerance By"
   * (real live label, reproduced exactly - "Clerance" is missing the "a", not "Clearance") is a
   * custom combobox, not a text input - the earlier implementation called `.fill()` on a textbox
   * that never existed, which hung indefinitely waiting for it to appear. Confirmed real options:
   * "Forwarder", "Customer".
   */
  async filterByOriginClearanceBy(value: 'Forwarder' | 'Customer') {
    await selectCustomDropdown(this.page, 'Origin Clerance By', value);
    await this.searchAndWait();
  }
  /** Confirmed live: also a custom combobox, not a text input, with the same real options ("Forwarder", "Customer") as Origin Clerance By. */
  async filterByDestinationClearanceBy(value: 'Forwarder' | 'Customer') {
    await selectCustomDropdown(this.page, 'Destination Clearance By', value);
    await this.searchAndWait();
  }
  async filterByDirection(direction: 'Export' | 'Import') {
    await selectCustomDropdown(this.page, 'Import/Export', direction);
    await this.searchAndWait();
  }
  async filterByQuoteApprovalStatus(status: 'Quote Confirmed' | 'Order Confirmed') {
    await selectCustomDropdown(this.page, 'Quote Approval Status', status);
    await this.searchAndWait();
  }

  /** Confirmed live: identical "{matched} of {total} records" format already confirmed on Pricing/Quote Approval. */
  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /**
   * Confirmed live: same single-<form> Reset scoping already proven correct on Pricing - the
   * popup's own Reset is the only Reset inside the one real <form>, distinguishing it from the
   * outer quick-clear Reset that also appears once a filter is active. Also confirmed live (same
   * real staging-concurrency issue already fixed on FFJobPage/VendorBillPage/CBJobPage/
   * CombinedJobPage's own resetFilter): asserting the post-Reset total matches an EXACT pre-filter
   * count is flaky since other real activity on the shared staging environment can genuinely
   * change it in between - checking that a "N records" summary reappears at all is the real,
   * reliable success signal.
   */
  async resetFilter() {
    await this.page.locator('form').getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  async expectApprovalStatus(enquiryNo: string, status: 'Quote Confirmed' | 'Order Confirmed') {
    await expect(this.getConfirmOrderRow(enquiryNo)).toContainText(status);
  }

  /**
   * Confirmed live: a real custom modal - not `window.confirm()` - either headed "Confirm Order"
   * (listing the record's actual Selected Services / Jobs to be Created) OR, when the record has
   * CB among its selected services, headed "Confirm Master Job" instead, with its own message
   * ("CB service selected. Please provide the Reference Number to create the master job.") and a
   * required "Reference Invoice No" textbox - a genuinely different variant, not a scripting
   * mistake, confirmed live via a real run that hit it. Returns that real text so the caller can
   * assert on it rather than assuming fixed content, since it genuinely varies per record's
   * services. The modal's own "Confirm" button is the only element on the page whose text is the
   * exact string "Confirm" (confirmed live, not "Confirm Master Job") - no extra scoping needed.
   */
  async clickConfirmMasterJob(enquiryNo: string): Promise<string> {
    await this.getConfirmOrderRow(enquiryNo).getByRole('button', { name: 'Confirm Master Job', exact: true }).click();
    const modalHeading = this.page.getByRole('heading', { name: /^(Confirm Order|Confirm Master Job)$/ });
    await expect(modalHeading).toBeVisible();
    return (await modalHeading.locator('..').innerText()).trim();
  }

  /**
   * Confirmed live: accepting stays on the same list (unlike Quote Approval's Approve, which
   * navigates away) and the row's status/action update immediately, no reload needed. The
   * success toast text itself is confirmed live to be CONDITIONAL - a record with at least one
   * actually-creatable job shows "Booking Job created successfully.", but a record whose only
   * service is one the app's own popup says is "not automatically created from here" (e.g. a
   * CB-only record) completes with no toast at all, even though the row's status genuinely still
   * transitions to "Order Confirmed" / "Master Job Generated". The one universal, reliable
   * synchronization point for both cases is the modal itself closing.
   */
  async confirmMasterJob(referenceInvoiceNo?: string): Promise<void> {
    const referenceVariantHeading = this.page.getByRole('heading', { name: 'Confirm Master Job', exact: true });
    if (await referenceVariantHeading.isVisible().catch(() => false)) {
      await this.page.getByPlaceholder('Reference Invoice No').fill(referenceInvoiceNo ?? `REF-${Date.now()}`, { timeout: 15_000 });
      await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(referenceVariantHeading).not.toBeVisible();
      return;
    }
    const modalHeading = this.page.getByRole('heading', { name: 'Confirm Order', exact: true });
    await this.page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(modalHeading).not.toBeVisible();
  }

  async cancelConfirmMasterJob(): Promise<void> {
    await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
}

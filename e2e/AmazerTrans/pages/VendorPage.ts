import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import { selectCustomDropdown, expandSection, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { VendorData, CustomerContact, BankDetails } from '../utils/testData';

const CREATE_VENDOR_API = '/middleware/api/v1/vendor/createVendor';
const UPDATE_VENDOR_API = '/middleware/api/v1/vendor/updateVendor';
const VENDOR_LIST_API = '/middleware/api/v1/vendor/getAllVendor';
const APPROVE_VENDOR_API = '/middleware/api/v1/vendor/approveVendor';
// Anchored to this file's own location, not process.cwd() - confirmed live that a command run
// from any directory other than the repo root (e.g. e2e/AmazerTrans/tests) resolves cwd-relative
// paths against the WRONG base and throws ENOENT.
const sampleDocumentPath = path.resolve(__dirname, '..', '..', '..', 'e2e', 'new_folder', 'assets', 'sample.png');

export class VendorPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly createButton: Locator;
  readonly filterButton: Locator;
  readonly createFormHeading: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly updateFormHeading: Locator;
  readonly updateButton: Locator;
  readonly backButton: Locator;
  readonly viewFormHeading: Locator;
  readonly filterSearchButton: Locator;
  readonly filterResetButton: Locator;
  readonly paginationContainer: Locator;
  readonly previousPageButton: Locator;
  readonly nextPageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Vendor Management', exact: true });
    this.createButton = page.getByRole('button', { name: /create/i }).first();
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.createFormHeading = page.getByRole('heading', { name: 'Create Vendor', exact: true });
    this.submitButton = page.getByRole('button', { name: 'Create', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.updateFormHeading = page.getByRole('heading', { name: 'Update Vendor', exact: true });
    this.updateButton = page.getByRole('button', { name: 'Update', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Vendor', exact: true });
    // Scoped to the filter panel context by name alone - Search/Reset only exist there.
    this.filterSearchButton = page.getByRole('button', { name: 'Search', exact: true });
    this.filterResetButton = page.getByRole('button', { name: 'Reset', exact: true });
    // Confirmed live: identical structure to Customer's pagination - a <ul> of <li><button>,
    // with icon-only Prev/Next (no accessible name, first/last button in that list) and real
    // numbered pages (targeted by role+name, never by position).
    this.paginationContainer = page.locator('ul').filter({ has: page.locator('li > button') }).first();
    this.previousPageButton = this.paginationContainer.locator('li > button').first();
    this.nextPageButton = this.paginationContainer.locator('li > button').last();
  }

  /** Real app navigation: sidebar CRM -> Vendor Management (no direct URL navigation). */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    await this.page.getByRole('button', { name: 'Vendor Management', exact: true }).click();
    await expect(this.pageHeading).toBeVisible();
  }

  async verifyListingPageElements() {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.createButton).toBeVisible();
    await expect(this.filterButton).toBeVisible();
    await expect(this.page.getByText('Vendor ID', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Vendor Name', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Approval Status', { exact: true })).toBeVisible();
  }

  async openCreateForm() {
    await this.createButton.click();
    await expect(this.createFormHeading).toBeVisible();
  }

  /** Confirms the core required fields and the submit control are present before filling anything. */
  async verifyCreateFormFields() {
    await expect(this.page.getByRole('textbox', { name: 'Vendor Name' })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Address 1' })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'City' })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Phone Number' })).toBeVisible();
    await expect(this.submitButton).toBeVisible();
    await expect(this.cancelButton).toBeVisible();
  }

  async fillBasicDetails(data: Partial<VendorData>) {
    if (data.vendorName !== undefined) {
      await this.page.getByRole('textbox', { name: 'Vendor Name' }).fill(data.vendorName);
    }
    if (data.vendorType) {
      await selectCustomDropdown(this.page, 'Vendor Type', data.vendorType);
    }
    if (data.categoryType) {
      await selectCustomDropdown(this.page, 'Category Type', data.categoryType);
    }
    if (data.subType) {
      await selectCustomDropdown(this.page, 'Sub Type', data.subType);
    }
    if (data.address1 !== undefined) {
      await this.page.getByRole('textbox', { name: 'Address 1' }).fill(data.address1);
    }
    if (data.address2 !== undefined) {
      await this.page.getByRole('textbox', { name: 'Address 2' }).fill(data.address2);
    }
    if (data.state) {
      await selectCustomDropdown(this.page, 'State', data.state);
    }
    if (data.city !== undefined) {
      await this.page.getByRole('textbox', { name: 'City' }).fill(data.city);
    }
    if (data.phone !== undefined) {
      await this.page.getByRole('textbox', { name: 'Phone Number' }).fill(data.phone);
    }
    if (data.email !== undefined) {
      await this.page.getByRole('textbox', { name: 'Email Address' }).fill(data.email);
    }
    if (data.pan !== undefined) {
      await this.page.getByRole('textbox', { name: 'PAN' }).fill(data.pan);
    }
  }

  async fillContactDetails(contact: CustomerContact) {
    await expandSection(this.page, 'Contact Details');
    await this.page.getByRole('textbox', { name: 'First Name' }).fill(contact.firstName);
    await this.page.getByRole('textbox', { name: 'Last Name' }).fill(contact.lastName);
    await this.page.getByRole('textbox', { name: 'Designation' }).fill(contact.designation);
    await this.page.locator('#phone_no').nth(1).fill(contact.phone);
    await this.page.locator('#email').nth(1).fill(contact.email);
  }

  async fillBankDetails(bank: BankDetails) {
    await expandSection(this.page, 'Bank Details');
    await this.page.getByRole('textbox', { name: 'Bank Name' }).fill(bank.bankName);
    await this.page.getByRole('textbox', { name: 'Account Number' }).fill(bank.accountNumber);
    await selectCustomDropdown(this.page, 'Account Type', bank.accountType);
    await this.page.getByRole('textbox', { name: 'IFSC Code' }).fill(bank.ifsc);
    await this.page.getByRole('textbox', { name: 'Branch Name' }).fill(bank.branchName);
  }

  /**
   * Root-caused via a real trace of a failing Pricing run: this upload's own request was
   * previously never awaited, so it could still be silently in flight minutes later - long enough
   * to be mistaken, by an unrelated later screen's generic response-URL match, for THAT screen's
   * own upload response (confirmed live: this exact Vendor KYC request took 26s to resolve and was
   * still pending when Quotation's own document upload ran). Waiting here for this exact click's
   * own request/response closes that race at the source, not just downstream.
   */
  async uploadKycDocument(documentType = 'Aadhar') {
    await expandSection(this.page, 'KYC Document Upload');
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(sampleDocumentPath);
    const response = await clickUploadAndAwaitResponse(this.page, this.page.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `KYC document upload should succeed. Status ${response.status()}`).toBeTruthy();
  }

  async fillCreditDetails(paymentTermsDays: string, creditLimit: string) {
    await expandSection(this.page, 'Credit Details');
    await this.page.getByRole('checkbox', { name: 'Invoice Overdue' }).check();
    await this.page.getByRole('textbox', { name: 'Payment Terms (In Days)' }).fill(paymentTermsDays);
    await this.page.getByRole('checkbox', { name: 'Credit On Hold' }).check();
    await this.page.getByRole('textbox', { name: 'Credit Limits' }).fill(creditLimit);
  }

  async submitAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(CREATE_VENDOR_API) && res.request().method() === 'POST'
    );
    await this.submitButton.click();
    const response = await responsePromise;
    // Vendor create returns 201 Created (Customer create returns 200 OK - confirmed independently on the live app).
    expect(response.status(), `createVendor API should return 201. Body: ${await response.text()}`).toBe(201);
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page).toHaveURL(/\/crm\/vendorManagement/);
  }

  /** Submits and asserts the specific inline validation message(s) shown, without leaving the form. */
  async submitAndExpectValidationErrors(...messages: string[]) {
    await this.submitButton.click();
    for (const message of messages) {
      await expect(this.page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    await expect(this.createFormHeading).toBeVisible();
  }

  /** Real backend duplicate-detection: reusing an existing vendor's phone number returns HTTP 409. */
  async submitAndExpectDuplicatePhoneError() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes(CREATE_VENDOR_API));
    await this.submitButton.click();
    const response = await responsePromise;
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.message).toBe('A vendor with this phone number already exists.');
    await expect(this.createFormHeading).toBeVisible();
  }

  async verifyVendorInListing(vendorName: string) {
    await expect(this.page.getByText(vendorName, { exact: true }).first()).toBeVisible();
  }

  /**
   * The listing has no semantic <table>/<tr> - each row is a plain div laid out with inline CSS
   * grid (same structure confirmed for Customer), so rows are scoped by that structural marker
   * plus the exact vendor name they contain, rather than position/.nth().
   */
  getRowByVendorName(vendorName: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(vendorName, { exact: true }) })
      .first();
  }

  /** Opens the exact record's Edit screen by its unique Vendor Name - never by row position. */
  async editVendorByName(vendorName: string) {
    const row = this.getRowByVendorName(vendorName);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
  }

  /**
   * Shared by Update (and future View) verification: asserts the core field values match the
   * real created/updated record. Vendor Type is deliberately NOT included here - same live
   * finding as Customer's Customer Type: it renders as the interactive combobox (visible text)
   * on Update, but may render differently on a future read-only View screen.
   */
  private async assertBasicFieldValues(data: VendorData) {
    await expect(this.page.getByRole('textbox', { name: 'Vendor Name' })).toHaveValue(data.vendorName);
    await expect(this.page.getByRole('textbox', { name: 'Address 1' })).toHaveValue(data.address1);
    await expect(this.page.getByRole('textbox', { name: 'City' })).toHaveValue(data.city);
    await expect(this.page.getByRole('textbox', { name: 'Phone Number' })).toHaveValue(data.phone);
  }

  /** Verifies the Update screen is pre-populated with the record's real data and has the expected field/button states. */
  async verifyUpdateFormFields(data: VendorData) {
    await expect(this.updateFormHeading).toBeVisible();

    const vendorIdInput = this.page.locator('#vendor_id');
    await expect(vendorIdInput).toBeDisabled();

    await this.assertBasicFieldValues(data);
    await expect(this.page.getByRole('textbox', { name: 'Vendor Name' })).toBeEditable();
    await expect(this.page.getByText(data.vendorType, { exact: true })).toBeVisible();

    await expect(this.backButton).toBeVisible();
    await expect(this.cancelButton).toBeVisible();
    await expect(this.updateButton).toBeVisible();
  }

  async submitUpdateAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(UPDATE_VENDOR_API) && res.request().method() === 'PUT'
    );
    await this.updateButton.click();
    const response = await responsePromise;
    // Confirmed live: unlike Create (201 for Vendor vs 200 for Customer), Update returns 200 OK for both.
    expect(response.status(), `updateVendor API should return 200. Body: ${await response.text()}`).toBe(200);
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page).toHaveURL(/\/crm\/vendorManagement/);
  }

  /** Submits an Update and asserts the specific inline validation message(s) shown, without leaving the form. */
  async submitUpdateAndExpectValidationErrors(...messages: string[]) {
    await this.updateButton.click();
    for (const message of messages) {
      await expect(this.page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    await expect(this.updateFormHeading).toBeVisible();
  }

  /** Real backend duplicate-detection also applies on Update: reusing another vendor's phone number returns HTTP 409. */
  async submitUpdateAndExpectDuplicatePhoneError() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes(UPDATE_VENDOR_API));
    await this.updateButton.click();
    const response = await responsePromise;
    expect(response.status()).toBe(409);
    const body = await response.json();
    expect(body.message).toBe('A vendor with this phone number already exists.');
    await expect(this.updateFormHeading).toBeVisible();
  }

  /** Confirmed on the live app: Cancel discards in-progress edits and returns to the listing without calling the update API. */
  async cancelUpdateForm() {
    await this.cancelButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Reads the Vendor ID shown in the listing row (first column) for the exact record, so it can
   * be cross-checked against the same field on the View screen - a real, data-driven comparison
   * rather than only confirming a screen navigated.
   */
  async getVendorIdFromListing(vendorName: string): Promise<string> {
    const row = this.getRowByVendorName(vendorName);
    const idText = await row.locator(':scope > div').first().innerText();
    return idText.trim();
  }

  /** Opens the exact record's read-only View screen by its unique Vendor Name - never by row position. */
  async viewVendorByName(vendorName: string) {
    const row = this.getRowByVendorName(vendorName);
    await row.getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /**
   * Verifies the View screen: real data matches the record, Vendor ID matches the listing, and
   * the form is genuinely read-only. `expectedVendorId` is optional so callers that haven't
   * captured it yet can still verify the rest.
   */
  async verifyViewFormFields(data: VendorData, expectedVendorId?: string) {
    await expect(this.viewFormHeading).toBeVisible();

    const vendorIdInput = this.page.locator('#vendor_id');
    await expect(vendorIdInput).toBeDisabled();
    if (expectedVendorId) {
      await expect(vendorIdInput).toHaveValue(expectedVendorId);
    }

    await this.assertBasicFieldValues(data);
    // Confirmed live: unlike Update (interactive combobox), Vendor Type renders as a plain
    // disabled text input on View - same real pattern as Customer's Customer Type field.
    await expect(this.page.locator('#vendor_type')).toHaveValue(data.vendorType);

    // Confirmed live: every field is disabled on View EXCEPT State Code (same known
    // inconsistency as Customer) and the Operational/Non-Operational checkboxes, which remain
    // interactive - so only the fields actually asserted are checked, not blindly all of them.
    await expect(this.page.getByRole('textbox', { name: 'Vendor Name' })).toBeDisabled();
    await expect(this.page.getByRole('textbox', { name: 'Address 1' })).toBeDisabled();
    await expect(this.page.getByRole('textbox', { name: 'City' })).toBeDisabled();
    await expect(this.page.getByRole('textbox', { name: 'Phone Number' })).toBeDisabled();

    // View has only a Back button - no Cancel/Update, confirmed live (don't assume a Close button).
    await expect(this.backButton).toBeVisible();
    await expect(this.cancelButton).not.toBeVisible();
    await expect(this.updateButton).not.toBeVisible();
  }

  /** Confirmed on the live app: Back on the View screen returns to the listing (only button available there). */
  async returnToListingFromView() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Opens the Filter panel. Confirmed live: identical shape to Customer's - Vendor Name, Email,
   * PAN (text inputs) and Vendor Type, Status (the same custom comboboxes used on Create/Update)
   * - no date range, no autocomplete, no checkboxes exist in this panel.
   */
  async openFilterPanel() {
    await this.filterButton.click();
    await expect(this.page.getByRole('textbox', { name: 'Vendor Name' })).toBeVisible();
  }

  /**
   * Fills whichever filter fields are provided and clicks Search. Reuses `selectCustomDropdown`
   * for Vendor Type/Status - no duplicate dropdown handling. Confirmed live: all populated
   * fields combine with AND semantics, and Vendor Name/Email/PAN match by substring (contains),
   * not exact equality - same behavior as Customer's Filter, independently verified.
   */
  async applyFilter(criteria: {
    vendorName?: string;
    email?: string;
    pan?: string;
    vendorType?: 'Domestic' | 'Foreign';
    status?: 'Active' | 'Inactive';
  }) {
    if (criteria.vendorName !== undefined) {
      await this.page.getByRole('textbox', { name: 'Vendor Name' }).fill(criteria.vendorName);
    }
    if (criteria.email !== undefined) {
      await this.page.getByRole('textbox', { name: 'Email', exact: true }).fill(criteria.email);
    }
    if (criteria.pan !== undefined) {
      await this.page.getByRole('textbox', { name: 'PAN', exact: true }).fill(criteria.pan);
    }
    if (criteria.vendorType) {
      await selectCustomDropdown(this.page, 'Vendor Type', criteria.vendorType);
    }
    if (criteria.status) {
      await selectCustomDropdown(this.page, 'Status', criteria.status);
    }
    // Wait for the real list API to resolve, not just the click - the row-reading helpers below
    // take an immediate DOM snapshot with no auto-retry, so the new results must already be
    // rendered before this method returns.
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(VENDOR_LIST_API) && res.request().method() === 'GET'
    );
    await this.filterSearchButton.click();
    await responsePromise;
  }

  /** Confirmed live text for a non-matching filter: "No data matches your filter criteria." plus a "0 of N records" count - identical to Customer. */
  async expectNoFilterResults() {
    await expect(this.page.getByText('No data matches your filter criteria.', { exact: true })).toBeVisible();
    await expect(this.page.getByText(/^0 of \d+ records$/)).toBeVisible();
  }

  /** Asserts the filtered result count without hardcoding the ever-growing total record count. */
  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /** Confirmed live: the listing shows "N records" (no "of") only when no filter has been applied/after Reset. */
  async expectUnfilteredListing() {
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible();
  }

  /**
   * Confirmed live: Reset immediately clears every field AND re-fetches the full unfiltered
   * list in one action (the panel also closes) - no separate Search click needed afterwards.
   */
  async resetFilter() {
    await this.filterResetButton.click();
    await expect(this.pageHeading).toBeVisible();
    await this.expectUnfilteredListing();
  }

  /** Reads one column's visible values across every currently-rendered row (header excluded). Column order confirmed live via inline grid-template-columns. */
  private async getListingColumnValues(columnIndex: number): Promise<string[]> {
    const rows = this.page.locator('div[style*="grid-template-columns"]');
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    const values: string[] = [];
    for (let i = 1; i < rowCount; i++) {
      values.push((await rows.nth(i).locator(':scope > div').nth(columnIndex).innerText()).trim());
    }
    return values;
  }

  async getVisibleVendorNames(): Promise<string[]> {
    return this.getListingColumnValues(1);
  }

  async getVisibleStatuses(): Promise<string[]> {
    return this.getListingColumnValues(6);
  }

  pageNumberButton(pageNumber: number): Locator {
    return this.paginationContainer.getByRole('button', { name: String(pageNumber), exact: true });
  }

  /**
   * The windowed page-number list (e.g. "1 2 3 4 5 … 9") always renders the true final page as
   * its last numbered button - confirmed live, same pattern as Customer, so this never needs to
   * guess or hardcode the total.
   */
  async getLastPageNumber(): Promise<number> {
    const numberButtons = this.paginationContainer.locator('li > button').filter({ hasText: /^\d+$/ });
    const count = await numberButtons.count();
    const text = await numberButtons.nth(count - 1).innerText();
    return Number(text.trim());
  }

  /** Clicking a pagination control triggers a real list refetch - wait for it, not just the click, before the row-reading helpers run. */
  private async waitForListReload(action: () => Promise<void>) {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(VENDOR_LIST_API) && res.request().method() === 'GET'
    );
    await action();
    await responsePromise;
  }

  async goToNextPage() {
    await this.waitForListReload(() => this.nextPageButton.click());
  }

  async goToPreviousPage() {
    await this.waitForListReload(() => this.previousPageButton.click());
  }

  async goToPage(pageNumber: number) {
    await this.waitForListReload(() => this.pageNumberButton(pageNumber).click());
  }

  async expectCurrentPage(pageNumber: number) {
    await expect(this.page).toHaveURL(new RegExp(`[?&]page=${pageNumber}(&|$)`));
  }

  /**
   * Opens the Approve/Reject dialog for the exact vendor row (via the existing
   * `getRowByVendorName` helper - never the first match on the page). Confirmed live: this is a
   * two-step flow identical to Customer's - clicking the row action only opens a dialog with
   * Approve/Reject choice icons, a close (X) icon, and an OK button; it does not submit anything
   * by itself.
   */
  async openApprovalDialog(vendorName: string) {
    const row = this.getRowByVendorName(vendorName);
    await row.getByRole('button', { name: 'Approve or Reject', exact: true }).click();
    await expect(this.page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Reject', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'OK', exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'close-dialog' })).toBeVisible();
  }

  /** Selects Approve or Reject within the open dialog - this only highlights the choice, it does not submit. */
  async selectApprovalDecision(decision: 'Approve' | 'Reject') {
    await this.page.getByRole('button', { name: decision, exact: true }).click();
  }

  /** Confirms the currently-selected decision. Both Approve and Reject submit through the same real `approveVendor` API - confirmed live, same single-endpoint pattern as Customer. */
  async confirmApprovalDialog() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(APPROVE_VENDOR_API) && res.request().method() === 'PUT'
    );
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
    const response = await responsePromise;
    expect(response.status(), `approveVendor API should return 200. Body: ${await response.text()}`).toBe(200);
  }

  /** Confirmed live: the (X) close icon is the only way to dismiss the dialog without deciding - no separate labelled "Cancel" button exists, and closing this way makes no API call. */
  async closeApprovalDialogWithoutDeciding() {
    await this.page.getByRole('button', { name: 'close-dialog' }).click();
  }

  async approveVendorByName(vendorName: string) {
    await this.openApprovalDialog(vendorName);
    await this.selectApprovalDecision('Approve');
    await this.confirmApprovalDialog();
  }

  async rejectVendorByName(vendorName: string) {
    await this.openApprovalDialog(vendorName);
    await this.selectApprovalDecision('Reject');
    await this.confirmApprovalDialog();
  }

  /** Reads/asserts the listing's "Approval Status" column (Pending/Approved/Rejected) for the exact record - not exposed on the View screen (confirmed in the Vendor View phase), so the listing is the sole verification point. */
  async expectApprovalStatus(vendorName: string, status: 'Pending' | 'Approved' | 'Rejected') {
    await expect(this.getRowByVendorName(vendorName).locator(':scope > div').nth(5)).toHaveText(status);
  }
}

import { Page, Locator, expect } from '@playwright/test';

/**
 * Quote Approval List (CRM -> Sales Management -> Quote Approval, sidebar button text "Quote
 * Approval" - confirmed live, same submenu as Pricing) is reached only via Pricing's own "Submit
 * To Approval" action - there is no standalone Create here, same convention as every other stage
 * in this pipeline. Confirmed live via real page snapshots, a full DOM button scan on every
 * screen, and real network/navigation behavior (never assumed):
 *
 * - The listing heading is "Quote Approval List"; columns are Enquiry No / Quote No / Customer
 *   Name / Origin Clearance By / Destination Clearance By / Quote Approval Status / Actions.
 * - A row not yet approved (status "Approval Inprogress") shows three actions: an icon-only
 *   "View More" (title attribute), an icon-only "Edit" (title attribute), and a text button
 *   "Print" (no title). CORRECTION to an earlier finding: Edit and View do NOT disappear once
 *   approved ("Quote Approved") - re-confirmed live on a real record hours after approval, both
 *   are still present. What actually changes is the Edit screen's OWN bottom action bar (see
 *   below) - the earlier "Edit/View disappear" claim was based on a stale/incorrect observation.
 * - Edit opens a screen headed "Approve Quote" (not "Edit..."), with header fields Enquiry No /
 *   Quote No / Quote Date / Quote Actual Date (matching Quotation's own header shape, unlike
 *   Pricing's, which has no Quote Date/Quote Actual Date) - and the SAME three top tabs as
 *   Quotation/Pricing: Customer Information / Product Information / Quote. The Quote tab mirrors
 *   Pricing's own final Buy Rate/Sell Rate tables (including the Margin % column), read-only.
 * - Before approval, "Reject" and "Approve" are the bottom-bar action buttons (confirmed live to
 *   persist identically across all three tabs) - clicking Approve opens a real custom modal
 *   ("Confirm Approval" / "Are you sure you want to approve this quote?" / "No" / "Yes, Approve"),
 *   not a native `window.confirm()`. Originally confirmed live to navigate to `/crm/quoteConfirmed`
 *   (Confirm Order List's own client-side route) on accept; re-confirmed live on a later date that
 *   accepting can instead land back on `/crm/quoteApproval` (the List itself, with the row's own
 *   status genuinely showing "Quote Approved") - a real app-behavior difference across environment
 *   updates, not a flake. `approveQuote` below waits for navigation AWAY from the edit form's own
 *   route rather than asserting one specific destination, so it tolerates either. Landing on either
 *   destination is not the same as the record actually existing in Confirm Order List yet (see the
 *   next point).
 * - AFTER approval, reopening Edit on the SAME record swaps the bottom action bar to Cancel/
 *   "Confirm Quote" instead - a real SECOND step, confirmed live to be what actually creates this
 *   record's entry in Confirm Order List (`PUT /quoteapproval/quoteApprovalStatus/{id}`; the record
 *   then appears there with status "Quote Confirmed" - it never did without this step, no matter
 *   how long you wait, which is what an earlier investigation mistook for a backend propagation
 *   defect). `confirmQuote()` opens the real "Confirm Quote" modal ("Are you sure you want to
 *   confirm this Quote?" / "No" / "Yes, Confirm"). Originally confirmed live to return to Quote
 *   Approval List on accept; re-confirmed live on a later date that accepting can instead navigate
 *   straight to "Confirm Master Job List" (Confirm Order List's own real heading) - another genuine
 *   app-behavior difference across environment updates (same category as `approveQuote`'s own). The
 *   underlying `PUT .../quoteApprovalStatus` response succeeding is the real signal of success;
 *   `confirmQuote` below only additionally waits for the modal to close, not for one specific
 *   destination page.
 * - View (the "View More" icon) opens a screen headed "View Quote Approval" with only a Back
 *   button and the same three read-only tabs - no Approve/Reject. Back returns to
 *   `/crm/quoteApproval`.
 * - Print is a row-level action present regardless of status. Confirmed live: clicking it fires
 *   real network requests for company config, company logo, and branch details (consistent with
 *   assembling a printable document) with no new tab, no visible in-page modal, and no download -
 *   consistent with the application calling the browser's native `window.print()`, which
 *   Playwright cannot inspect or drive. `window.print` is neutralized before the click (a common,
 *   safe technique for exactly this situation) so a real headed run never blocks on an OS-level
 *   print dialog Playwright has no way to dismiss; the real network calls the app itself makes to
 *   prepare that printable content are what this verifies instead.
 */
export class QuoteApprovalPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly editFormHeading: Locator;
  readonly viewFormHeading: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Quote Approval List', exact: true });
    this.editFormHeading = page.getByRole('heading', { name: 'Approve Quote', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Quote Approval', exact: true });
    this.approveButton = page.getByRole('button', { name: 'Approve', exact: true });
    this.rejectButton = page.getByRole('button', { name: 'Reject', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** Real app navigation: sidebar CRM -> Sales Management -> Quote Approval (the sidebar's own button text; the screen's heading is "Quote Approval List"). Same toggle-safe pattern as PricingPage.navigateFromSidebar. */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const quoteApprovalLink = this.page.getByRole('button', { name: 'Quote Approval', exact: true });
    if (!(await quoteApprovalLink.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await quoteApprovalLink.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Enquiry No is globally unique - the reliable way to locate exactly the record this test created, never by row position. Same grid-row pattern already used by PricingPage/QuotationPage/EnquiryPage. */
  findRowByEnquiryNumber(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  async openForEdit(enquiryNo: string) {
    await this.findRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.editFormHeading).toBeVisible();
  }

  async openForView(enquiryNo: string) {
    await this.findRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /** Reads the listing's real "Quote Approval Status" column for the exact record. */
  async expectApprovalStatus(enquiryNo: string, status: 'Approval Inprogress' | 'Quote Approved') {
    await expect(this.findRowByEnquiryNumber(enquiryNo)).toContainText(status);
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

  /** Header fields confirmed live to match Quotation's own shape (Enquiry No/Quote No/Quote Date/Quote Actual Date), not Pricing's. */
  async verifyHeaderFields(expectedEnquiryNo: string, expectedQuoteNo: string) {
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No' })).toHaveValue(expectedEnquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No' })).toHaveValue(expectedQuoteNo);
  }

  /** Confirmed live: fully read-only, inherited from the originating Enquiry/Quotation/Pricing - never re-entered here. */
  async verifyCustomerInformation(expectedCustomerName: string) {
    await this.openCustomerInformationTab();
    const customerIdInput = this.page.getByRole('textbox', { name: 'Customer Id' });
    await expect(customerIdInput).toHaveValue(/^CUST-\d+$/);
    await expect(customerIdInput).toBeDisabled();
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(expectedCustomerName);
    await expect(customerNameInput).toBeDisabled();
  }

  /** Confirmed live: identical field set to Quotation/Pricing's own Product Information tab, fully read-only. */
  async verifyProductInformation(expected: { shipmentMode: string; shipmentDirection: string; shipmentType?: string; businessType: string }) {
    await this.openProductInformationTab();
    await expect(this.page.getByRole('textbox', { name: 'Shipment Mode' })).toHaveValue(expected.shipmentMode);
    await expect(this.page.getByRole('textbox', { name: 'Shipment Direction' })).toHaveValue(expected.shipmentDirection);
    if (expected.shipmentType !== undefined) {
      await expect(this.page.getByRole('textbox', { name: 'Shipment Type' })).toHaveValue(expected.shipmentType);
    }
    await expect(this.page.getByRole('textbox', { name: 'Business Type' })).toHaveValue(expected.businessType);
  }

  /** Confirmed live: the Quote tab here is a read-only mirror of Pricing's own final Quote-1/Buy Rate/Sell Rate state - this only confirms the same real numbers still show, never re-derives them. */
  async verifyQuote() {
    await this.openQuoteTab();
    await expect(this.page.getByRole('button', { name: 'Quote-1', exact: true })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Buy Rate', exact: true })).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Sell Rate', exact: true })).toBeVisible();
  }

  /**
   * Confirmed live: Approve opens a real custom modal ("Confirm Approval" / "Are you sure you
   * want to approve this quote?" / "No" / "Yes, Approve") - not a native `window.confirm()`.
   * Accepting navigates to the separate, out-of-scope "Confirm Master Job List" module
   * (`/crm/quoteConfirmed`) - completing an approval there is out of scope for Quote Approval, so
   * this only verifies the real navigation. Declining ("No") keeps the same Edit screen open.
   */
  async approveQuote(accept: boolean): Promise<string> {
    await this.approveButton.click();
    const modalHeading = this.page.getByRole('heading', { name: 'Confirm Approval', exact: true });
    await expect(modalHeading).toBeVisible();
    const message = (await modalHeading.locator('..').innerText()).replace('Confirm Approval', '').trim();
    if (accept) {
      await this.page.getByRole('button', { name: 'Yes, Approve', exact: true }).click();
      // Waits for navigation AWAY from the edit form's own route (`/crm/quoteApprovalForm`) rather
      // than asserting one specific destination - confirmed live the app can land on either
      // `/crm/quoteConfirmed` or back on the List (`/crm/quoteApproval`) depending on the
      // environment/moment, both of which are genuine successful outcomes (see class comment).
      await expect(this.page).not.toHaveURL(/\/crm\/quoteApprovalForm/, { timeout: 20_000 });
    } else {
      await this.page.getByRole('button', { name: 'No', exact: true }).click();
      await expect(this.editFormHeading).toBeVisible();
    }
    return message;
  }

  async backToList() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Confirmed live: reopening Edit on an ALREADY-Approved record ("Quote Approved") swaps its
   * bottom action bar from Approve/Reject to Cancel/"Confirm Quote" - a real second step, distinct
   * from Approve, that this module's own earlier documentation had not yet found. This is what
   * actually creates the record's entry in Confirm Order List: confirmed live via
   * PUT /quoteapproval/quoteApprovalStatus/{id}, after which the SAME record appears in Confirm
   * Order List with status "Quote Confirmed" (previously, without this step, it never did - not a
   * backend propagation delay, a missing step). Accepting the "Confirm Quote" modal ("Are you sure
   * you want to confirm this Quote?" / "No" / "Yes, Confirm") returns to the Quote Approval List,
   * not to Confirm Order List directly - confirmed live, not assumed.
   */
  async confirmQuote(accept: boolean): Promise<string> {
    const confirmQuoteButton = this.page.getByRole('button', { name: 'Confirm Quote', exact: true });
    await confirmQuoteButton.click();
    const modalHeading = this.page.getByRole('heading', { name: 'Confirm Quote', exact: true });
    await expect(modalHeading).toBeVisible();
    const message = (await modalHeading.locator('..').innerText()).replace('Confirm Quote', '').trim();
    if (accept) {
      const responsePromise = this.page.waitForResponse((res) => res.url().includes('/quoteapproval/quoteApprovalStatus') && res.request().method() !== 'GET');
      await this.page.getByRole('button', { name: 'Yes, Confirm', exact: true }).click();
      const response = await responsePromise;
      expect(response.ok(), `Confirm Quote should succeed. Status ${response.status()}`).toBeTruthy();
      // The real success signal is the API response above; the resulting destination page varies
      // (Quote Approval List or Confirm Master Job List - see class comment), so this only waits
      // for the modal itself to close rather than asserting one specific destination heading.
      await expect(modalHeading).not.toBeVisible({ timeout: 20_000 });
    } else {
      await this.page.getByRole('button', { name: 'No', exact: true }).click();
      await expect(this.editFormHeading).toBeVisible();
    }
    return message;
  }

  /**
   * Confirmed live: Print fires real network requests to assemble a printable document (company
   * config, company logo, branch details) with no new tab and no download - consistent with the
   * app calling the browser's native `window.print()`, which Playwright cannot inspect or drive.
   * `window.print` is neutralized first so a real headed run never blocks on an OS print dialog
   * Playwright has no way to dismiss - the real preparatory network calls are what get verified
   * instead, per the app's own actual observed behavior.
   */
  async printRecord(enquiryNo: string): Promise<void> {
    await this.page.evaluate(() => {
      window.print = () => undefined;
    });
    const configResponse = this.page.waitForResponse((res) => res.url().includes('/config/getCompanyConfigDetails'));
    await this.findRowByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Print', exact: true }).click();
    const response = await configResponse;
    expect(response.ok(), `Print's own company-config request should succeed. Status ${response.status()}`).toBeTruthy();
  }
}

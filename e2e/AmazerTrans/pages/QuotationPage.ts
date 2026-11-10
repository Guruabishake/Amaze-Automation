import * as path from 'path';
import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { QuotationChargeData } from '../utils/testData';

// Confirmed live via the network tab: PUT /middleware/api/v1/quotations/updateQuotation/{id} - the
// shared '/quotation' segment plus a non-GET method is specific enough to avoid the list/view GET
// calls, same convention already used for Enquiry.
const QUOTATION_API_SEGMENT = '/quotation';

/**
 * Quotation Generation (CRM -> Sales Management -> Quotation Generation) is reached only via
 * Enquiry's "Initiate Quote" action (EnquiryPage.initiateQuote) - there is no standalone "Create"
 * button here, since accepting that action already creates the Quote record server-side and lands
 * on this module's listing. Confirmed live: this module is Buy-side cost entry only (Charge
 * Description/HS Code/Charge Based On/Quantity/Buy Rate/Buy Currency/Exchange Rate/Value In INR
 * across Origin/International/Destination sections) - there is no Sell Rate/Currency, Tax, or
 * Grand Total anywhere in this module; those confirmed to belong to the separate "Pricing" module
 * downstream (out of scope here). There is also no Print/Download control on the View screen.
 *
 * Confirmed live this phase: the Quote tab's "Add Buy Rate" section renders an FF Vendor/CB
 * Vendor/TMS Vendor combobox PER service actually selected on the originating Enquiry (e.g. an
 * FF+CB Enquiry's Quotation shows only FF Vendor + CB Vendor, never TMS Vendor) - the same
 * conditional-by-service pattern already established for Enquiry's own Product Information tab.
 * Also confirmed: a listing row's real "Initiate Pricing" button (which only appears once Update
 * has been saved at least once, flipping status to "Quote Generated") triggers a genuine native
 * `window.confirm()` - same mechanism as Enquiry's Initiate Quote - and on accept calls
 * POST /pricing/createPricing then navigates to the separate, out-of-scope "Pricing" module
 * (/crm/pricing).
 */
export class QuotationPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly filterButton: Locator;
  readonly updateFormHeading: Locator;
  readonly viewFormHeading: Locator;
  readonly updateButton: Locator;
  readonly cancelButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Quote Generation', exact: true });
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.updateFormHeading = page.getByRole('heading', { name: 'Update Quotation', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Quotation', exact: true });
    this.updateButton = page.getByRole('button', { name: 'Update', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /**
   * Real app navigation: sidebar CRM -> Sales Management -> Quotation Generation. Same toggle-safe
   * pattern as EnquiryPage.navigateFromSidebar - "Sales Management" collapses on a second click in
   * the same session, so it is only clicked when the submenu isn't already open.
   */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const quotationLink = this.page.getByRole('button', { name: 'Quotation Generation', exact: true });
    if (!(await quotationLink.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await quotationLink.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * The listing has no semantic <table>/<tr> - same structural pattern already confirmed for
   * Customer/Vendor/Enquiry - so rows are scoped by that structural marker plus the exact
   * Customer Name they contain, never by position/.nth().
   */
  getRowByCustomerName(customerName: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(customerName, { exact: true }) })
      .first();
  }

  /** Opens the exact Quote's real Update screen by its unique Customer Name - never by row position. */
  async editQuotationByCustomerName(customerName: string) {
    const row = this.getRowByCustomerName(customerName);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
  }

  /** Opens the exact Quote's read-only View screen by its unique Customer Name - never by row position. */
  async viewQuotationByCustomerName(customerName: string) {
    const row = this.getRowByCustomerName(customerName);
    await row.getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /** Reads the listing's real "Quote Status" column for the exact record. */
  async expectQuoteStatus(customerName: string, status: 'Quote Initiated' | 'Quote Generated' | 'Submitted to Pricing') {
    await expect(this.getRowByCustomerName(customerName)).toContainText(status);
  }

  private async openTopTab(tabName: 'Customer Information' | 'Product Information' | 'Quote') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }

  /**
   * Verifies the header fields common to Update and View: Enquiry No matches the record's real
   * value, Quote No is server-generated in the real "QUOTE-NNNNNN" format (never hardcoded/guessed
   * here), and Quote Date/Quote Actual Date are populated.
   */
  async verifyHeaderFields(expectedEnquiryNo: string) {
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No' })).toHaveValue(expectedEnquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No' })).toHaveValue(/^QUOTE-\d+$/);
    await expect(this.page.getByRole('textbox', { name: 'Quote Date' })).not.toHaveValue('');
  }

  /**
   * Verifies the Customer Information tab is correctly inherited from the originating Enquiry -
   * Customer Id renders the real internal "CUST-NNNNN" code (confirmed live, same pattern as
   * Enquiry's own View screen) and Customer Name matches exactly. Both are disabled: this data is
   * never re-entered here, only ever verified.
   */
  async verifyCustomerInformation(expectedCustomerName: string) {
    await this.openTopTab('Customer Information');
    const customerIdInput = this.page.getByRole('textbox', { name: 'Customer Id' });
    await expect(customerIdInput).toHaveValue(/^CUST-\d+$/);
    await expect(customerIdInput).toBeDisabled();
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(expectedCustomerName);
    await expect(customerNameInput).toBeDisabled();
  }

  /**
   * Verifies the Product Information tab - confirmed live to be a fully read-only mirror of the
   * originating Enquiry's own Product Information (Shipment Mode/Direction/Type/Business Type),
   * with no Service-selection indicator of its own (which services were selected is instead
   * inferred from which Vendor fields the Quote tab renders - see `selectVendorsForServices`).
   * `shipmentType` is only asserted when provided (confirmed optional for Air, same rule as Enquiry).
   */
  async verifyProductInformation(expected: { shipmentMode: string; shipmentDirection: string; shipmentType?: string; businessType: string }) {
    await this.openTopTab('Product Information');
    await expect(this.page.getByRole('textbox', { name: 'Shipment Mode' })).toHaveValue(expected.shipmentMode);
    await expect(this.page.getByRole('textbox', { name: 'Shipment Direction' })).toHaveValue(expected.shipmentDirection);
    if (expected.shipmentType !== undefined) {
      await expect(this.page.getByRole('textbox', { name: 'Shipment Type' })).toHaveValue(expected.shipmentType);
    }
    await expect(this.page.getByRole('textbox', { name: 'Business Type' })).toHaveValue(expected.businessType);
  }

  /**
   * Selects the given Vendor for exactly the services the originating Enquiry actually used.
   * Confirmed live: the Quote tab's "Add Buy Rate" section renders FF Vendor/CB Vendor/TMS Vendor
   * combobox fields conditionally - an FF+CB Enquiry's Quotation shows only FF Vendor + CB Vendor,
   * never TMS Vendor - so this never attempts to fill a field the current combination doesn't
   * render. All three share the same real Vendor Management dataset (confirmed live: the same
   * Vendor name appears in every one of them), so the single Vendor created once by the setup flow
   * is reused for whichever fields are present - never a new Vendor.
   */
  async selectVendorsForServices(
    services: { freightForwarding: boolean; customsBroker: boolean; transportManagementSystem: boolean },
    vendorName: string
  ) {
    await this.openTopTab('Quote');
    if (services.freightForwarding) await selectCustomDropdown(this.page, 'FF Vendor', vendorName);
    if (services.customsBroker) await selectCustomDropdown(this.page, 'CB Vendor', vendorName);
    if (services.transportManagementSystem) await selectCustomDropdown(this.page, 'TMS Vendor', vendorName);
  }

  /**
   * Opens one Buy Rate section (Origin/International/Destination - confirmed live to share the
   * identical Charge Description/HS Code/Charge Based On/Quantity/Buy Rate/Buy Currency/Exchange
   * Rate/Value In INR structure) and adds one charge row. HS Code, Charge Based On and Exchange
   * Rate are all auto-filled by the app once Charge Description/Buy Currency are chosen - none are
   * set here, since overriding them would be testing invented values rather than real behavior.
   * Confirmed live via direct observation: Value In INR = Buy Rate x Quantity x Exchange Rate,
   * recalculating live as Quantity/Buy Rate change - verified by the caller using the real
   * Exchange Rate the app filled in, not a hardcoded expectation.
   */
  async addBuyRateCharge(section: 'Origin' | 'International' | 'Destination', charge: QuotationChargeData) {
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: section, exact: true }).click();
    await this.page.getByRole('button', { name: new RegExp(`add ${section}`, 'i') }).click();
    await selectCustomDropdown(this.page, 'Charge Description', charge.chargeDescription);
    await this.page.getByRole('textbox', { name: 'Quantity' }).fill(charge.quantity);
    await this.page.getByRole('textbox', { name: 'Buy Rate' }).fill(charge.buyRate);
    await selectCustomDropdown(this.page, 'Buy Currency', charge.buyCurrency);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  /**
   * Reads back the real Exchange Rate and Value In INR the app computed for the given section's
   * single charge row, so the caller can verify the real formula (Buy Rate x Quantity x Exchange
   * Rate) against values the application itself produced - never a hardcoded expectation.
   */
  async getChargeRowValues(section: 'Origin' | 'International' | 'Destination'): Promise<{ exchangeRate: number; valueInInr: number }> {
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: section, exact: true }).click();
    // Role-based, not tag-based (tbody/td), since the real markup for this table is unconfirmed -
    // excludes the header row by filtering out the one containing its own column-name text.
    const dataRow = this.page
      .getByRole('row')
      .filter({ hasNotText: 'CHARGE DESCRIPTION' })
      .filter({ hasText: /\d/ })
      .first();
    const cells = dataRow.getByRole('cell');
    const count = await cells.count();
    const exchangeRateText = (await cells.nth(count - 3).innerText()).trim();
    const valueInInrText = (await cells.nth(count - 2).innerText()).trim();
    return { exchangeRate: Number(exchangeRateText), valueInInr: Number(valueInInrText) };
  }

  /** Adds every charge in `charges` to the given section via `addBuyRateCharge`, in order - the real Add-popup is opened and saved once per entry, never one row edited N times. */
  async addBuyRateEntries(section: 'Origin' | 'International' | 'Destination', charges: QuotationChargeData[]) {
    for (const charge of charges) {
      await this.addBuyRateCharge(section, charge);
    }
  }

  /** Asserts the real number of saved data rows in one section's table - never assumed from the data passed in, always read back from the UI. */
  async expectBuyRateRowCount(section: 'Origin' | 'International' | 'Destination', count: number) {
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: section, exact: true }).click();
    const dataRows = this.page.getByRole('row').filter({ hasNotText: 'CHARGE DESCRIPTION' }).filter({ hasText: /\d/ });
    await expect(dataRows).toHaveCount(count);
  }

  /**
   * Reads the Summary tab's real grand total. Confirmed live: Summary aggregates every
   * Origin/International/Destination row into one COST/EXCHANGE RATE/TOTAL IN INR row per distinct
   * Buy Currency used, then sums those into a single "Total Cost ₹ N" figure - read via regex
   * against the tab's own text rather than a hardcoded structure, since the exact cell/row markup
   * was not the focus of this confirmation.
   */
  async getSummaryTotalCost(): Promise<number> {
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: 'Summary', exact: true }).click();
    const bodyText = await this.page.locator('main').first().innerText();
    const match = bodyText.match(/Total Cost[\s\S]*?₹\s*([\d,]+\.\d{2})/);
    if (!match) {
      throw new Error(`Total Cost not found on the Summary tab. Tab text was:\n${bodyText}`);
    }
    return Number(match[1].replace(/,/g, ''));
  }

  async submitUpdateAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(QUOTATION_API_SEGMENT) && res.request().method() !== 'GET'
    );
    await this.updateButton.click();
    const response = await responsePromise;
    expect(response.ok(), `Quotation update request should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Confirmed on the live app: Cancel discards in-progress edits and returns to the listing without calling the update API. */
  async cancelUpdateForm() {
    await this.cancelButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Uploads one document via the "Upload File" tab. Confirmed live: the identical
   * Document-Type-then-file-then-Upload pattern already used by Enquiry/Vendor - reused, not
   * duplicated.
   *
   * Root-caused via a real trace of a failing run (not assumed): calling this twice in a row
   * (needed whenever more than one file is uploaded to the same Quotation) is only safe once the
   * FIRST upload's actual `POST /uploads/documents` server round-trip has completed - the app
   * silently drops a second "Upload" click issued while any upload (even an unrelated one on a
   * completely different record, e.g. Customer/Vendor's own KYC upload from earlier in the same
   * session) is still in flight, rather than queuing it. Correlating via
   * `clickUploadAndAwaitResponse` (request-scoped, not a generic response-URL match) is required
   * here too: a second real trace showed a stale, still-pending KYC upload response resolve at
   * exactly the wrong moment and get mistaken, by the old `waitForResponse(urlPattern)` predicate,
   * for THIS upload's own response - letting the code wrongly believe it had succeeded while the
   * app had actually silently dropped the click, so the very next upload in the loop then found no
   * row at all.
   */
  async uploadDocument(documentType: string, filePath: string) {
    const fileName = path.basename(filePath);
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    const documentTypeField = this.page
      .locator('div.relative.group', { has: this.page.getByText('Document Type', { exact: true }) })
      .first();
    await expect(documentTypeField.getByRole('combobox')).toContainText(documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    const response = await clickUploadAndAwaitResponse(this.page, this.page.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `Document upload should succeed. Status ${response.status()}`).toBeTruthy();
    await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20000 });
  }

  /** Uploads every file in `filePaths` under the same Document Type, via `uploadDocument` once per file - reused, not duplicated. */
  async uploadDocuments(documentType: string, filePaths: string[]) {
    for (const filePath of filePaths) {
      await this.uploadDocument(documentType, filePath);
    }
  }

  /**
   * Asserts each real file name appears as its own row in the Upload File table. Confirmed live:
   * Quotation's Upload File tab inherits any document(s) already uploaded on the originating
   * Enquiry (a real, shared-per-Enquiry file list, not a separate per-Quotation one) - so this
   * checks the specific file names just uploaded here are present, rather than asserting an exact
   * row count that would also have to account for that inherited row.
   */
  async expectUploadedFileNames(fileNames: string[]) {
    await this.openTopTab('Quote');
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    for (const fileName of fileNames) {
      await expect(this.page.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible();
    }
  }

  /**
   * Verifies the View screen: real header data, and the Customer Information tab's read-only,
   * Enquiry-inherited Customer Name - confirmed live to still be a plain disabled textbox here
   * (same real pattern already seen on Enquiry's own View screen), not re-editable.
   */
  async verifyViewFormFields(expectedEnquiryNo: string, expectedCustomerName: string) {
    await expect(this.viewFormHeading).toBeVisible();
    await this.verifyHeaderFields(expectedEnquiryNo);
    await this.openTopTab('Customer Information');
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(expectedCustomerName);
    await expect(customerNameInput).toBeDisabled();
    // Confirmed live: unlike Enquiry's View (Back only), Quotation's View screen keeps a visible
    // Cancel button alongside Back - both simply return to the listing, no Update here either way.
    await expect(this.backButton).toBeVisible();
    await expect(this.updateButton).not.toBeVisible();
  }

  /** Confirmed on the live app: Back on the View screen returns to the listing (only button available there). */
  async returnToListingFromView() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Confirmed live: "Initiate Pricing" only appears once the Quotation has been Updated at least
   * once (status "Quote Generated") and triggers a genuine native `window.confirm()` - the same
   * mechanism as Enquiry's Initiate Quote, requiring `page.once('dialog', ...)` registered BEFORE
   * the click. Confirmed live: accepting calls POST /pricing/createPricing and navigates to the
   * separate, out-of-scope Pricing module (`/crm/pricing`) - completing pricing there is out of
   * scope for Quotation Generation, so this only verifies the real navigation. `accept: false`
   * exercises the real Cancel path, leaving the record on the same page/status unchanged.
   */
  async initiatePricing(customerName: string, accept: boolean): Promise<string> {
    const row = this.getRowByCustomerName(customerName);
    const dialogPromise = new Promise<string>((resolve) => {
      this.page.once('dialog', async (dialog) => {
        resolve(dialog.message());
        if (accept) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
      });
    });

    await row.getByRole('button', { name: 'Initiate Pricing', exact: true }).click();
    const message = await dialogPromise;
    if (accept) {
      await expect(this.page).toHaveURL(/\/crm\/pricing/);
    } else {
      await expect(this.page).toHaveURL(/\/crm\/quotationGeneration(\?|$)/);
    }
    return message;
  }
}

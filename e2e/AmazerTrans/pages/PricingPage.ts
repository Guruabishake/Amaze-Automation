import * as path from 'path';
import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { QuotationChargeData } from '../utils/testData';

const PRICING_API_SEGMENT = '/pricing/updatePricing';

/** Confirmed live: the Buy/Sell tables render the short prefix only ("Base Charge"), not the full master-list text ("Base Charge - Direct Expenses (CB,FF,TMS)") used to select it. */
function shortChargeName(fullChargeDescription: string): string {
  return fullChargeDescription.split(' - ')[0].trim();
}

export interface PricingSummaryValues {
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
 * Pricing List (CRM -> Sales Management -> Pricing) is reached only via Quotation Generation's
 * "Initiate Pricing" action (QuotationPage.initiatePricing) - there is no standalone Create here,
 * same convention as Enquiry -> Quotation. Confirmed live via real page snapshots and network
 * traces (never assumed):
 *
 * - Top tabs are identical to Quotation's: Customer Information / Product Information / Quote -
 *   both fully read-only mirrors of the originating Enquiry/Quotation.
 * - The Quote tab's Origin/International/Destination sections each render TWO real <table>s under
 *   their own real <h2> headings, "Buy Rate" and "Sell Rate" - not one table with two views. Buy
 *   Rate is a read-through of the Buy Rate rows Quotation already created; Sell Rate mirrors those
 *   same rows 1:1 plus an inline-editable "Margin %" text input per row (blank/"-" placeholder).
 *   Confirmed live: editing Margin % live-recalculates that row's Sell Rate = Buy Rate x
 *   (1 + Margin/100) and Value In INR = Sell Rate x Quantity x Exchange Rate - the app's own
 *   formula, never invented here.
 * - "+Add <Section>" (e.g. "+Add Origin") opens an "Add Buy <Section>" popup and, confirmed live,
 *   automatically creates the mirrored Sell Rate row too (with Margin % editable, since it now has
 *   a Buy counterpart). "+Add <Section> Charge" (e.g. "+Add Origin Charge") opens a SEPARATE
 *   "Add Sell <Section>" popup that adds a Sell-ONLY row with no Buy counterpart and no Margin %
 *   ("-" is shown instead) - the two buttons are genuinely different mechanisms, not a naming
 *   variant of the same one.
 * - Each Buy/Sell row has exactly two icon-only actions: Edit (no distinguishing class) and Delete
 *   (its <svg> carries `class="text-red-500"` - the only reliable, non-positional way to tell them
 *   apart, since the Buy table's Edit icon carries no `title` attribute at all, unlike Sell's).
 *   Confirmed live: Delete requires a genuine native `window.confirm()` (same mechanism as
 *   Enquiry/Quotation's Initiate actions) and, on the Buy table specifically, cascades to delete
 *   the paired Sell row too.
 * - Summary shows a "Buy Rate Summary" table (CURRENCY/COST/EXCHANGE RATE/TOTAL IN INR) and a
 *   "Sell Rate Summary" table (COST/REVENUE/EXCHANGE RATE/PROFIT IN INR/PROFIT PERCENTAGE/REVENUE
 *   IN INR) plus a "Total Profit" grand total. Confirmed live formula: TOTAL IN INR = COST x
 *   EXCHANGE RATE; REVENUE IN INR = REVENUE x EXCHANGE RATE; PROFIT IN INR = REVENUE IN INR - Buy's
 *   TOTAL IN INR; PROFIT PERCENTAGE = PROFIT IN INR / Buy's TOTAL IN INR x 100; Total Profit =
 *   PROFIT IN INR.
 * - Upload File renders two entirely separate sections, "Buy Documents" and "Sell Documents" (real
 *   <h2> headings), each with its own Document Type dropdown/file input/Upload button/table - both
 *   inherit whatever document(s) the originating Enquiry/Quotation already uploaded.
 * - The listing's row action is a real "Submit To Approval" button (not "Submit to Approve") that,
 *   confirmed live, triggers a native `window.confirm()` and on accept calls
 *   POST /quoteapproval/createQuoteApproval then navigates to the separate, out-of-scope
 *   "Quote Approval" module (`/crm/quoteApproval`).
 * - The View screen has only a Back button (no Cancel) - unlike Quotation's own View, which keeps
 *   both.
 */
export class PricingPage {
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
    this.pageHeading = page.getByRole('heading', { name: 'Pricing List', exact: true });
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.updateFormHeading = page.getByRole('heading', { name: 'Update Pricing', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Pricing', exact: true });
    this.updateButton = page.getByRole('button', { name: 'Update', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** Real app navigation: sidebar CRM -> Sales Management -> Pricing (the sidebar's own link label; the screen's heading is "Pricing List"). Same toggle-safe pattern as the other Page Objects. */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const pricingLink = this.page.getByRole('button', { name: 'Pricing', exact: true });
    if (!(await pricingLink.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await pricingLink.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Enquiry No / Quote No are globally unique (unlike Customer Name, which repeats across every
   * Enquiry/Quotation/Pricing record the same Customer has) - the reliable way to locate exactly
   * the record this test created, never by row position.
   */
  findQuotationByEnquiryNumber(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  findQuotationByQuoteNumber(quoteNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(quoteNo, { exact: true }) })
      .first();
  }

  async openQuotationForEdit(enquiryNo: string) {
    await this.findQuotationByEnquiryNumber(enquiryNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
  }

  async openQuotationForView(enquiryNo: string) {
    await this.findQuotationByEnquiryNumber(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /** Reads the listing's real "Pricing Status" column for the exact record. */
  async expectPricingStatus(enquiryNo: string, status: 'Pricing Inprogress' | 'Price Updated' | 'Price Revalidate' | 'Submitted to Approval') {
    await expect(this.findQuotationByEnquiryNumber(enquiryNo)).toContainText(status);
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

  /** Header fields common to Update and View: Enquiry No/Quote No match the record's real values, Pricing Date is populated. */
  async verifyHeaderFields(expectedEnquiryNo: string, expectedQuoteNo: string) {
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No' })).toHaveValue(expectedEnquiryNo);
    await expect(this.page.getByRole('textbox', { name: 'Quote No' })).toHaveValue(expectedQuoteNo);
  }

  /**
   * Reads the header's real Pricing Date value (opens Edit, reads it, returns to the listing) - to
   * reuse as a genuine value for the Filter's own Pricing Date field, never a hardcoded/guessed
   * date. Confirmed live via direct DOM inspection: this field is a real
   * `input[type="date"][name="pricing_date"]`, disabled, whose placeholder is a single space (not
   * "Pricing Date" like Enquiry No/Quote No's placeholder-driven accessible name) - so it cannot be
   * addressed via `getByRole('textbox', { name: 'Pricing Date' })` like the other header fields;
   * its real `name` attribute is the stable, non-guessed way to reach it. Its value is the input's
   * native ISO yyyy-mm-dd format, directly reusable by `filterByPricingDate`.
   */
  async getPricingDateHeaderValue(enquiryNo: string): Promise<string> {
    await this.openQuotationForEdit(enquiryNo);
    const value = await this.page.locator('input[name="pricing_date"]').inputValue();
    await this.backToPricingList();
    return value;
  }

  /** Confirmed live: fully read-only, inherited from the originating Enquiry/Quotation - never re-entered here. */
  async verifyCustomerInformation(expectedCustomerName: string) {
    await this.openCustomerInformationTab();
    const customerIdInput = this.page.getByRole('textbox', { name: 'Customer Id' });
    await expect(customerIdInput).toHaveValue(/^CUST-\d+$/);
    await expect(customerIdInput).toBeDisabled();
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(expectedCustomerName);
    await expect(customerNameInput).toBeDisabled();
  }

  /** Confirmed live: identical field set to Quotation's own Product Information tab, fully read-only. */
  async verifyProductInformation(expected: { shipmentMode: string; shipmentDirection: string; shipmentType?: string; businessType: string }) {
    await this.openProductInformationTab();
    await expect(this.page.getByRole('textbox', { name: 'Shipment Mode' })).toHaveValue(expected.shipmentMode);
    await expect(this.page.getByRole('textbox', { name: 'Shipment Direction' })).toHaveValue(expected.shipmentDirection);
    if (expected.shipmentType !== undefined) {
      await expect(this.page.getByRole('textbox', { name: 'Shipment Type' })).toHaveValue(expected.shipmentType);
    }
    await expect(this.page.getByRole('textbox', { name: 'Business Type' })).toHaveValue(expected.businessType);
  }

  private async openSection(section: 'Origin' | 'International' | 'Destination') {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: section, exact: true }).click();
  }

  /**
   * Scopes to exactly the "Buy Rate"/"Sell Rate" <table> currently on screen. Confirmed live via a
   * real strict-mode violation (not assumed) that the "Buy Rate" and "Sell Rate" headings are
   * SIBLINGS sharing one common parent that contains BOTH tables - unlike the Upload Documents
   * section, where each heading's parent holds only its own table - so `heading.locator('..')`
   * alone is ambiguous here. Confirmed live the two tables are always in a fixed Buy-then-Sell
   * order with no distinguishing class/data-testid of their own, so `.first()`/`.last()` on the
   * shared parent's exactly-two tables is the one reliable, non-content-dependent way to tell them
   * apart - the same kind of fixed-position access already used elsewhere in this codebase for
   * known table columns, not a "blind" guess about which row is which.
   */
  private buySection(): Locator {
    return this.page.getByRole('heading', { name: 'Buy Rate', exact: true }).locator('..').locator('table').first();
  }
  private sellSection(): Locator {
    return this.page.getByRole('heading', { name: 'Sell Rate', exact: true }).locator('..').locator('table').last();
  }
  private buyDocumentsSection(): Locator {
    return this.page.getByRole('heading', { name: 'Buy Documents', exact: true }).locator('..');
  }
  private sellDocumentsSection(): Locator {
    return this.page.getByRole('heading', { name: 'Sell Documents', exact: true }).locator('..');
  }

  private dataRows(section: Locator): Locator {
    return section.getByRole('row').filter({ hasNotText: 'CHARGE DESCRIPTION' }).filter({ hasText: /\d/ });
  }
  private buyRowByCharge(chargeDescription: string): Locator {
    return this.dataRows(this.buySection()).filter({ hasText: shortChargeName(chargeDescription) });
  }
  private sellRowByCharge(chargeDescription: string): Locator {
    return this.dataRows(this.sellSection()).filter({ hasText: shortChargeName(chargeDescription) });
  }

  /** Confirmed live: Delete's <svg> alone carries `class="text-red-500"` - the only non-positional way to tell the two icon-only row actions apart (Buy's Edit icon has no `title`, unlike Sell's). */
  private editButtonIn(row: Locator): Locator {
    return row.getByRole('button').filter({ hasNot: this.page.locator('svg.text-red-500') }).first();
  }
  private deleteButtonIn(row: Locator): Locator {
    return row.getByRole('button').filter({ has: this.page.locator('svg.text-red-500') }).first();
  }
  /**
   * The Add/Edit row popup's own form. Confirmed live via direct DOM inspection (`form.contains()`)
   * that the popup's <form> is a genuine DOM DESCENDANT of the outer page-level <form> - this
   * framework builds the DOM via direct node insertion, not HTML-string parsing, so the usual "no
   * nested <form>" browser rule never kicks in to prevent it. That rules out every content-based
   * `hasText` scoping attempt (heading text, full Charge Description, anything) - the outer form's
   * `textContent` always includes the popup's too, since it's an ancestor. Document order is the
   * one reliable signal instead: an ancestor always appears before its descendant in
   * `page.locator('form')`, so the innermost (and only ever one, since one popup is open at a time)
   * popup form is always the LAST match.
   */
  private chargePopupForm(): Locator {
    return this.page.locator('form').last();
  }

  /** Public row-locator getters for verification from the spec (e.g. asserting a row's cell text after an edit) - both assume the caller is already on the right section, same as the other row-scoped methods below. */
  getBuyRowByCharge(chargeDescription: string): Locator {
    return this.buyRowByCharge(chargeDescription);
  }
  getSellRowByCharge(chargeDescription: string): Locator {
    return this.sellRowByCharge(chargeDescription);
  }

  /**
   * The Sell row that actually has a Margin % - i.e. the one with a real Buy counterpart, as
   * opposed to any Sell-ONLY row (added via "+Add <Section> Charge") that happens to share the same
   * short Charge Description prefix (e.g. "Base Charge - Direct Expenses..." vs "Base Charge -
   * Direct Incomes..." both render as just "Base Charge"). Confirmed live this is a real, reachable
   * naming collision, not a hypothetical one.
   *
   * Disambiguates on the Margin % cell's own content (real column position, confirmed live:
   * S.no/Charge Description/HS Code/Charge Based On/Quantity/Margin %/... - the 6th <td>, so
   * `td:nth-child(6)`) rather than "has an editable input" - the input-based check this replaced
   * only worked in Update mode; View mode renders every field read-only (no `<textbox>` at all), so
   * it matched zero rows there and hung indefinitely (confirmed via trace, not assumed). A
   * Sell-only row's Margin % cell is confirmed live to always read exactly "-" in both modes, so
   * excluding that is mode-independent.
   */
  private marginApplicableSellRowByCharge(chargeDescription: string): Locator {
    return this.sellRowByCharge(chargeDescription).filter({ hasNot: this.page.locator('td:nth-child(6)', { hasText: /^-$/ }) });
  }

  /** Reads the current (possibly just-persisted) Sell Rate for the row matching `chargeDescription`, without changing anything - used to verify Margin % survived a real page reload (Update/View), unlike `setMarginForRow` which both sets and reads. */
  async getSellRateForRow(section: 'Origin' | 'International' | 'Destination', chargeDescription: string): Promise<string> {
    await this.openSection(section);
    const row = this.marginApplicableSellRowByCharge(chargeDescription);
    const cells = row.getByRole('cell');
    return (await cells.nth(6).innerText()).trim();
  }

  async expectBuyRowCount(section: 'Origin' | 'International' | 'Destination', count: number) {
    await this.openSection(section);
    await expect(this.dataRows(this.buySection())).toHaveCount(count);
  }
  async expectSellRowCount(section: 'Origin' | 'International' | 'Destination', count: number) {
    await this.openSection(section);
    await expect(this.dataRows(this.sellSection())).toHaveCount(count);
  }

  /** "+Add <Section>" - confirmed live this also auto-creates the mirrored Sell Rate row. */
  async addBuyEntry(section: 'Origin' | 'International' | 'Destination', charge: QuotationChargeData) {
    await this.openSection(section);
    await this.page.getByRole('button', { name: new RegExp(`add ${section}$`, 'i') }).click();
    await selectCustomDropdown(this.page, 'Charge Description', charge.chargeDescription);
    await this.page.getByRole('textbox', { name: 'Quantity' }).fill(charge.quantity);
    await this.page.getByRole('textbox', { name: 'Buy Rate' }).fill(charge.buyRate);
    await selectCustomDropdown(this.page, 'Buy Currency', charge.buyCurrency);
    await this.chargePopupForm().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /** "+Add <Section> Charge" - confirmed live a genuinely separate mechanism that adds a Sell-ONLY row (no Buy counterpart, no Margin %). Reuses `QuotationChargeData`'s `buyRate` field to carry the Sell Rate value - there is no Buy side here to distinguish it from. */
  async addSellEntry(section: 'Origin' | 'International' | 'Destination', charge: QuotationChargeData) {
    await this.openSection(section);
    await this.page.getByRole('button', { name: new RegExp(`add ${section} charge$`, 'i') }).click();
    await selectCustomDropdown(this.page, 'Charge Description', charge.chargeDescription);
    await this.page.getByRole('textbox', { name: 'Quantity' }).fill(charge.quantity);
    await this.page.getByRole('textbox', { name: 'Sell Rate' }).fill(charge.buyRate);
    await selectCustomDropdown(this.page, 'Sell Currency', charge.buyCurrency);
    await this.chargePopupForm().getByRole('button', { name: 'Save', exact: true }).click();
  }

  /**
   * Sets the Margin % for the Sell row matching `chargeDescription` (identified by its real visible
   * text, never by position) - confirmed live this is a plain inline `<input>` in the row itself,
   * not a popup field. `Tab` blurs it to trigger the app's own live recalculation (Sell Rate = Buy
   * Rate x (1 + Margin/100)); returns the recalculated Sell Rate so the caller can verify it against
   * that real formula rather than assuming a value.
   */
  async setMarginForRow(section: 'Origin' | 'International' | 'Destination', chargeDescription: string, marginPercent: string): Promise<string> {
    await this.openSection(section);
    const row = this.marginApplicableSellRowByCharge(chargeDescription);
    const marginInput = row.getByRole('textbox').first();
    await marginInput.fill(marginPercent);
    await marginInput.press('Tab');
    const cells = row.getByRole('cell');
    // Columns confirmed live: S.NO/CHARGE DESCRIPTION/HS CODE/CHARGE BASED ON/QUANTITY/MARGIN %/
    // SELL RATE/SELL CURRENCY/EXCHANGE RATE/VALUE IN INR - Sell Rate is index 6.
    return (await cells.nth(6).innerText()).trim();
  }

  async editQuoteRow(
    section: 'Origin' | 'International' | 'Destination',
    side: 'Buy' | 'Sell',
    chargeDescription: string,
    updates: { quantity?: string; rate?: string }
  ) {
    await this.openSection(section);
    const row = side === 'Buy' ? this.buyRowByCharge(chargeDescription) : this.sellRowByCharge(chargeDescription);
    await this.editButtonIn(row).click();
    const popupForm = this.chargePopupForm();
    if (updates.quantity !== undefined) {
      await popupForm.getByRole('textbox', { name: 'Quantity' }).fill(updates.quantity);
    }
    if (updates.rate !== undefined) {
      await popupForm.getByRole('textbox', { name: side === 'Buy' ? 'Buy Rate' : 'Sell Rate' }).fill(updates.rate);
    }
    await popupForm.getByRole('button', { name: 'Update', exact: true }).click();
  }

  /** Confirmed live: Delete requires a genuine native `window.confirm()` - same mechanism as Enquiry/Quotation's Initiate actions - and on the Buy table cascades to remove the paired Sell row too. */
  async deleteQuoteRow(section: 'Origin' | 'International' | 'Destination', side: 'Buy' | 'Sell', chargeDescription: string, accept = true): Promise<string> {
    await this.openSection(section);
    const row = side === 'Buy' ? this.buyRowByCharge(chargeDescription) : this.sellRowByCharge(chargeDescription);
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
    await this.deleteButtonIn(row).click();
    return dialogPromise;
  }

  /**
   * Reads every real value the Summary tab displays - Buy Rate Summary's COST/EXCHANGE RATE/TOTAL
   * IN INR, Sell Rate Summary's COST/REVENUE/EXCHANGE RATE/PROFIT IN INR/PROFIT PERCENTAGE/REVENUE
   * IN INR, and the grand "Total Profit" - via real DOM cells (Buy/Sell Summary tables) plus one
   * regex against the tab's own text for the grand total, the same proven approach already used by
   * QuotationPage.getSummaryTotalCost.
   */
  async getSummaryValues(): Promise<PricingSummaryValues> {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: 'Summary', exact: true }).click();

    // Confirmed live (the same real structural finding as buySection/sellSection above): "Buy Rate
    // Summary" and "Sell Rate Summary" are sibling headings sharing one parent that holds BOTH
    // summary tables, so scoping is via the shared parent's two tables in their confirmed fixed
    // Buy-then-Sell order, not the heading's own (ambiguous) parent alone.
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
      throw new Error(`Total Profit not found on the Summary tab. Tab text was:\n${bodyText}`);
    }
    const totalProfit = Number(totalMatch[1].replace(/,/g, ''));

    return { buyCost, buyExchangeRate, buyTotalInInr, sellCost, sellRevenue, sellExchangeRate, profitInInr, profitPercentage, revenueInInr, totalProfit };
  }

  /**
   * Verifies the Summary tab's own internal arithmetic - confirmed live formula: TOTAL IN INR =
   * COST x EXCHANGE RATE; REVENUE IN INR = REVENUE x EXCHANGE RATE; PROFIT IN INR = REVENUE IN INR -
   * Buy's TOTAL IN INR; PROFIT PERCENTAGE = PROFIT IN INR / Buy's TOTAL IN INR x 100; Total Profit =
   * PROFIT IN INR. Every value on the right of each assertion is read from the app itself (never
   * hardcoded), so this only ever confirms the app's displayed numbers are mutually consistent.
   */
  async verifySummaryCalculation(): Promise<PricingSummaryValues> {
    const s = await this.getSummaryValues();
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

  /**
   * Opens the "Document Type" combobox and selects whatever its FIRST real option is, per the
   * required "select the FIRST valid document type displayed" behavior - never assumes a value.
   * Unlike an open-then-close-then-reopen approach, this selects within the SAME continuous
   * open-panel interaction: root-caused a real, reproducible hang (confirmed via trace, not
   * assumed) where pressing Escape to close the panel after peeking, then immediately reopening it
   * via a separate `selectCustomDropdown` call, raced the widget's own close animation - the second
   * click sometimes toggled the still-closing panel shut instead of opening it fresh, leaving no
   * `<li>` for the subsequent click to ever find (Playwright then waits indefinitely, since this
   * repo sets no actionTimeout). Mirrors `selectCustomDropdown`'s own search-box-or-direct-click
   * logic, just against a discovered option instead of a known one.
   *
   * The inner `has` check uses `this.page.getByText`, not `scope.getByText` - confirmed live that
   * scoping BOTH the outer search and the inner `has` check to the same already-scoped `scope`
   * locator produces its own real (multi-minute) hang, not just a slower resolution: the inner
   * locator ends up re-describing the entire outer scope chain a second time, which never
   * converges. Since only one "Document Type" field exists per Buy/Sell container (confirmed
   * live), a page-wide inner check combined with the already-scoped outer search stays unambiguous.
   */
  private async selectFirstDropdownOption(labelText: string, scope: Locator): Promise<string> {
    const field = scope.locator('div.relative.group', { has: this.page.getByText(labelText, { exact: true }) }).first();
    await field.getByRole('combobox').click();
    const firstOption = this.page.locator('li').first();
    const text = (await firstOption.innerText()).trim();
    const searchBox = this.page.getByPlaceholder('Search...');
    await searchBox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (await searchBox.isVisible().catch(() => false)) {
      await searchBox.fill(text);
      await firstOption.waitFor({ state: 'visible' });
      await searchBox.press('Enter');
    } else {
      await firstOption.click();
    }
    return text;
  }

  /**
   * Correlates via `clickUploadAndAwaitResponse` (request-scoped), not a generic
   * response-URL match - root-caused via a real trace that a straggler upload response from an
   * earlier, unrelated screen (e.g. Customer/Vendor KYC) can still resolve mid-flight here and get
   * mistaken for this exact click's own response.
   */
  private async uploadDocumentIn(scope: Locator, filePath: string): Promise<{ documentType: string; fileName: string }> {
    const fileName = path.basename(filePath);
    const documentType = await this.selectFirstDropdownOption('Document Type', scope);
    await scope.locator('input[type="file"]').setInputFiles(filePath);
    const response = await clickUploadAndAwaitResponse(this.page, scope.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `Document upload should succeed. Status ${response.status()}`).toBeTruthy();
    await expect(scope.getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible({ timeout: 20000 });
    return { documentType, fileName };
  }

  async uploadBuyDocument(filePath: string): Promise<{ documentType: string; fileName: string }> {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    return this.uploadDocumentIn(this.buyDocumentsSection(), filePath);
  }

  async uploadSellDocument(filePath: string): Promise<{ documentType: string; fileName: string }> {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    return this.uploadDocumentIn(this.sellDocumentsSection(), filePath);
  }

  async expectUploadedBuyFileName(fileName: string) {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    await expect(this.buyDocumentsSection().getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible();
  }

  async expectUploadedSellFileName(fileName: string) {
    await this.openQuoteTab();
    await this.page.getByRole('button', { name: 'Upload File', exact: true }).click();
    await expect(this.sellDocumentsSection().getByRole('cell', { name: fileName, exact: true }).first()).toBeVisible();
  }

  /** Confirmed live via the network tab: PUT /middleware/api/v1/pricing/updatePricing/{id}. */
  async updateQuotation() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes(PRICING_API_SEGMENT) && res.request().method() !== 'GET');
    await this.updateButton.click();
    const response = await responsePromise;
    expect(response.ok(), `Pricing update should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Confirmed on the live app: Cancel discards in-progress edits and returns to the listing without calling the update API. */
  async cancelUpdateForm() {
    await this.cancelButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Confirmed live: unlike Quotation's own View screen (Back + Cancel), Pricing's View has only Back. */
  async verifyViewFormFields(expectedEnquiryNo: string, expectedQuoteNo: string, expectedCustomerName: string) {
    await expect(this.viewFormHeading).toBeVisible();
    await this.verifyHeaderFields(expectedEnquiryNo, expectedQuoteNo);
    await this.verifyCustomerInformation(expectedCustomerName);
    await expect(this.backButton).toBeVisible();
    await expect(this.updateButton).not.toBeVisible();
  }

  async backToPricingList() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  async openFilter() {
    await this.filterButton.click();
    await expect(this.page.getByRole('textbox', { name: 'Enquiry No', exact: true })).toBeVisible();
  }

  private async searchAndWait() {
    const responsePromise = this.page.waitForResponse((res) => res.url().includes('/pricing/getAllPricings') && res.request().method() === 'GET');
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await responsePromise;
  }

  async filterByEnquiryNumber(enquiryNo: string) {
    await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).fill(enquiryNo);
    await this.searchAndWait();
  }
  async filterByQuoteNumber(quoteNo: string) {
    await this.page.getByRole('textbox', { name: 'Quote No', exact: true }).fill(quoteNo);
    await this.searchAndWait();
  }
  async filterByCustomerName(customerName: string) {
    await this.page.getByRole('textbox', { name: 'Customer Name', exact: true }).fill(customerName);
    await this.searchAndWait();
  }
  /** Confirmed live via direct DOM inspection: Pricing Date is a real `input[type="date"][name="pricing_date"]` in the Filter panel, the only one on the panel - `.fill()` expects its native ISO yyyy-mm-dd value, the same format `getPricingDateHeaderValue` returns. */
  async filterByPricingDate(date: string) {
    await this.page.locator('input[type="date"]').fill(date);
    await this.searchAndWait();
  }
  async filterByDirection(direction: 'Export' | 'Import') {
    await selectCustomDropdown(this.page, 'Import/Export', direction);
    await this.searchAndWait();
  }
  async filterByPricingStatus(status: 'Pricing Inprogress' | 'Price Updated' | 'Price Revalidate' | 'Submitted to Approval') {
    await selectCustomDropdown(this.page, 'Pricing Status', status);
    await this.searchAndWait();
  }

  /** Confirmed live: once a filter narrows the list, the count reads "{matched} of {total} records". */
  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /**
   * Reads the listing's own record-count text and returns the total record count. Confirmed live
   * via direct DOM inspection that this text has TWO real forms, not one: unfiltered, it reads a
   * plain "{total} records" (no "of" at all); once a filter narrows the list, it becomes "{matched}
   * of {total} records". Both forms end in "<number> records", so that trailing number is always
   * the total regardless of which form is showing - the one thing this method actually needs.
   */
  /**
   * Confirmed live: Reset clears every filter field, restores the full unfiltered list, and closes
   * the panel - so restoration is verified against the unfiltered "{total} records" text (no "of"),
   * not the filtered "{matched} of {total} records" form. Confirmed live (via a real strict-mode
   * violation, not assumed) that whenever a filter is currently applied, the main list ALSO shows
   * its own quick-clear "Reset" button next to "Filter" (outside the popup) - the violation's own
   * error output showed the two matches as `getByRole('button', { name: 'Reset' }).first()`
   * (unscoped - the outer quick button) vs `locator('form').getByRole('button', { name: 'Reset' })`
   * (the popup's own, genuinely inside a <form>). Confirmed live via `document.querySelectorAll`
   * that the Pricing List screen itself (unlike Update/View, which are data-entry forms) renders
   * exactly one <form> - the filter popup's own - whenever the panel is open, so scoping by `form`
   * unambiguously selects only the popup's Reset (an earlier attempt scoped via "Search"'s DOM
   * parent instead, which turned out not to be a true sibling of Reset and hung indefinitely
   * finding zero matches). Also confirmed live (same real staging-concurrency issue already fixed
   * on several other lists' own resetFilter): asserting the post-Reset total matches an EXACT
   * pre-filter count is flaky since other real activity on the shared staging environment can
   * genuinely change it in between - checking that a "N records" summary reappears at all is the
   * real, reliable success signal.
   */
  async resetFilter() {
    await this.page.locator('form').getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Confirmed live: the listing's real "Submit To Approval" button (not "Submit to Approve")
   * triggers a genuine native `window.confirm()` and, on accept, calls
   * POST /quoteapproval/createQuoteApproval then navigates to the separate, out-of-scope "Quote
   * Approval" module (`/crm/quoteApproval`) - completing an approval there is out of scope for
   * Pricing, so this only verifies the real navigation and the resulting listing status.
   */
  async submitToApprove(enquiryNo: string, accept: boolean): Promise<string> {
    const row = this.findQuotationByEnquiryNumber(enquiryNo);
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
    await row.getByRole('button', { name: 'Submit To Approval', exact: true }).click();
    const message = await dialogPromise;
    if (accept) {
      await expect(this.page).toHaveURL(/\/crm\/quoteApproval/);
    } else {
      await expect(this.page).toHaveURL(/\/crm\/pricing(\?|$)/);
    }
    return message;
  }
}

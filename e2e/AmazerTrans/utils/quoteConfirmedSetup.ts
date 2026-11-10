import { Page, expect } from '@playwright/test';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { EnquiryPage } from '../pages/EnquiryPage';
import { QuotationPage } from '../pages/QuotationPage';
import { PricingPage } from '../pages/PricingPage';
import { QuoteApprovalPage } from '../pages/QuoteApprovalPage';
import {
  generateCustomerData,
  generateCustomerContact,
  generateBankDetails,
  generateGstDetails,
  generateVendorData,
  generateEnquiryScenarioData,
  generateTransportGoodsData,
  generateTransportContainerData,
  generateQuotationData,
  generatePricingExtraBuyEntry,
  generatePricingExtraSellEntry,
  ENQUIRY_SCENARIOS,
  ENQUIRY_UPLOAD_FILES,
  QUOTATION_UPLOAD_FILES,
  QUOTATION_UPLOAD_ENABLED,
  PRICING_MARGIN_PERCENT,
  EnquiryScenario,
} from './testData';
import { captureScreenshot } from './screenshot';

/**
 * Extracted from pricing.spec.ts's own Enquiry -> Quotation -> Pricing -> Quote Approval chain
 * (same Page Objects, same generators, same proven sequence) so it can be reused as an OPTIONAL
 * data-generation step by other specs - specifically confirmOrder.spec.ts, whose own Confirm
 * Master Job step needs at least one record in real "Quote Confirmed" status and cannot manufacture
 * one itself (that status is only reachable via a full Enquiry->Quotation->Pricing->Quote Approval
 * "Approve" chain, out of Confirm Order List's own scope). A `.spec.ts` file cannot be imported by
 * another `.spec.ts` without re-registering its tests (Playwright limitation, already documented on
 * pricing.spec.ts itself) - this module is the shared, non-test home for that chain so BOTH specs
 * call the exact same logic instead of it being duplicated or forked.
 *
 * pricing.spec.ts calls this for its own setup and continues into its own Pricing/Quote Approval
 * verification (Filter, View, Print, etc.) using the values returned here. Callers that only need a
 * fresh "Quote Confirmed" record (e.g. confirmOrder.spec.ts) can use the return value directly and
 * skip everything else.
 */

export interface QuoteConfirmedRecord {
  enquiryNo: string;
  quoteNo: string;
  customerName: string;
  vendorName: string;
  shipmentMode: string;
  shipmentDirection: string;
  shipmentType: string;
  businessType: string;
  pricingDateValue: string;
  marginCheck: Record<string, { chargeDescription: string; sellRate: string }>;
  buyUploadFileName: string;
  sellUploadFileName: string;
}

/** Assumes an already-logged-in `page`. Creates and approves ONE Customer with complete Basic+Contact+Bank+KYC+Document+Credit data. */
async function createApprovedCustomer(page: Page, seed: number) {
  const customer = new CustomerPage(page);
  await customer.navigateFromSidebar();
  const customerData = generateCustomerData(seed);
  await customer.openCreateForm();
  await customer.fillBasicDetails(customerData);
  await customer.fillContactDetails(generateCustomerContact(seed));
  await customer.fillBankDetails(generateBankDetails(seed));
  await customer.fillKycDetails(generateGstDetails(seed));
  await customer.uploadKycDocument('Aadhar');
  await customer.fillCreditDetails('30', '50000');
  await customer.submitAndExpectSuccess();
  await customer.approveCustomerByName(customerData.customerName);
  await customer.expectApprovalStatus(customerData.customerName, 'Approved');
  return customerData;
}

/** Assumes an already-logged-in `page`. Creates and approves ONE Vendor with complete Basic+Contact+Bank+Document+Credit data. */
async function createApprovedVendor(page: Page, seed: number) {
  const vendor = new VendorPage(page);
  await vendor.navigateFromSidebar();
  const vendorData = generateVendorData(seed);
  await vendor.openCreateForm();
  await vendor.fillBasicDetails(vendorData);
  await vendor.fillContactDetails(generateCustomerContact(seed));
  await vendor.fillBankDetails(generateBankDetails(seed));
  await vendor.uploadKycDocument('Aadhar');
  await vendor.fillCreditDetails('45', '75000');
  await vendor.submitAndExpectSuccess();
  await vendor.approveVendorByName(vendorData.vendorName);
  await vendor.expectApprovalStatus(vendorData.vendorName, 'Approved');
  return vendorData;
}

/**
 * Runs the full Enquiry -> Quotation -> Pricing -> Quote Approval -> Confirm Quote chain against
 * an already-logged-in `page`, producing exactly one fresh record in real "Quote Confirmed"
 * status (Confirm Order List's own terminology). `labelPrefix` is used only for screenshot naming
 * (e.g. the calling spec's own name/user label), never business data.
 *
 * `existingCustomerName`: pass an already-created/approved Customer's real name to run this chain
 * AGAINST that SAME customer instead of creating a new one - required whenever a caller needs the
 * Enquiry tied to a specific Customer it already created for its own purposes (e.g. Contract's own
 * "Create Sub Contract" form, confirmed live to scope its own Enquiry No picker to the Contract's
 * Customer - a fresh customer with no Enquiry of its own shows "No results found" there). Only the
 * name is needed - nothing else about the Customer record is read again after its own creation.
 * Vendor is always freshly created either way, since nothing about this chain requires reusing one.
 *
 * `scenarioOverride`: pass a specific Direction/Mode/Services combination to run this chain against
 * INSTEAD of the default ENQUIRY_SCENARIOS[3] (FF+CB+TMS) - required by CB automation (utils/cbConfig.ts),
 * which needs all 4 real Direction+Mode combinations (including Export+Air, which no entry in the
 * shared ENQUIRY_SCENARIOS array covers) as its own real source data, never independently generated.
 */
export async function createQuoteConfirmedRecord(
  page: Page,
  seedBase: number,
  labelPrefix = 'setup',
  existingCustomerName?: string,
  scenarioOverride?: Pick<EnquiryScenario, 'shipmentDirection' | 'shipmentMode' | 'services'>
): Promise<QuoteConfirmedRecord> {
  const customerSeed = seedBase;
  const enquirySeed = seedBase + 150;
  const scenario = scenarioOverride ?? ENQUIRY_SCENARIOS[3]; // default: FF + CB + TMS - richest combination, exercises every conditional field

  const customerData: { customerName: string } = existingCustomerName
    ? { customerName: existingCustomerName }
    : await createApprovedCustomer(page, customerSeed);
  const vendorData = await createApprovedVendor(page, customerSeed);

  const enquiry = new EnquiryPage(page);
  const quotation = new QuotationPage(page);
  const pricing = new PricingPage(page);

  const enquiryData = generateEnquiryScenarioData(enquirySeed, scenario);
  const quotationData = generateQuotationData(enquirySeed);

  // ---------- ENQUIRY ----------
  await enquiry.navigateFromSidebar();
  await enquiry.openCreateForm();
  await enquiry.fillCustomerInformation(customerData.customerName, enquiryData.sourceOfEnquiry);
  await enquiry.fillVisibleServiceFields(scenario, enquiryData);
  await enquiry.addCargoItem(enquiryData.cargo);
  // Transport-Goods/Transport-Container rows only exist when Transport Management System is
  // selected (the Transport tab itself is conditional on that service - see EnquiryPage's own
  // fillTransportGoodsRows/fillTransportContainerRows docstrings). Every scenario this function
  // was called with before CB automation added `scenarioOverride` had TMS always enabled
  // (ENQUIRY_SCENARIOS[3]), so this guard was never previously needed - a non-TMS override (e.g.
  // CB's own FF+CB scenarios) would otherwise hang indefinitely clicking a "Transport" tab that
  // genuinely does not exist (no actionTimeout is configured anywhere in this repo).
  if (scenario.services.transportManagementSystem) {
    const transportGoodsData = generateTransportGoodsData(enquirySeed);
    await enquiry.fillTransportGoodsRows(transportGoodsData.pickup, transportGoodsData.delivery);
    if (scenario.shipmentMode !== 'Air') {
      const transportContainerData = generateTransportContainerData(enquirySeed);
      await enquiry.fillTransportContainerRows(transportContainerData.pickup, transportContainerData.delivery);
    }
  }
  await enquiry.uploadDocument('AIRWAY BILL', ENQUIRY_UPLOAD_FILES.primary);
  await enquiry.submitAndExpectSuccess();
  await enquiry.verifyEnquiryInListing(customerData.customerName, enquiryData.shipmentMode, 'Enquiry Created');
  const enquiryNo = (await enquiry.getRowByCustomerName(customerData.customerName).locator(':scope > div').first().innerText()).trim();

  // ---------- QUOTATION ----------
  await enquiry.navigateFromSidebar();
  await enquiry.initiateQuote(customerData.customerName, true);
  await quotation.editQuotationByCustomerName(customerData.customerName);
  const quoteNo = await quotation.page.getByRole('textbox', { name: 'Quote No' }).inputValue();
  await quotation.selectVendorsForServices(scenario.services, vendorData.vendorName);
  await quotation.addBuyRateEntries('Origin', quotationData.origin);
  await quotation.addBuyRateEntries('International', quotationData.international);
  await quotation.addBuyRateEntries('Destination', quotationData.destination);
  if (QUOTATION_UPLOAD_ENABLED) {
    await quotation.uploadDocuments('AIRWAY BILL', quotationData.uploadFiles);
  }
  await quotation.submitUpdateAndExpectSuccess();
  await quotation.expectQuoteStatus(customerData.customerName, 'Quote Generated');
  await captureScreenshot(page, 'quoteConfirmedSetup', 'quotation-setup-success', `${labelPrefix}-${scenario.shipmentDirection}-${scenario.shipmentMode}-${enquiryNo}`);

  // ---------- PRICING ----------
  await quotation.initiatePricing(customerData.customerName, true);
  await expect(pricing.pageHeading).toBeVisible();
  await pricing.openQuotationForEdit(enquiryNo);
  await pricing.verifyHeaderFields(enquiryNo, quoteNo);
  await pricing.verifyCustomerInformation(customerData.customerName);
  await pricing.verifyProductInformation({
    shipmentMode: enquiryData.shipmentMode,
    shipmentDirection: enquiryData.shipmentDirection,
    shipmentType: enquiryData.shipmentType,
    businessType: enquiryData.businessType,
  });

  const sections: Array<{ name: 'Origin' | 'International' | 'Destination'; entries: typeof quotationData.origin }> = [
    { name: 'Origin', entries: quotationData.origin },
    { name: 'International', entries: quotationData.international },
    { name: 'Destination', entries: quotationData.destination },
  ];

  const marginCheck: Record<string, { chargeDescription: string; sellRate: string }> = {};

  for (const { name: section, entries } of sections) {
    const extraBuy = generatePricingExtraBuyEntry(enquirySeed);
    await pricing.addBuyEntry(section, extraBuy);

    if (section === 'Origin') {
      const extraSell = generatePricingExtraSellEntry(enquirySeed);
      await pricing.addSellEntry(section, extraSell);
    }

    const applicableRows = [...entries, extraBuy];
    for (const entry of applicableRows) {
      await pricing.setMarginForRow(section, entry.chargeDescription, PRICING_MARGIN_PERCENT);
    }
    marginCheck[section] = { chargeDescription: entries[2].chargeDescription, sellRate: await pricing.setMarginForRow(section, entries[2].chargeDescription, PRICING_MARGIN_PERCENT) };

    await pricing.editQuoteRow(section, 'Buy', entries[0].chargeDescription, { quantity: '9' });
    await pricing.deleteQuoteRow(section, 'Buy', entries[1].chargeDescription, true);
  }

  await pricing.verifySummaryCalculation();

  const buyUpload = await pricing.uploadBuyDocument(QUOTATION_UPLOAD_FILES[0]);
  const sellUpload = await pricing.uploadSellDocument(QUOTATION_UPLOAD_FILES[1] ?? QUOTATION_UPLOAD_FILES[0]);
  await pricing.expectUploadedBuyFileName(buyUpload.fileName);
  await pricing.expectUploadedSellFileName(sellUpload.fileName);

  await pricing.updateQuotation();
  await pricing.expectPricingStatus(enquiryNo, 'Pricing Inprogress');
  await captureScreenshot(page, 'quoteConfirmedSetup', 'pricing-update-success', `${labelPrefix}-${enquiryNo}`);

  const pricingDateValue = await pricing.getPricingDateHeaderValue(enquiryNo);

  await pricing.expectPricingStatus(enquiryNo, 'Pricing Inprogress');
  await pricing.submitToApprove(enquiryNo, true);
  await pricing.navigateFromSidebar();
  await pricing.expectPricingStatus(enquiryNo, 'Submitted to Approval');
  await captureScreenshot(page, 'quoteConfirmedSetup', 'submit-to-approve-success', `${labelPrefix}-${enquiryNo}`);

  // ---------- QUOTE APPROVAL ----------
  const quoteApproval = new QuoteApprovalPage(page);
  await quoteApproval.navigateFromSidebar();
  await quoteApproval.expectApprovalStatus(enquiryNo, 'Approval Inprogress');
  await quoteApproval.openForEdit(enquiryNo);
  await quoteApproval.approveQuote(true);
  await quoteApproval.navigateFromSidebar();
  await page.reload();
  await expect(quoteApproval.pageHeading).toBeVisible();
  await quoteApproval.expectApprovalStatus(enquiryNo, 'Quote Approved');
  await captureScreenshot(page, 'quoteConfirmedSetup', 'quote-approval-success', `${labelPrefix}-${enquiryNo}`);

  // ---------- CONFIRM QUOTE ----------
  // Confirmed live (root-caused during Confirm Order List work): "Quote Approved" alone does NOT
  // create this record's entry in Confirm Order List - reopening Edit reveals a real SECOND step,
  // "Confirm Quote", which is what actually does. Without this, a caller expecting a genuine
  // "Quote Confirmed" record (e.g. Contract's own Subcontract Enquiry No picker) would find none.
  await quoteApproval.openForEdit(enquiryNo);
  await quoteApproval.confirmQuote(true);
  await captureScreenshot(page, 'quoteConfirmedSetup', 'confirm-quote-success', `${labelPrefix}-${enquiryNo}`);

  return {
    enquiryNo,
    quoteNo,
    customerName: customerData.customerName,
    vendorName: vendorData.vendorName,
    shipmentMode: enquiryData.shipmentMode,
    shipmentDirection: enquiryData.shipmentDirection,
    shipmentType: enquiryData.shipmentType,
    businessType: enquiryData.businessType,
    pricingDateValue,
    marginCheck,
    buyUploadFileName: buyUpload.fileName,
    sellUploadFileName: sellUpload.fileName,
  };
}

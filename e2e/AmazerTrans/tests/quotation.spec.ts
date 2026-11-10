import * as path from 'path';
import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { EnquiryPage } from '../pages/EnquiryPage';
import { QuotationPage } from '../pages/QuotationPage';
import {
  loginData,
  generateCustomerData,
  generateCustomerContact,
  generateBankDetails,
  generateGstDetails,
  generateVendorData,
  generateEnquiryScenarioData,
  generateTransportGoodsData,
  generateTransportContainerData,
  generateQuotationData,
  ENQUIRY_SCENARIOS,
  EnquiryScenario,
  ENQUIRY_UPLOAD_FILES,
  QUOTATION_UPLOAD_ENABLED,
} from '../utils/testData';
import { captureScreenshot } from '../utils/screenshot';

/**
 * Quotation Generation (CRM -> Sales Management -> Quotation Generation) is reached only through
 * Enquiry's Initiate Quote action - there is no standalone Create here. This spec consumes the
 * exact same 4 required Service combinations already established for Enquiry (FF+CB, CB+TMS,
 * FF+TMS, FF+CB+TMS - see `ENQUIRY_SCENARIOS` in testData.ts) and, for each one, drives the full
 * Quotation workflow (Customer/Product Information verify -> Vendor selection -> Origin/
 * International/Destination Buy Rate entries -> Summary -> Upload File -> Update -> View -> Back ->
 * Initiate Pricing).
 *
 * One Customer and one Vendor are created ONCE and reused for all 4 Enquiries/Quotations in a
 * single login session - never recreated per scenario. Each scenario's Enquiry is created
 * immediately before its own Quotation is processed (rather than all 4 upfront) so the Enquiry/
 * Quotation listings never have to disambiguate more than one record for this Customer at a time;
 * every "most recent row for this Customer" lookup (`getRowByCustomerName().first()`, confirmed
 * live to sort newest-first) is therefore always unambiguous.
 *
 * Playwright gives every `test()` its own fresh page/context, so a spec file cannot literally reuse
 * in-memory objects from a different spec's test run - `enquiry.spec.ts`'s own Customer/Vendor/
 * Enquiry-creation helpers cannot be imported here (importing a `.spec.ts` file would re-register
 * its own tests). This spec's setup helpers below therefore call the exact same shared, unmodified
 * building blocks Enquiry's own spec uses - `ENQUIRY_SCENARIOS`, `generateEnquiryScenarioData`,
 * `EnquiryPage`'s methods, the same Customer/Vendor Page Objects - rather than a second, different
 * implementation, so "consuming the Enquiries created by the Enquiry flow" means literally the same
 * 4 combinations produced the same way, never a single-service or ad-hoc Enquiry.
 *
 * AmazerTrans only allows one active session per account, and every AmazerTrans spec logs in with
 * the same single account (`loginData`/.env) - `mode: 'serial'` below only orders tests within
 * this file. The cross-file guarantee against another spec's login racing this one in a parallel
 * worker is enforced by e2e/AmazerTrans/playwright.config.ts (workers: 1); always run via
 * `npx playwright test --config=e2e/AmazerTrans/playwright.config.ts`, not the root config.
 */
test.describe.configure({ mode: 'serial' });

async function loginOnce(page: Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();
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

/** Creates one Enquiry for the given scenario - the same building blocks `enquiry.spec.ts` uses, reused rather than reimplemented. Returns its data and its real Enquiry No. */
async function createScenarioEnquiry(
  enquiry: EnquiryPage,
  customerData: { customerName: string },
  scenario: EnquiryScenario,
  seed: number
) {
  const data = generateEnquiryScenarioData(seed, scenario);
  await enquiry.navigateFromSidebar();
  await enquiry.openCreateForm();
  await enquiry.fillCustomerInformation(customerData.customerName, data.sourceOfEnquiry);
  await enquiry.fillVisibleServiceFields(scenario, data);
  await enquiry.addCargoItem(data.cargo);
  if (scenario.services.transportManagementSystem) {
    const transportGoodsData = generateTransportGoodsData(seed);
    await enquiry.fillTransportGoodsRows(transportGoodsData.pickup, transportGoodsData.delivery);
    if (scenario.shipmentMode !== 'Air') {
      const transportContainerData = generateTransportContainerData(seed);
      await enquiry.fillTransportContainerRows(transportContainerData.pickup, transportContainerData.delivery);
    }
  }
  await enquiry.uploadDocument('AIRWAY BILL', ENQUIRY_UPLOAD_FILES.primary);
  await enquiry.submitAndExpectSuccess();
  await enquiry.verifyEnquiryInListing(customerData.customerName, data.shipmentMode, 'Enquiry Created');

  const enquiryNo = (
    await enquiry.getRowByCustomerName(customerData.customerName).locator(':scope > div').first().innerText()
  ).trim();

  return { data, enquiryNo };
}

/**
 * Runs the complete Quotation workflow for one already-created Enquiry: Initiate Quote -> Customer
 * Information -> Product Information -> Quote (Vendor selection) -> Origin/International/
 * Destination Buy Rate entries -> Summary -> Upload File -> Update -> View -> Back -> Initiate
 * Pricing. On any failure, prints the exact diagnostic block requested and rethrows so Playwright
 * still marks the test failed.
 */
async function processScenarioQuotation(
  page: Page,
  enquiry: EnquiryPage,
  quotation: QuotationPage,
  customerData: { customerName: string },
  vendorData: { vendorName: string },
  scenario: EnquiryScenario,
  seed: number
) {
  const { data: enquiryData, enquiryNo } = await createScenarioEnquiry(enquiry, customerData, scenario, seed);
  const quotationData = generateQuotationData(seed);
  let currentScreen = 'Enquiry';
  let currentOperation = 'Create Enquiry';

  try {
    currentScreen = 'Enquiry List';
    currentOperation = 'Initiate Quote';
    await enquiry.navigateFromSidebar();
    await enquiry.initiateQuote(customerData.customerName, true);
    await captureScreenshot(page, 'quotation', 'initiate-quote-success', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - Customer Information';
    currentOperation = 'Open Quotation and verify Customer Information';
    await quotation.editQuotationByCustomerName(customerData.customerName);
    await quotation.verifyHeaderFields(enquiryNo);
    await quotation.verifyCustomerInformation(customerData.customerName);

    currentScreen = 'Quotation - Product Information';
    currentOperation = 'Verify Product Information';
    await quotation.verifyProductInformation({
      shipmentMode: enquiryData.shipmentMode,
      shipmentDirection: enquiryData.shipmentDirection,
      shipmentType: enquiryData.shipmentType,
      businessType: enquiryData.businessType,
    });

    currentScreen = 'Quotation - Quote (Vendor)';
    currentOperation = 'Select existing Vendor for the selected services';
    await quotation.selectVendorsForServices(scenario.services, vendorData.vendorName);

    currentScreen = 'Quotation - Origin';
    currentOperation = `Add ${quotationData.origin.length} Origin entries`;
    await quotation.addBuyRateEntries('Origin', quotationData.origin);
    await quotation.expectBuyRateRowCount('Origin', quotationData.origin.length);
    await captureScreenshot(page, 'quotation', 'origin-entries', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - International';
    currentOperation = `Add ${quotationData.international.length} International entries`;
    await quotation.addBuyRateEntries('International', quotationData.international);
    await quotation.expectBuyRateRowCount('International', quotationData.international.length);
    await captureScreenshot(page, 'quotation', 'international-entries', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - Destination';
    currentOperation = `Add ${quotationData.destination.length} Destination entries`;
    await quotation.addBuyRateEntries('Destination', quotationData.destination);
    await quotation.expectBuyRateRowCount('Destination', quotationData.destination.length);
    await captureScreenshot(page, 'quotation', 'destination-entries', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - Summary';
    currentOperation = 'Verify Summary total against the real Buy Rate x Quantity x Exchange Rate formula';
    // All Origin/International/Destination entries share one Buy Currency (generateBuyRateEntries'
    // default) specifically so the real Exchange Rate the app assigned to it - read back from any
    // one saved row - can be used to compute the expected grand total, rather than assuming a value.
    const { exchangeRate } = await quotation.getChargeRowValues('Origin');
    const allEntries = [...quotationData.origin, ...quotationData.international, ...quotationData.destination];
    const expectedTotalCost = allEntries.reduce((sum, e) => sum + Number(e.buyRate) * Number(e.quantity), 0) * exchangeRate;
    const actualTotalCost = await quotation.getSummaryTotalCost();
    expect(actualTotalCost, 'Summary Total Cost should equal Sum(Buy Rate x Quantity) x Exchange Rate').toBeCloseTo(expectedTotalCost, 1);
    await captureScreenshot(page, 'quotation', 'summary', `${scenario.combination}-${enquiryNo}`);

    if (QUOTATION_UPLOAD_ENABLED) {
      currentScreen = 'Quotation - Upload File';
      currentOperation = `Upload ${quotationData.uploadFiles.length} configured file(s)`;
      await quotation.uploadDocuments('AIRWAY BILL', quotationData.uploadFiles);
      await quotation.expectUploadedFileNames(quotationData.uploadFiles.map((f) => path.basename(f)));
      await captureScreenshot(page, 'quotation', 'upload-file', `${scenario.combination}-${enquiryNo}`);
    }

    currentScreen = 'Quotation - Update';
    currentOperation = 'Submit Update';
    await quotation.submitUpdateAndExpectSuccess();
    await quotation.expectQuoteStatus(customerData.customerName, 'Quote Generated');
    await captureScreenshot(page, 'quotation', 'update-success', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - View';
    currentOperation = 'Open View and verify persisted data';
    await quotation.viewQuotationByCustomerName(customerData.customerName);
    await quotation.verifyViewFormFields(enquiryNo, customerData.customerName);
    await quotation.verifyProductInformation({
      shipmentMode: enquiryData.shipmentMode,
      shipmentDirection: enquiryData.shipmentDirection,
      shipmentType: enquiryData.shipmentType,
      businessType: enquiryData.businessType,
    });
    await quotation.expectBuyRateRowCount('Origin', quotationData.origin.length);
    await quotation.expectBuyRateRowCount('International', quotationData.international.length);
    await quotation.expectBuyRateRowCount('Destination', quotationData.destination.length);
    if (QUOTATION_UPLOAD_ENABLED) {
      await quotation.expectUploadedFileNames(quotationData.uploadFiles.map((f) => path.basename(f)));
    }
    await captureScreenshot(page, 'quotation', 'view-success', `${scenario.combination}-${enquiryNo}`);

    currentScreen = 'Quotation - Back to Listing';
    currentOperation = 'Return to Quotation listing';
    await quotation.returnToListingFromView();

    currentScreen = 'Quotation List';
    currentOperation = 'Initiate Pricing';
    await quotation.initiatePricing(customerData.customerName, true);
    await captureScreenshot(page, 'quotation', 'initiate-pricing-success', `${scenario.combination}-${enquiryNo}`);
  } catch (error) {
    await captureScreenshot(page, 'quotation', 'scenario-failure', `${scenario.combination}-${enquiryNo}`);
    throw new Error(
      `Quotation failed\n` +
        `Enquiry: ${enquiryNo}\n` +
        `Service: ${scenario.name}\n` +
        `Shipment Mode: ${scenario.shipmentMode}\n` +
        `Shipment Direction: ${scenario.shipmentDirection}\n` +
        `Screen: ${currentScreen}\n` +
        `Operation: ${currentOperation}\n` +
        `Error:\n${(error as Error).message}`
    );
  }
}

test.describe('Quotation Generation - Full Workflow', () => {
  test('One Customer, one Vendor, one session: each of the 4 required Enquiry combinations (FF+CB, CB+TMS, FF+TMS, FF+CB+TMS) is fully processed through Quotation Generation to Initiate Pricing', async ({ page }) => {
    // Four full Enquiry creations plus four full Quotation workflows (each with up to 15 Buy Rate
    // entries and multiple file uploads) genuinely need more than the shared 100s default
    // (playwright.config.ts) - overridden here only, not raised globally for every other suite.
    test.setTimeout(1_800_000);

    await loginOnce(page);
    const customerData = await createApprovedCustomer(page, 9900);
    const vendorData = await createApprovedVendor(page, 9900);

    const enquiry = new EnquiryPage(page);
    const quotation = new QuotationPage(page);

    for (let i = 0; i < ENQUIRY_SCENARIOS.length; i++) {
      const scenario = ENQUIRY_SCENARIOS[i];
      const seed = 9910 + i * 100;
      await processScenarioQuotation(page, enquiry, quotation, customerData, vendorData, scenario, seed);
    }
  });
});

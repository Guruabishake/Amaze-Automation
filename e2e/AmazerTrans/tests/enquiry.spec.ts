import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { EnquiryPage } from '../pages/EnquiryPage';
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
  ENQUIRY_SCENARIOS,
  EnquiryScenario,
  ENQUIRY_UPLOAD_FILES,
} from '../utils/testData';
import { captureScreenshot } from '../utils/screenshot';

/**
 * Enquiry (CRM -> Sales Management -> Enquiry) is the entry point of the Sales Management
 * pipeline (Enquiry -> Quotation -> Pricing -> Quote Approval -> Confirm Order -> Combined Job ->
 * Contract) and is directly dependent on Customer Management - confirmed live via a real
 * "Customer Id" searchable dropdown wired to actual Customer records, scoped to Approved
 * customers only (a real business rule, confirmed live).
 *
 * Only 4 Service combinations are supported anywhere in this spec - FF+CB, CB+TMS, FF+TMS and
 * FF+CB+TMS - no single-service Enquiry and no other combination is ever created. Every Enquiry
 * created here reuses one of `ENQUIRY_SCENARIOS` (see testData.ts) so the combination, Shipment
 * Direction and Shipment Mode are always one of the 4 required, real pairings.
 *
 * AmazerTrans only allows one active session per account, and every AmazerTrans spec logs in with
 * the same single account (`loginData`/.env) - `mode: 'serial'` below only orders tests within
 * this file. The cross-file guarantee against another spec's login racing this one in a parallel
 * worker is enforced by e2e/AmazerTrans/playwright.config.ts (workers: 1); always run via
 * `npx playwright test --config=e2e/AmazerTrans/playwright.config.ts`, not the root config.
 */
test.describe.configure({ mode: 'serial' });

/** Logs in with the shared credentials. Each Playwright test gets its own fresh page/context, so this is called once per test - never more than once within a single test/session. */
async function loginOnce(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();
}

/**
 * Assumes an already-logged-in `page`. Creates and approves ONE Customer using the complete
 * Basic+Contact+Bank+KYC+Document+Credit flow (not just a minimal stub). Confirmed live: Enquiry's
 * "Customer Id" search only returns Approved customers, so every Enquiry needs one of these.
 */
async function createApprovedCustomer(page: import('@playwright/test').Page, seed: number) {
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

/**
 * Assumes an already-logged-in `page`. Creates and approves ONE Vendor with complete
 * Basic+Contact+Bank+Document+Credit data (mirrors `createApprovedCustomer`).
 */
async function createApprovedVendor(page: import('@playwright/test').Page, seed: number) {
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

/** Logs in, then creates one Approved Customer - used by every ancillary (non-combination-workflow) test below, each of which gets its own fresh Playwright page/context and so needs its own login. */
async function loginAndCreateApprovedCustomer(page: import('@playwright/test').Page, seed: number) {
  await loginOnce(page);
  return createApprovedCustomer(page, seed);
}

/**
 * Runs ONE complete Enquiry Create for a given `EnquiryScenario`: navigates to the Enquiry List
 * (the required control point for every new Enquiry), selects exactly that scenario's services
 * together in a single Enquiry, fills Product Information and Mode-appropriate Cargo, fills
 * Transport rows when Transport Management System is enabled, uploads a document, saves, and
 * verifies. This is the single building block reused both by the 4-combination workflow test and
 * by every ancillary test that needs one real Enquiry to exist.
 */
async function createScenarioEnquiry(
  enquiry: EnquiryPage,
  customerData: { customerName: string },
  vendorData: { vendorName: string } | undefined,
  scenario: EnquiryScenario,
  seed: number
) {
  const data = generateEnquiryScenarioData(seed, scenario);
  const serviceNames: string[] = [];
  if (scenario.services.freightForwarding) serviceNames.push('Freight-Forwarding');
  if (scenario.services.customsBroker) serviceNames.push('Customs Broker');
  if (scenario.services.transportManagementSystem) serviceNames.push('Transport Management System');

  try {
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.fillCustomerInformation(customerData.customerName, data.sourceOfEnquiry);
    await enquiry.fillVisibleServiceFields(scenario, data);
    // Confirmed live: Cargo's own field set (Volume In MT vs container fields) is driven by
    // Shipment Mode alone - generateEnquiryScenarioData already branches on scenario.shipmentMode.
    await enquiry.addCargoItem(data.cargo);
    // Confirmed live: the Transport-Goods Pickup/Delivery rows only exist once Cargo is added
    // (they are auto-seeded from it), so this must run after addCargoItem.
    if (scenario.services.transportManagementSystem) {
      const transportGoodsData = generateTransportGoodsData(seed);
      await enquiry.fillTransportGoodsRows(transportGoodsData.pickup, transportGoodsData.delivery);
      // Confirmed live: Container Pickup/Delivery are additionally checked by default only when
      // Shipment Mode is Sea (never Air).
      if (scenario.shipmentMode !== 'Air') {
        const transportContainerData = generateTransportContainerData(seed);
        await enquiry.fillTransportContainerRows(transportContainerData.pickup, transportContainerData.delivery);
      }
    }
    await enquiry.uploadDocument('AIRWAY BILL', ENQUIRY_UPLOAD_FILES.primary);
    await enquiry.submitAndExpectSuccess();

    await enquiry.verifyEnquiryInListing(customerData.customerName, data.shipmentMode, 'Enquiry Created');
    await captureScreenshot(enquiry.page, 'enquiry', 'scenario-create-success', `${scenario.combination}-${customerData.customerName}`);
  } catch (error) {
    await captureScreenshot(enquiry.page, 'enquiry', 'scenario-create-failure', `${scenario.combination}-${customerData.customerName}`);
    throw new Error(
      `Configuration-driven Enquiry failed.\n` +
        `Scenario: ${scenario.name}\n` +
        `Services:\n${serviceNames.map((s) => `- ${s}`).join('\n')}\n` +
        `Shipment Direction: ${scenario.shipmentDirection}\n` +
        `Shipment Mode: ${scenario.shipmentMode}\n` +
        `Customer: ${customerData.customerName}\n` +
        `Vendor: ${vendorData?.vendorName ?? '(none created for this test)'}\n` +
        `Error:\n${(error as Error).message}`
    );
  }

  return { data, serviceNames };
}

/**
 * Logs in, creates one Approved Customer, and creates one real Enquiry using the `FF + CB`
 * scenario (the first of the 4 required combinations) - the shared setup for every ancillary
 * (Filter/Pagination, Edit & Update, View, Initiate Quote) test below, so none of them ever create
 * a single-service Enquiry.
 */
async function createEnquiryForLifecycleTests(page: import('@playwright/test').Page, enquiry: EnquiryPage, seed: number) {
  const customerData = await loginAndCreateApprovedCustomer(page, seed);
  const { data } = await createScenarioEnquiry(enquiry, customerData, undefined, ENQUIRY_SCENARIOS[0], seed);
  return { customerData, enquiryData: data };
}

test.describe('Enquiry - Service Combination Workflows', () => {
  test('Creates exactly ONE Customer, ONE Vendor and FOUR Enquiries (FF+CB, CB+TMS, FF+TMS, FF+CB+TMS) in a single login session', async ({ page }) => {
    // One Customer (full KYC flow) + one Vendor (full KYC flow) + 4 complete Enquiry Creates
    // (Product Info + Cargo + conditional Transport rows + upload) all in one test genuinely
    // needs more than the shared 100s default (playwright.config.ts) - overridden here only,
    // rather than raising the global default for every other suite.
    test.setTimeout(360_000);
    await loginOnce(page);

    const customerData = await createApprovedCustomer(page, 9800);
    const vendorData = await createApprovedVendor(page, 9800);
    const enquiry = new EnquiryPage(page);

    for (let i = 0; i < ENQUIRY_SCENARIOS.length; i++) {
      const scenario = ENQUIRY_SCENARIOS[i];
      await createScenarioEnquiry(enquiry, customerData, vendorData, scenario, 9810 + i);
      // Explicit control-point check: every completed Enquiry must return to the Enquiry List
      // before the next scenario starts (createScenarioEnquiry's submitAndExpectSuccess already
      // lands there, but this asserts it rather than assuming it).
      await expect(enquiry.pageHeading).toBeVisible();
    }

    // Exactly 4 Enquiries were created for this one Customer - none more, none fewer.
    await enquiry.openFilterPanel();
    await enquiry.applyFilter({ customerName: customerData.customerName });
    await enquiry.expectFilteredResultCount(ENQUIRY_SCENARIOS.length);
    await enquiry.resetFilter();
  });
});

test.describe('Enquiry - Validation', () => {
  test('Negative: submitting a completely empty form shows every baseline required-field message', async ({ page }) => {
    await loginOnce(page);

    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();

    await enquiry.submitAndExpectValidationErrors(
      'At least one service must be selected.',
      'Customer ID is required.',
      'Source of Enquiry is required.'
    );
  });

  test('Negative: selecting a Service combination (FF + CB) without Product Information fields shows the shared required messages', async ({ page }) => {
    const customerData = await loginAndCreateApprovedCustomer(page, 9601);
    const enquiry = new EnquiryPage(page);

    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.selectServices(['Freight-Forwarding', 'Customs Broker']);
    await enquiry.fillCustomerInformation(customerData.customerName, 'Mail');

    await enquiry.submitAndExpectValidationErrors(
      'Shipment Mode is required.',
      'Shipment Direction is required.',
      'Business Type is required.',
      'This field is required for Freight Forwarding.'
    );
  });

  test('Negative: completing Customer and Product Information without adding a Cargo item is rejected', async ({ page }) => {
    const customerData = await loginAndCreateApprovedCustomer(page, 9602);
    const scenario = ENQUIRY_SCENARIOS[0];
    const enquiryData = generateEnquiryScenarioData(9602, scenario);
    const enquiry = new EnquiryPage(page);

    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.fillCustomerInformation(customerData.customerName, enquiryData.sourceOfEnquiry);
    await enquiry.fillVisibleServiceFields(scenario, enquiryData);

    await enquiry.submitAndExpectValidationErrors('At least one cargo item must be added.');
  });

  test('Cancel: discards the in-progress Create form and returns to the listing without creating an Enquiry', async ({ page }) => {
    const customerData = await loginAndCreateApprovedCustomer(page, 9603);
    const enquiry = new EnquiryPage(page);

    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.selectServices(['Freight-Forwarding', 'Customs Broker']);
    await enquiry.fillCustomerInformation(customerData.customerName, 'Mail');

    await enquiry.cancelCreateForm();
    await expect(enquiry.getRowByCustomerName(customerData.customerName)).toHaveCount(0);
  });

  test('File Upload: the app accepts any file extension - a .txt file uploads successfully (no client-side restriction exists)', async ({ page }) => {
    const customerData = await loginAndCreateApprovedCustomer(page, 9723);
    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.selectServices(['Freight-Forwarding', 'Customs Broker']);
    await enquiry.fillCustomerInformation(customerData.customerName, 'Mail');

    // Confirmed live: uploading a plain .txt file succeeds with the real "Document uploaded
    // successfully!" toast and a listed row - there is no file-extension validation to test here,
    // so this documents the real (permissive) behavior rather than inventing a rejection case.
    await enquiry.uploadDocument('AIRWAY BILL', ENQUIRY_UPLOAD_FILES.unsupported);
  });
});

test.describe('Enquiry - Filter & Pagination', () => {
  test('Filter: exact Customer Name filter returns only that record, Reset restores the unfiltered listing', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData } = await createEnquiryForLifecycleTests(page, enquiry, 9770);

    await enquiry.navigateFromSidebar();
    await enquiry.openFilterPanel();
    await enquiry.applyFilter({ customerName: customerData.customerName });
    await enquiry.expectFilteredResultCount(1);
    await expect(enquiry.getRowByCustomerName(customerData.customerName)).toBeVisible();

    await enquiry.resetFilter();
  });

  test('Filter: a non-existing Customer Name shows the real no-results message', async ({ page }) => {
    await loginOnce(page);

    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openFilterPanel();
    await enquiry.applyFilter({ customerName: 'No Such Customer QA XYZ999' });
    await expect(page.getByText('No data matches your filter criteria.', { exact: true })).toBeVisible();
  });

  test('Pagination: Next/Previous navigate between real pages of records', async ({ page }) => {
    await loginOnce(page);

    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    const lastPage = await enquiry.getLastPageNumber();
    expect(lastPage).toBeGreaterThan(1);

    await enquiry.goToNextPage();
    await enquiry.expectCurrentPage(2);
    await enquiry.goToPreviousPage();
    await enquiry.expectCurrentPage(1);
  });
});

test.describe('Enquiry - Edit & Update', () => {
  test('Update: modifies Source of Enquiry, the change is reflected on View afterward', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData, enquiryData } = await createEnquiryForLifecycleTests(page, enquiry, 9730);
    const updatedSource = 'Website';

    try {
      await enquiry.navigateFromSidebar();
      await enquiry.editEnquiryByCustomerName(customerData.customerName);
      await enquiry.verifyUpdateFormPrefilled(customerData.customerName, enquiryData);
      await enquiry.fillUpdateSourceOfEnquiry(updatedSource);
      await enquiry.submitUpdateAndExpectSuccess();
      await captureScreenshot(page, 'enquiry', 'update-success', customerData.customerName);

      await enquiry.viewEnquiryByCustomerName(customerData.customerName);
      await enquiry.verifyViewFormFields(customerData.customerName, updatedSource);
      await enquiry.returnToListingFromView();
    } catch (error) {
      await captureScreenshot(page, 'enquiry', 'update-failure', customerData.customerName);
      throw new Error(`Enquiry update failed for customer "${customerData.customerName}": ${(error as Error).message}`);
    }
  });

  test('Update Cancel: an edited Source of Enquiry is discarded and the original value remains', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData, enquiryData } = await createEnquiryForLifecycleTests(page, enquiry, 9731);

    await enquiry.navigateFromSidebar();
    await enquiry.editEnquiryByCustomerName(customerData.customerName);
    await enquiry.fillUpdateSourceOfEnquiry('ShouldNotPersist');
    await enquiry.cancelUpdateForm();

    await enquiry.viewEnquiryByCustomerName(customerData.customerName);
    await enquiry.verifyViewFormFields(customerData.customerName, enquiryData.sourceOfEnquiry);
    await enquiry.returnToListingFromView();
  });

  test('Update Negative: clearing Source of Enquiry on Update shows the same required-field message as Create', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData } = await createEnquiryForLifecycleTests(page, enquiry, 9732);

    await enquiry.navigateFromSidebar();
    await enquiry.editEnquiryByCustomerName(customerData.customerName);
    await enquiry.fillUpdateSourceOfEnquiry('');
    await enquiry.submitUpdateAndExpectValidationErrors('Source of Enquiry is required.');
  });
});

test.describe('Enquiry - View', () => {
  test('View: displays the record\'s real data read-only, then Back returns to the listing', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData, enquiryData } = await createEnquiryForLifecycleTests(page, enquiry, 9740);

    try {
      await enquiry.navigateFromSidebar();
      await enquiry.viewEnquiryByCustomerName(customerData.customerName);
      await enquiry.verifyViewFormFields(customerData.customerName, enquiryData.sourceOfEnquiry);
      await captureScreenshot(page, 'enquiry', 'view', customerData.customerName);

      await enquiry.returnToListingFromView();
      await expect(enquiry.getRowByCustomerName(customerData.customerName)).toBeVisible();
    } catch (error) {
      await captureScreenshot(page, 'enquiry', 'view-failure', customerData.customerName);
      throw new Error(`Enquiry view failed for customer "${customerData.customerName}": ${(error as Error).message}`);
    }
  });
});

test.describe('Enquiry - Initiate Quote', () => {
  test('Initiate Quote: accepting the native confirmation navigates to Quotation Generation and immediately sets the Enquiry to Quote Initiated', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData } = await createEnquiryForLifecycleTests(page, enquiry, 9750);

    try {
      await enquiry.navigateFromSidebar();
      await enquiry.initiateQuote(customerData.customerName, true);
      await captureScreenshot(page, 'enquiry', 'initiate-quote-success', customerData.customerName);

      // Confirmed live: the status flip and a real Quote No. both exist immediately after
      // confirming - before any data is entered on the Quotation Generation page itself - so this
      // is a real, already-committed state change, not merely a pending draft.
      await enquiry.navigateFromSidebar();
      await enquiry.expectEnquiryStatus(customerData.customerName, 'Quote Initiated');
      await enquiry.expectEditDisabled(customerData.customerName);
    } catch (error) {
      await captureScreenshot(page, 'enquiry', 'initiate-quote-failure', customerData.customerName);
      throw new Error(`Initiate Quote failed for customer "${customerData.customerName}": ${(error as Error).message}`);
    }
  });

  test('Initiate Quote Cancel: dismissing the native confirmation leaves the Enquiry unchanged', async ({ page }) => {
    const enquiry = new EnquiryPage(page);
    const { customerData } = await createEnquiryForLifecycleTests(page, enquiry, 9751);

    await enquiry.navigateFromSidebar();
    await enquiry.initiateQuote(customerData.customerName, false);
    await enquiry.expectEnquiryStatus(customerData.customerName, 'Enquiry Created');
  });
});

test.describe('Enquiry - Complete Lifecycle', () => {
  test('FF + CB + TMS: Create -> Edit -> Update -> View -> Initiate Quote, single browser session throughout', async ({ page }) => {
    const customerData = await loginAndCreateApprovedCustomer(page, 9760);
    const enquiry = new EnquiryPage(page);
    const scenario = ENQUIRY_SCENARIOS[3]; // FF + CB + TMS - the richest combination

    const { data: enquiryData } = await createScenarioEnquiry(enquiry, customerData, undefined, scenario, 9760);

    try {
      await enquiry.editEnquiryByCustomerName(customerData.customerName);
      await enquiry.verifyUpdateFormPrefilled(customerData.customerName, enquiryData);
      await enquiry.fillUpdateSourceOfEnquiry('Website');
      // A second Upload File call on the same Document Type: confirmed live there is no dedicated
      // single-slot "replace" affordance - it adds a second row rather than replacing the first.
      await enquiry.uploadDocument('AIRWAY BILL', ENQUIRY_UPLOAD_FILES.replacement);
      await enquiry.submitUpdateAndExpectSuccess();

      await enquiry.viewEnquiryByCustomerName(customerData.customerName);
      await enquiry.verifyViewFormFields(customerData.customerName, 'Website');
      await enquiry.returnToListingFromView();

      // Confirmed live: accepting navigates to the separate Quotation Generation module rather
      // than flipping status in place - completing a quotation there is out of scope for Enquiry
      // Management, so the lifecycle ends at the confirmed navigation.
      await enquiry.initiateQuote(customerData.customerName, true);
      await captureScreenshot(page, 'enquiry', 'lifecycle-success', customerData.customerName);
    } catch (error) {
      await captureScreenshot(page, 'enquiry', 'lifecycle-failure', customerData.customerName);
      throw new Error(`FF + CB + TMS complete lifecycle failed for customer "${customerData.customerName}": ${(error as Error).message}`);
    }
  });
});

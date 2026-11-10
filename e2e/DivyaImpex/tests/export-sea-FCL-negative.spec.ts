import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { EnquiryPage, TRANSPORT_TASKS } from '../pages/EnquiryPage';
import { readToast, selectCustomDropdown } from '../utils/commonActions';
import { captureEvidence, log } from '../utils/screenshot';
import { loginData, generateCargoData, uploadData } from '../utils/testData';

/**
 * Independent UI validation tests for the DivyaImpex Export Sea FCL flow. Every expected message
 * below was observed on the live app first (not assumed). Only the last test creates data (one
 * minimal enquiry, needed to exercise Initiate Quote -> Cancel); every other test stops before Create.
 */
test.describe.configure({ mode: 'serial' });

const REQUIRED_TOAST = 'Please fill in all the required fields.';

async function loginAs(page: Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess(loginData.branch);
}

/** Opens Create Enquiry with an approved customer and Sea/Export/FCL already set. */
async function openEnquiryWithCustomerAndShipment(page: Page): Promise<EnquiryPage> {
  await loginAs(page);
  const enquiry = new EnquiryPage(page);
  await enquiry.navigateFromSidebar();
  await enquiry.openCreateForm();
  const options = await enquiry.customerIdOptions();
  expect(options.length, 'At least one approved customer must exist').toBeGreaterThan(0);
  await enquiry.selectCustomer(options[0].replace(/\s*\[.*$/, ''));
  await enquiry.setShipment('Sea', 'Export', 'FCL');
  return enquiry;
}

test.describe('Login validation', () => {
  test('unknown user is rejected', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto(loginData.url);
    // An unknown account is used deliberately - repeated wrong passwords on the real account could lock it.
    await login.login('qa.unknown.user@example.com', 'not-a-real-password', loginData.branch);
    await expect(page.getByText('Invalid credentials or inactive user.')).toBeVisible();
    await expect(page).toHaveURL(/\/login\/DIVYAIMPEX/);
  });

  test('login without a branch is blocked by native validation', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto(loginData.url);
    await login.usernameInput.fill(loginData.username);
    await login.passwordInput.fill(loginData.password);
    await login.loginButton.click();
    expect(await login.branchDropdown.evaluate((el: HTMLSelectElement) => el.checkValidity())).toBe(false);
    expect(await login.branchDropdown.evaluate((el: HTMLSelectElement) => el.validationMessage)).toBe('Please select an item in the list.');
    await expect(page).toHaveURL(/\/login\/DIVYAIMPEX/);
  });
});

test.describe('Customer / Vendor required fields', () => {
  test('Create Customer with an empty form shows every required-field message', async ({ page }) => {
    await loginAs(page);
    const customers = new CustomerPage(page);
    await customers.navigateFromSidebar();
    await customers.openCreateForm();
    await customers.submitAndExpectValidationErrors([
      'Customer Name is required.',
      'Customer Type is required.',
      'Address 1 is required.',
      'Country is required.',
      'State is required.',
      'City is required.',
      'Phone Number is required.',
      'Email Address is required.',
    ]);
  });

  test('Create Vendor with an empty form shows every required-field message', async ({ page }) => {
    await loginAs(page);
    const vendors = new VendorPage(page);
    await vendors.navigateFromSidebar();
    await vendors.openCreateForm();
    await vendors.submitAndExpectValidationErrors([
      'Vendor Name is required.',
      'Vendor Type is required.',
      'Address 1 is required.',
      'Country is required.',
      'State is required.',
      'City is required.',
      'Phone Number is required.',
    ]);
  });
});

test.describe('Enquiry validation', () => {
  test('Create with no customer selected is blocked', async ({ page }) => {
    await loginAs(page);
    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.submitButton.click();
    expect(await readToast(page)).toContain(REQUIRED_TOAST);
    await expect(page.getByText('Customer ID is required.')).toBeVisible();
    await expect(enquiry.createFormHeading).toBeVisible();
  });

  test('Create with missing shipment selections is blocked', async ({ page }) => {
    await loginAs(page);
    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    const options = await enquiry.customerIdOptions();
    await enquiry.selectCustomer(options[0].replace(/\s*\[.*$/, ''));
    await enquiry.submitButton.click();
    expect(await readToast(page)).toContain(REQUIRED_TOAST);
    for (const message of ['Shipment Mode is required.', 'Shipment Direction is required.', 'Shipment Type is required.']) {
      await expect(page.getByText(message)).toBeVisible();
    }
    await expect(enquiry.createFormHeading).toBeVisible();
  });

  test('Create with no cargo is blocked', async ({ page }) => {
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    await expect(enquiry.cargoRows()).toHaveCount(0);
    await enquiry.submitButton.click();
    await expect(page.getByText('At least one cargo item must be added.')).toBeVisible();
    await expect(enquiry.createFormHeading).toBeVisible();
  });

  test('Cargo numeric fields reject invalid input (negative / non-numeric)', async ({ page }) => {
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    await enquiry.openTab('Cargo Information');
    await page.getByRole('button', { name: /add cargo/i }).click();
    const packages = page.getByRole('textbox', { name: 'No Of Packages', exact: true });
    const gross = page.getByRole('textbox', { name: 'Gross Wt', exact: true });
    await packages.fill('-5');
    await expect(packages).toHaveValue('5'); // the minus sign is stripped on input
    await gross.fill('abc');
    await expect(gross).toHaveValue(''); // letters are rejected on input
  });

  test('KNOWN DEFECT: an empty Add Cargo popup can be saved as a blank cargo row', async ({ page }) => {
    test.info().annotations.push({ type: 'defect', description: 'Add Cargo "Save" accepts an empty form and adds a row of "--" values (observed 2026-10-14).' });
    test.fail(true, 'Known app defect: Add Cargo has no required-field validation.');
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    await enquiry.openTab('Cargo Information');
    await page.getByRole('button', { name: /add cargo/i }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await captureEvidence(page, test.info(), 'defect-empty-cargo-saved');
    await expect(enquiry.cargoRows(), 'An empty cargo should not be added').toHaveCount(0, { timeout: 5000 });
  });

  test('KNOWN DEFECT: Net Wt greater than Gross Wt is accepted', async ({ page }) => {
    test.info().annotations.push({ type: 'defect', description: 'Add Cargo accepts Net Wt (500) > Gross Wt (100) (observed 2026-10-14).' });
    test.fail(true, 'Known app defect: no Gross >= Net weight validation.');
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    const cargo = { ...generateCargoData(1)[0], grossWt: '100', netWt: '500' };
    await enquiry.openTab('Cargo Information');
    await page.getByRole('button', { name: /add cargo/i }).click();
    await page.getByRole('textbox', { name: 'Container No', exact: true }).fill(cargo.containerNo);
    await selectCustomDropdown(page, 'Size Of Container', cargo.containerSize);
    await selectCustomDropdown(page, 'Type Of Container', cargo.containerType);
    await page.getByRole('combobox', { name: 'Cargo Name' }).fill(cargo.cargoName);
    await page.getByRole('textbox', { name: 'No Of Packages', exact: true }).click();
    await page.getByRole('textbox', { name: 'No Of Packages', exact: true }).fill(cargo.noOfPackages);
    await page.getByRole('textbox', { name: 'Gross Wt', exact: true }).fill(cargo.grossWt);
    await page.getByRole('textbox', { name: 'Net Wt', exact: true }).fill(cargo.netWt);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await captureEvidence(page, test.info(), 'defect-net-greater-than-gross');
    await expect(enquiry.cargoRows(), 'Net > Gross cargo should be rejected').toHaveCount(0, { timeout: 5000 });
  });

  test('Create with transport rows left empty is blocked', async ({ page }) => {
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    await enquiry.selectAllTransportServices();
    await enquiry.addCargo(generateCargoData(1)[0]);
    await enquiry.submitButton.click();
    expect(await readToast(page)).toContain(REQUIRED_TOAST);
    await expect(page.getByText('At least one Goods Pickup row is required.')).toBeVisible();
    await expect(enquiry.createFormHeading).toBeVisible();
  });

  test('Upload without document type or file is blocked', async ({ page }) => {
    await loginAs(page);
    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    await enquiry.openCreateForm();
    await enquiry.openTab('Upload File');
    const rows = enquiry.uploadTable().locator('tbody tr').filter({ hasNotText: 'No data available' });

    await page.getByRole('button', { name: 'Upload', exact: true }).click(); // neither selected
    expect(await readToast(page)).toContain('Please select a document type and choose a file.');
    await expect(rows).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles(uploadData.filePath); // file but no document type
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    expect(await readToast(page)).toContain('Please select a document type and choose a file.');
    await expect(rows).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles([]); // document type but no file
    await selectCustomDropdown(page, 'Document Type', uploadData.documentType);
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    expect(await readToast(page)).toContain('Please select a document type and choose a file.');
    await expect(rows).toHaveCount(0);
  });
});

test.describe('Record protection and Initiate Quote cancel', () => {
  test('Quote Initiated enquiries cannot be edited or quoted again', async ({ page }) => {
    await loginAs(page);
    const enquiry = new EnquiryPage(page);
    await enquiry.navigateFromSidebar();
    const row = page.locator('div[style*="grid-template-columns"]').filter({ hasText: 'Quote Initiated' }).filter({ hasText: /ENQUIRY-\d+/ }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: /Edit disabled/ })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Quote Initiated', exact: true })).toBeDisabled();
  });

  test('Initiate Quote -> Cancel leaves the enquiry unchanged (also: Assigned To is optional)', async ({ page }) => {
    const enquiry = await openEnquiryWithCustomerAndShipment(page);
    await enquiry.openTab('Customer Information');
    const customerName = await page.getByRole('textbox', { name: 'Customer Name', exact: true }).inputValue();
    await enquiry.selectAllTransportServices();
    await enquiry.addCargo(generateCargoData(1)[0]);
    // Observed behaviour: Create succeeds without an "Assigned To" selection - only the task rows are required.
    for (const task of TRANSPORT_TASKS) {
      await enquiry.updateTransportTask(task, { location: 'QA Negative Location', address: 'QA Negative Address', date: '2026-12-01', stuffing: 'Factory', stuffingLocation: 'QA Dock' });
    }
    await enquiry.submitCreate();
    const enquiryNo = await enquiry.enquiryNoForCustomer(customerName);
    log(`negative-suite enquiry created without Assigned To: ${enquiryNo}`);
    await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText('Enquiry Created');

    const message = await enquiry.initiateQuote(enquiryNo, false);
    expect(message).toContain(`Do you want to initiate a quote for Enquiry No: ${enquiryNo}`);
    await expect(page).toHaveURL(/\/crm\/enquiry/);
    await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText('Enquiry Created');
    await expect(enquiry.rowByEnquiryNo(enquiryNo).getByRole('button', { name: 'Edit', exact: true })).toBeEnabled();
    await captureEvidence(page, test.info(), 'initiate-quote-cancelled');
  });
});

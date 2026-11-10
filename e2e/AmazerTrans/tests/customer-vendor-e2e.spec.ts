import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { captureScreenshot } from '../utils/screenshot';
import { loginData, generateCustomerData, generateVendorData } from '../utils/testData';

/**
 * Cross-functional lifecycle validation. Every individual feature exercised here (Create, Edit,
 * Update, Cancel, View, Back, Filter, Reset, Pagination, Approve, Reject) is already covered in
 * isolation by customer.spec.ts / vendor.spec.ts (41/41 + 41/41 passing) - this file does NOT
 * repeat that coverage. Its only job is to prove the *interaction* between those operations: that
 * the same record's data stays consistent as it moves through the full real business lifecycle,
 * and that the two confirmed-live state-machine rules (Approved is terminal, Rejected is not)
 * hold up across a realistic end-to-end journey rather than an isolated single action.
 *
 * Each workflow below is its own test (not one mega-test spanning Customer+Vendor) - this matches
 * the existing framework's proven convention (every test in customer.spec.ts/vendor.spec.ts logs
 * in independently) and keeps failures isolated and diagnosable, per this phase's own Test
 * Isolation requirement. "Session management" here means: no workflow performs more logins than
 * its own one `loginAndOpen...Management()` call - not that unrelated workflows must share a session.
 */

async function loginAndOpenCustomerManagement(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();

  const customer = new CustomerPage(page);
  await customer.navigateFromSidebar();
  return customer;
}

async function loginAndOpenVendorManagement(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();

  const vendor = new VendorPage(page);
  await vendor.navigateFromSidebar();
  return vendor;
}

// AmazerTrans only allows one active session per account (confirmed on the live app). `mode:
// 'serial'` only orders tests within this file - the cross-file guarantee against running another
// AmazerTrans spec's login in a parallel worker at the same time is enforced by
// e2e/AmazerTrans/playwright.config.ts (workers: 1). Always run via
// `npx playwright test --config=e2e/AmazerTrans/playwright.config.ts`, not the root config.
test.describe.configure({ mode: 'serial' });

test.describe('Customer End-to-End Workflow', () => {
  test('Complete Customer Lifecycle: Create -> Edit -> Update -> View -> Back -> Filter -> Reset -> Pagination -> Approve -> View again', async ({
    page,
  }) => {
    const customer = await loginAndOpenCustomerManagement(page);
    const original = generateCustomerData(9950);

    try {
      // ---- Create ----
      await customer.openCreateForm();
      await customer.fillBasicDetails(original);
      await customer.submitAndExpectSuccess();
      await customer.verifyCustomerInListing(original.customerName);
      await captureScreenshot(page, 'customer', 'e2e-create', original.customerName);

      // ---- Edit -> Update ----
      // Confirmed live (this phase): the City field also strips digits in real time, same
      // sanitize-on-input pattern already known for Phone/Customer Name - so the update value
      // avoids digits entirely.
      const updated = {
        ...original,
        customerName: `${original.customerName} Updated`,
        city: 'Coimbatore Lifecycle Updated',
      };
      await customer.editCustomerByName(original.customerName);
      await customer.verifyUpdateFormFields(original);
      await customer.fillBasicDetails({ customerName: updated.customerName, city: updated.city });
      await customer.submitUpdateAndExpectSuccess();
      await customer.verifyCustomerInListing(updated.customerName);
      await captureScreenshot(page, 'customer', 'e2e-update', updated.customerName);

      // ---- View -> verify updated data -> Back ----
      const expectedCustomerId = await customer.getCustomerIdFromListing(updated.customerName);
      await customer.viewCustomerByName(updated.customerName);
      await customer.verifyViewFormFields(updated, expectedCustomerId);
      await captureScreenshot(page, 'customer', 'e2e-view', updated.customerName);
      await customer.returnToListingFromView();

      // ---- Filter by the updated record -> verify -> Reset -> verify restored ----
      // Confirmed in the Filter phase: Approval Status is NOT a filter field (only Customer
      // Name/Email/PAN/Customer Type/Status are) - filtering by the updated name is the correct,
      // real way to relocate this record, not an invented "filter by approval status".
      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: updated.customerName });
      await customer.expectFilteredResultCount(1);
      expect(await customer.getVisibleCustomerNames()).toEqual([updated.customerName]);
      await customer.resetFilter();

      // ---- Pagination sanity, then re-locate the record via Filter rather than assuming it's
      // still on page 1 (a fresh filter search always lands on its own page 1, confirmed live) ----
      const lastPage = await customer.getLastPageNumber();
      if (lastPage > 1) {
        await customer.goToNextPage();
        await customer.expectCurrentPage(2);
        await customer.goToPreviousPage();
        await customer.expectCurrentPage(1);
      }
      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: updated.customerName });
      await customer.expectFilteredResultCount(1);

      // ---- Approve the exact (now uniquely filtered) record ----
      await customer.approveCustomerByName(updated.customerName);
      await customer.expectApprovalStatus(updated.customerName, 'Approved');
      await captureScreenshot(page, 'customer', 'e2e-approved', updated.customerName);

      // Confirmed terminal-state rule (Customer Approve phase): Approved replaces the row action
      // with a disabled "Approved" button - "Approve or Reject" is gone entirely.
      const approvedRow = customer.getRowByCustomerName(updated.customerName);
      await expect(approvedRow.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
      await expect(approvedRow.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);

      // ---- View again after approval: data must still be correct; Approval Status is
      // confirmed NOT present on View (listing-only signal), so it is not asserted here. ----
      await customer.viewCustomerByName(updated.customerName);
      await customer.verifyViewFormFields(updated, expectedCustomerId);
      await customer.returnToListingFromView();

      await customer.resetFilter();
    } catch (error) {
      await captureScreenshot(page, 'customer', 'e2e-failure', original.customerName);
      throw new Error(`Customer complete lifecycle failed for "${original.customerName}": ${(error as Error).message}`);
    }
  });

  test('Customer Reject -> Approve Lifecycle: asymmetric state transitions hold across a full journey', async ({
    page,
  }) => {
    const customer = await loginAndOpenCustomerManagement(page);
    const data = generateCustomerData(9951);

    await customer.openCreateForm();
    await customer.fillBasicDetails(data);
    await customer.submitAndExpectSuccess();
    await customer.expectApprovalStatus(data.customerName, 'Pending');

    await customer.rejectCustomerByName(data.customerName);
    await customer.expectApprovalStatus(data.customerName, 'Rejected');
    // Confirmed live: Rejected is NOT terminal - the action stays available.
    await expect(
      customer.getRowByCustomerName(data.customerName).getByRole('button', { name: 'Approve or Reject', exact: true })
    ).toBeEnabled();

    await customer.approveCustomerByName(data.customerName);
    await customer.expectApprovalStatus(data.customerName, 'Approved');

    const row = customer.getRowByCustomerName(data.customerName);
    await expect(row.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);
  });

  test.describe('Customer Cancel Workflows', () => {
    test('Update Cancel: an edited field is discarded and the original value remains in the listing', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9952);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.editCustomerByName(data.customerName);
      await customer.fillBasicDetails({ city: 'ShouldNotPersistE2E' });
      await customer.cancelUpdateForm();

      await customer.verifyCustomerInListing(data.customerName);
      await expect(customer.getRowByCustomerName(data.customerName)).toContainText(data.city);
    });

    test('Approval Cancel: closing the dialog after selecting a decision submits nothing', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9953);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.openApprovalDialog(data.customerName);
      await customer.selectApprovalDecision('Approve');
      await customer.closeApprovalDialogWithoutDeciding();

      await customer.expectApprovalStatus(data.customerName, 'Pending');
    });
  });
});

test.describe('Vendor End-to-End Workflow', () => {
  test('Complete Vendor Lifecycle: Create -> Edit -> Update -> View -> Back -> Filter -> Reset -> Pagination -> Approve -> View again', async ({
    page,
  }) => {
    const vendor = await loginAndOpenVendorManagement(page);
    const original = generateVendorData(9950);

    try {
      // ---- Create ----
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(original);
      await vendor.submitAndExpectSuccess();
      await vendor.verifyVendorInListing(original.vendorName);
      await captureScreenshot(page, 'vendor', 'e2e-create', original.vendorName);

      // ---- Edit -> Update ----
      // Confirmed live (this phase): the City field also strips digits in real time, same
      // sanitize-on-input pattern already known for Phone/Vendor Name - so the update value
      // avoids digits entirely.
      const updated = {
        ...original,
        vendorName: `${original.vendorName} Updated`,
        city: 'Erode Lifecycle Updated',
      };
      await vendor.editVendorByName(original.vendorName);
      await vendor.verifyUpdateFormFields(original);
      await vendor.fillBasicDetails({ vendorName: updated.vendorName, city: updated.city });
      await vendor.submitUpdateAndExpectSuccess();
      await vendor.verifyVendorInListing(updated.vendorName);
      await captureScreenshot(page, 'vendor', 'e2e-update', updated.vendorName);

      // ---- View -> verify updated data -> Back ----
      const expectedVendorId = await vendor.getVendorIdFromListing(updated.vendorName);
      await vendor.viewVendorByName(updated.vendorName);
      await vendor.verifyViewFormFields(updated, expectedVendorId);
      await captureScreenshot(page, 'vendor', 'e2e-view', updated.vendorName);
      await vendor.returnToListingFromView();

      // ---- Filter by the updated record -> verify -> Reset -> verify restored ----
      // Confirmed in the Vendor Filter phase: Approval Status is NOT a filter field - filtering
      // by the updated name is the correct, real way to relocate this record.
      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: updated.vendorName });
      await vendor.expectFilteredResultCount(1);
      expect(await vendor.getVisibleVendorNames()).toEqual([updated.vendorName]);
      await vendor.resetFilter();

      // ---- Pagination sanity, then re-locate the record via Filter rather than assuming it's
      // still on page 1 ----
      const lastPage = await vendor.getLastPageNumber();
      if (lastPage > 1) {
        await vendor.goToNextPage();
        await vendor.expectCurrentPage(2);
        await vendor.goToPreviousPage();
        await vendor.expectCurrentPage(1);
      }
      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: updated.vendorName });
      await vendor.expectFilteredResultCount(1);

      // ---- Approve the exact (now uniquely filtered) record ----
      await vendor.approveVendorByName(updated.vendorName);
      await vendor.expectApprovalStatus(updated.vendorName, 'Approved');
      await captureScreenshot(page, 'vendor', 'e2e-approved', updated.vendorName);

      // Confirmed terminal-state rule (Vendor Approve phase): Approved replaces the row action
      // with a disabled "Approved" button - "Approve or Reject" is gone entirely.
      const approvedRow = vendor.getRowByVendorName(updated.vendorName);
      await expect(approvedRow.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
      await expect(approvedRow.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);

      // ---- View again after approval ----
      await vendor.viewVendorByName(updated.vendorName);
      await vendor.verifyViewFormFields(updated, expectedVendorId);
      await vendor.returnToListingFromView();

      await vendor.resetFilter();
    } catch (error) {
      await captureScreenshot(page, 'vendor', 'e2e-failure', original.vendorName);
      throw new Error(`Vendor complete lifecycle failed for "${original.vendorName}": ${(error as Error).message}`);
    }
  });

  test('Vendor Reject -> Approve Lifecycle: asymmetric state transitions hold across a full journey', async ({
    page,
  }) => {
    const vendor = await loginAndOpenVendorManagement(page);
    const data = generateVendorData(9951);

    await vendor.openCreateForm();
    await vendor.fillBasicDetails(data);
    await vendor.submitAndExpectSuccess();
    await vendor.expectApprovalStatus(data.vendorName, 'Pending');

    await vendor.rejectVendorByName(data.vendorName);
    await vendor.expectApprovalStatus(data.vendorName, 'Rejected');
    await expect(
      vendor.getRowByVendorName(data.vendorName).getByRole('button', { name: 'Approve or Reject', exact: true })
    ).toBeEnabled();

    await vendor.approveVendorByName(data.vendorName);
    await vendor.expectApprovalStatus(data.vendorName, 'Approved');

    const row = vendor.getRowByVendorName(data.vendorName);
    await expect(row.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);
  });

  test.describe('Vendor Cancel Workflows', () => {
    test('Update Cancel: an edited field is discarded and the original value remains in the listing', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9952);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.editVendorByName(data.vendorName);
      await vendor.fillBasicDetails({ city: 'ShouldNotPersistE2E' });
      await vendor.cancelUpdateForm();

      await vendor.verifyVendorInListing(data.vendorName);
      await expect(vendor.getRowByVendorName(data.vendorName)).toContainText(data.city);
    });

    test('Approval Cancel: closing the dialog after selecting a decision submits nothing', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9953);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.openApprovalDialog(data.vendorName);
      await vendor.selectApprovalDecision('Approve');
      await vendor.closeApprovalDialogWithoutDeciding();

      await vendor.expectApprovalStatus(data.vendorName, 'Pending');
    });
  });
});

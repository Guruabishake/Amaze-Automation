import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { VendorPage } from '../pages/VendorPage';
import { captureScreenshot } from '../utils/screenshot';
import {
  loginData,
  VENDOR_COUNT,
  generateVendorData,
  generateCustomerContact,
  generateBankDetails,
  VendorData,
} from '../utils/testData';

async function loginAndOpenVendorManagement(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();

  const vendor = new VendorPage(page);
  await vendor.navigateFromSidebar();
  return vendor;
}

function omit<T extends object, K extends keyof T>(data: T, key: K): Omit<T, K> {
  const clone: Partial<T> = { ...data };
  delete clone[key];
  return clone as Omit<T, K>;
}

function omitMany<T extends object, K extends keyof T>(data: T, keys: K[]): Omit<T, K> {
  const clone: Partial<T> = { ...data };
  for (const key of keys) delete clone[key];
  return clone as Omit<T, K>;
}

// AmazerTrans only allows one active session per account (confirmed on the live app via its
// "Duplicate Session Detected" dialog). `mode: 'serial'` only orders tests within this file - the
// cross-file guarantee against running another AmazerTrans spec's login in a parallel worker at
// the same time is enforced by e2e/AmazerTrans/playwright.config.ts (workers: 1). Always run via
// `npx playwright test --config=e2e/AmazerTrans/playwright.config.ts`, not the root config.
test.describe.configure({ mode: 'serial' });

test.describe('Vendor Management', () => {
  test('Vendor Management page displays the listing, Create button and table columns', async ({ page }) => {
    const vendor = await loginAndOpenVendorManagement(page);
    await vendor.verifyListingPageElements();
  });

  test('Create Vendor form displays all required fields', async ({ page }) => {
    const vendor = await loginAndOpenVendorManagement(page);
    await vendor.openCreateForm();
    await vendor.verifyCreateFormFields();
  });

  test.describe('Positive: full-form vendor creation', () => {
    test('Creates a vendor with Basic, Contact, Bank, Document and Credit details', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();

      const data = generateVendorData(9001);
      await vendor.fillBasicDetails(data);
      await vendor.fillContactDetails(generateCustomerContact(9501));
      await vendor.fillBankDetails(generateBankDetails(9501));
      await vendor.uploadKycDocument('Aadhar');
      await vendor.fillCreditDetails('45', '75000');

      await vendor.submitAndExpectSuccess();
      await vendor.verifyVendorInListing(data.vendorName);
    });
  });

  // Mirrors the Customer Edit & Update phase, reusing the identical proven pattern (row lookup,
  // shared field-value assertion, API-response synchronization) - confirmed live first that
  // Vendor's Update screen genuinely behaves the same way (same heading/button shape, same
  // reused required-field and duplicate-phone messages, Cancel discards with no API call).
  test.describe('Edit & Update', () => {
    test('Update Vendor screen shows the existing record data and correct field/button states', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9800);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.editVendorByName(data.vendorName);
      await vendor.verifyUpdateFormFields(data);
    });

    test('Updates Vendor Name and City, and the change is reflected in the listing', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const original = generateVendorData(9810);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(original);
      await vendor.submitAndExpectSuccess();

      // Confirmed on Customer's identical field: the Name field silently strips underscores as
      // you type/set it, so a space is used as the separator instead of "_Updated".
      const updatedName = `${original.vendorName} Updated`;
      const updatedCity = 'Coimbatore Updated City';

      await vendor.editVendorByName(original.vendorName);
      try {
        await vendor.fillBasicDetails({ vendorName: updatedName, city: updatedCity });
        await vendor.submitUpdateAndExpectSuccess();
        await captureScreenshot(page, 'vendor', 'update-success', updatedName);
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'update-failure', original.vendorName);
        throw new Error(`Vendor update failed for "${original.vendorName}": ${(error as Error).message}`);
      }

      await vendor.verifyVendorInListing(updatedName);

      // Unchanged value (not shown in the listing table) must still be intact - reopen and check.
      await vendor.editVendorByName(updatedName);
      await expect(page.getByRole('textbox', { name: 'Phone Number' })).toHaveValue(original.phone);
      await vendor.cancelUpdateForm();
    });

    test('Cancel on the Update screen discards changes', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9820);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.editVendorByName(data.vendorName);
      await vendor.fillBasicDetails({ city: 'ShouldNotPersistVendor' });
      await vendor.cancelUpdateForm();
      await captureScreenshot(page, 'vendor', 'update-cancel', data.vendorName);
      await vendor.verifyVendorInListing(data.vendorName);

      await vendor.editVendorByName(data.vendorName);
      await expect(page.getByRole('textbox', { name: 'City' })).toHaveValue(data.city);
      await vendor.cancelUpdateForm();
    });

    test.describe('Negative validations', () => {
      test('Clearing Vendor Name on Update shows the same required-field message as Create', async ({ page }) => {
        const vendor = await loginAndOpenVendorManagement(page);
        const data = generateVendorData(9830);
        await vendor.openCreateForm();
        await vendor.fillBasicDetails(data);
        await vendor.submitAndExpectSuccess();

        await vendor.editVendorByName(data.vendorName);
        await vendor.fillBasicDetails({ vendorName: '' });
        await vendor.submitUpdateAndExpectValidationErrors('Vendor Name is required.');
        await vendor.cancelUpdateForm();
      });

      test('Invalid email format on Update is rejected by the browser (native type=email validation)', async ({
        page,
      }) => {
        const vendor = await loginAndOpenVendorManagement(page);
        const data = generateVendorData(9831);
        await vendor.openCreateForm();
        await vendor.fillBasicDetails(data);
        await vendor.submitAndExpectSuccess();

        await vendor.editVendorByName(data.vendorName);
        await vendor.fillBasicDetails({ email: 'not-a-valid-email' });
        const emailInput = page.getByRole('textbox', { name: 'Email Address' });
        const isTypeMismatch = await emailInput.evaluate((el: HTMLInputElement) => el.validity.typeMismatch);
        expect(isTypeMismatch).toBe(true);
        await vendor.cancelUpdateForm();
      });

      test('Updating Phone Number to another vendor\'s value is rejected as a duplicate', async ({ page }) => {
        const vendor = await loginAndOpenVendorManagement(page);
        const vendorA = generateVendorData(9840);
        const vendorB = generateVendorData(9841);

        await vendor.openCreateForm();
        await vendor.fillBasicDetails(vendorA);
        await vendor.submitAndExpectSuccess();

        await vendor.openCreateForm();
        await vendor.fillBasicDetails(vendorB);
        await vendor.submitAndExpectSuccess();

        await vendor.editVendorByName(vendorB.vendorName);
        await vendor.fillBasicDetails({ phone: vendorA.phone });
        await vendor.submitUpdateAndExpectDuplicatePhoneError();
        await vendor.cancelUpdateForm();
      });
    });
  });

  test.describe('View / Eye + Back', () => {
    test("View screen shows the record's current (post-Update) data with real read-only behavior, then Back returns to the list", async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);

      // Build on the existing Create -> Edit -> Update flow so View is exercised against the
      // record's CURRENT state, not just its as-created state - reuses the same Update helpers,
      // no duplicated update logic here.
      const original = generateVendorData(9850);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(original);
      await vendor.submitAndExpectSuccess();

      const updated: VendorData = {
        ...original,
        vendorName: `${original.vendorName} Updated`,
        city: 'Salem Updated City',
      };
      await vendor.editVendorByName(original.vendorName);
      await vendor.fillBasicDetails({ vendorName: updated.vendorName, city: updated.city });
      await vendor.submitUpdateAndExpectSuccess();

      // Captured from the listing before opening View, so View's Vendor ID field can be
      // cross-checked against it rather than only confirming a screen navigated.
      const expectedVendorId = await vendor.getVendorIdFromListing(updated.vendorName);

      try {
        await vendor.viewVendorByName(updated.vendorName);
        await vendor.verifyViewFormFields(updated, expectedVendorId);
        await captureScreenshot(page, 'vendor', 'view', expectedVendorId);
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'view-failure', updated.vendorName);
        throw new Error(
          `Vendor view failed for "${updated.vendorName}" (${expectedVendorId}): ${(error as Error).message}`
        );
      }

      await vendor.returnToListingFromView();
      await captureScreenshot(page, 'vendor', 'view-back', expectedVendorId);
      await expect(page).toHaveURL(/\/crm\/vendorManagement/);
      await vendor.verifyVendorInListing(updated.vendorName);
    });
  });

  // Confirmed live: Vendor's Filter panel is structurally and behaviorally identical to
  // Customer's - same fields (Vendor Name/Email/PAN text, Vendor Type/Status dropdowns), same
  // substring matching, same AND semantics, same messages, same Reset behavior. Independently
  // re-verified rather than assumed, per this phase's instructions.
  test.describe('Filter', () => {
    test('Positive: exact Vendor Name filter returns only that record', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9900);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      try {
        await vendor.openFilterPanel();
        await vendor.applyFilter({ vendorName: data.vendorName });
        await vendor.expectFilteredResultCount(1);
        // Not just "a row exists" - the exact set of returned names must equal this one record.
        const names = await vendor.getVisibleVendorNames();
        expect(names).toEqual([data.vendorName]);
        await captureScreenshot(page, 'vendor', 'filter-positive', data.vendorName);
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'filter-failure', data.vendorName);
        throw error;
      }
    });

    test('Positive: Status filter returns only records with that status', async ({ page }) => {
      // Confirmed live: every vendor this automation creates defaults to Active status, and no
      // Inactive records exist yet - this asserts the real current state, not an invented split.
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openFilterPanel();
      await vendor.applyFilter({ status: 'Active' });

      const statuses = await vendor.getVisibleStatuses();
      expect(statuses.length).toBeGreaterThan(0);
      for (const status of statuses) {
        expect(status).toBe('Active');
      }
    });

    test('Positive: Vendor Name + Vendor Type applies AND semantics, not OR', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9901); // generateVendorData always sets Domestic
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: data.vendorName, vendorType: 'Domestic' });
      await vendor.expectFilteredResultCount(1);

      // Same Vendor Name, but a Vendor Type this record can never match - narrows to zero only
      // if both conditions are ANDed together, not ORed.
      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: data.vendorName, vendorType: 'Foreign' });
      await vendor.expectNoFilterResults();
    });

    test('Negative: non-existing Vendor Name shows the real no-results message', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const nonExistentName = `NoSuchVendor_${Date.now()}`;

      try {
        await vendor.openFilterPanel();
        await vendor.applyFilter({ vendorName: nonExistentName });
        await vendor.expectNoFilterResults();
        await captureScreenshot(page, 'vendor', 'filter-negative', 'non-existing-vendor');
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'filter-negative-failure', 'non-existing-vendor');
        throw error;
      }
    });

    test('Negative: special characters are handled gracefully with the same no-results message', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: '@#$%^&*!' });
      await vendor.expectNoFilterResults();
    });

    test('Negative: searching with every field empty returns the full unfiltered listing (not an error)', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openFilterPanel();
      await vendor.applyFilter({});
      await vendor.expectUnfilteredListing();
    });

    test('Functional: Reset clears the filter and restores the unfiltered listing', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9902);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: data.vendorName });
      await vendor.expectFilteredResultCount(1);

      // Confirmed live: Reset alone (no separate Search click) clears the fields and refetches
      // the full unfiltered list in one action.
      await vendor.resetFilter();
      await captureScreenshot(page, 'vendor', 'filter-clear', data.vendorName);
    });
  });

  // Confirmed live: pagination is structurally and behaviorally identical to Customer's -
  // server-side (?page=N&limit=10), windowed page numbers, icon-only Prev/Next with no
  // accessible name, no dedicated First/Last control, no page-size selector, filter persists
  // across pages. The staging environment already has 80+ vendors accumulated from prior
  // automation runs, so these tests read whatever is really there rather than creating records
  // or asserting fixed page counts/content.
  test.describe('Pagination', () => {
    test('Next Page: navigating forward changes the URL and the displayed records', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const page1Names = await vendor.getVisibleVendorNames();

      await vendor.goToNextPage();

      await vendor.expectCurrentPage(2);
      const page2Names = await vendor.getVisibleVendorNames();
      // Proves real navigation happened - not just that the button was clicked.
      expect(page2Names[0]).not.toBe(page1Names[0]);

      await captureScreenshot(page, 'vendor', 'pagination-page-2', 'next');
    });

    test('Previous Page: navigating back returns the exact original page content', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const page1Names = await vendor.getVisibleVendorNames();

      await vendor.goToNextPage();
      await vendor.expectCurrentPage(2);

      await vendor.goToPreviousPage();
      await vendor.expectCurrentPage(1);
      const backOnPage1Names = await vendor.getVisibleVendorNames();
      expect(backOnPage1Names).toEqual(page1Names);
    });

    test('Page Number: jumping directly to page 3 loads that page\'s own records', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const lastPage = await vendor.getLastPageNumber();
      test.skip(lastPage < 3, `Only ${lastPage} page(s) currently exist - page 3 is not reachable`);

      const page1Names = await vendor.getVisibleVendorNames();
      await vendor.goToPage(3);

      await vendor.expectCurrentPage(3);
      const page3Names = await vendor.getVisibleVendorNames();
      expect(page3Names[0]).not.toBe(page1Names[0]);
    });

    test('Last page: Next becomes disabled and Previous stays enabled', async ({ page }) => {
      // No dedicated "Last" control exists (confirmed live) - the windowed page-number list
      // always includes the true final page as its last numbered button, which is what
      // getLastPageNumber() reads and this test jumps to directly.
      const vendor = await loginAndOpenVendorManagement(page);
      const lastPage = await vendor.getLastPageNumber();
      test.skip(lastPage <= 1, 'Only one page currently exists - no last-page boundary to exercise');

      await vendor.goToPage(lastPage);

      await vendor.expectCurrentPage(lastPage);
      await expect(vendor.nextPageButton).toBeDisabled();
      await expect(vendor.previousPageButton).toBeEnabled();

      await captureScreenshot(page, 'vendor', 'pagination-last-page', String(lastPage));
    });

    test('Boundary: Previous is disabled on page 1 (no dedicated "First" control exists)', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await expect(vendor.previousPageButton).toBeDisabled();

      await captureScreenshot(page, 'vendor', 'pagination-page-1', 'initial-load');
    });

    test('Filter + Pagination: filtered results paginate correctly and the filter persists across pages', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);

      // Every vendor this automation creates shares this literal name prefix (see
      // generateVendorData) - reusing that existing accumulated data rather than creating new
      // records specifically for this test.
      await vendor.openFilterPanel();
      await vendor.applyFilter({ vendorName: 'QA Automation Vendor' });

      const lastFilteredPage = await vendor.getLastPageNumber();
      test.skip(
        lastFilteredPage < 2,
        'The filter matched only a single page this run - no multi-page filter+pagination to exercise'
      );

      const filteredPage1Names = await vendor.getVisibleVendorNames();

      try {
        await vendor.goToNextPage();
        await vendor.expectCurrentPage(2);
        await expect(page).toHaveURL(/vendor_name=QA\+Automation\+Vendor/);
        const filteredPage2Names = await vendor.getVisibleVendorNames();
        expect(filteredPage2Names[0]).not.toBe(filteredPage1Names[0]);
        await captureScreenshot(page, 'vendor', 'pagination-filtered', 'page-2');
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'pagination-filtered-failure', 'page-2');
        throw error;
      }
    });
  });

  // Confirmed live: approval is a two-step dialog identical to Customer's (select Approve/Reject,
  // then a separate OK confirms), both decisions submit through the same real approveVendor API,
  // there is no reason/comment field for Reject, the (X) close icon cancels with no API call, and
  // a record can be re-decided UNLESS it is Approved - Approved is a real terminal/locked state
  // (the row action becomes a disabled "Approved" button), while Rejected stays open. Each
  // scenario below uses its own dedicated vendor (seeds 9910-9913) since these are irreversible
  // state changes and must not create test-order dependency.
  test.describe('Approve', () => {
    test('Successful approval: a Pending vendor becomes Approved after confirming via the dialog', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9910);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      // New vendors default to Pending - confirmed live, asserted before deciding anything.
      await vendor.expectApprovalStatus(data.vendorName, 'Pending');

      try {
        await vendor.approveVendorByName(data.vendorName);
        await vendor.expectApprovalStatus(data.vendorName, 'Approved');
        await captureScreenshot(page, 'vendor', 'approve-success', data.vendorName);
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'approve-failure', data.vendorName);
        throw new Error(`Vendor approval failed for "${data.vendorName}": ${(error as Error).message}`);
      }
    });

    test('Reject: selecting Reject and confirming sets the vendor to Rejected (no reason field exists)', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9911);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      try {
        await vendor.rejectVendorByName(data.vendorName);
        await vendor.expectApprovalStatus(data.vendorName, 'Rejected');
        await captureScreenshot(page, 'vendor', 'reject-success', data.vendorName);
      } catch (error) {
        await captureScreenshot(page, 'vendor', 'approve-failure', `${data.vendorName}-reject`);
        throw new Error(`Vendor rejection failed for "${data.vendorName}": ${(error as Error).message}`);
      }
    });

    test('Cancel/Close: selecting Approve then closing the dialog does not approve the vendor', async ({
      page,
    }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9912);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.openApprovalDialog(data.vendorName);
      await vendor.selectApprovalDecision('Approve');
      // Confirmed live: the (X) close icon is the only "Cancel" available - no labelled Cancel
      // button exists - and closing this way makes no API call.
      await vendor.closeApprovalDialogWithoutDeciding();

      await vendor.expectApprovalStatus(data.vendorName, 'Pending');
      await captureScreenshot(page, 'vendor', 'approve-cancel', data.vendorName);
    });

    test('Already-approved vendor: the action becomes disabled and relabeled "Approved" (a real locked state)', async ({
      page,
    }) => {
      // Confirmed live: once a record is Approved, its row action button is REPLACED - it no
      // longer reads "Approve or Reject" and becomes a disabled button labelled "Approved". This
      // is asymmetric with Rejected records (verified separately below), which keep the action
      // open and can still be approved later.
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9913);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.approveVendorByName(data.vendorName);
      await vendor.expectApprovalStatus(data.vendorName, 'Approved');

      const row = vendor.getRowByVendorName(data.vendorName);
      await expect(row.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
      await expect(row.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);
      await captureScreenshot(page, 'vendor', 'approve-already-approved', data.vendorName);
    });

    test('Rejected vendor behavior: the action remains available and the vendor can still be approved afterward', async ({
      page,
    }) => {
      // Confirmed live: unlike Approved, Rejected is NOT terminal - "Approve or Reject" stays
      // enabled on a Rejected record, and approving it afterward succeeds (Rejected -> Approved).
      const vendor = await loginAndOpenVendorManagement(page);
      const data = generateVendorData(9914);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(data);
      await vendor.submitAndExpectSuccess();

      await vendor.rejectVendorByName(data.vendorName);
      await vendor.expectApprovalStatus(data.vendorName, 'Rejected');

      const row = vendor.getRowByVendorName(data.vendorName);
      await expect(row.getByRole('button', { name: 'Approve or Reject', exact: true })).toBeEnabled();

      await vendor.approveVendorByName(data.vendorName);
      await vendor.expectApprovalStatus(data.vendorName, 'Approved');
    });
  });

  test.describe('Negative validations', () => {
    const validBase = (): VendorData => generateVendorData(9600);

    const requiredFieldCases: Array<{
      description: string;
      build: (base: VendorData) => Partial<VendorData>;
      expectedMessage: string;
    }> = [
      {
        description: 'Vendor Name',
        build: (base) => omit(base, 'vendorName'),
        expectedMessage: 'Vendor Name is required.',
      },
      {
        description: 'Vendor Type',
        // Sub Type only renders once Vendor Type is chosen, and State's option list only
        // populates once Country auto-defaults (which itself only happens once Vendor Type is
        // chosen) - all three must be left out together here.
        build: (base) => omitMany(base, ['vendorType', 'subType', 'state']),
        expectedMessage: 'Vendor Type is required.',
      },
      {
        description: 'Address 1',
        build: (base) => omit(base, 'address1'),
        expectedMessage: 'Address 1 is required.',
      },
      {
        description: 'State',
        build: (base) => omit(base, 'state'),
        expectedMessage: 'State is required.',
      },
      {
        description: 'City',
        build: (base) => omit(base, 'city'),
        expectedMessage: 'City is required.',
      },
      {
        description: 'Phone Number',
        build: (base) => omit(base, 'phone'),
        expectedMessage: 'Phone Number is required.',
      },
    ];

    for (const { description, build, expectedMessage } of requiredFieldCases) {
      test(`Leaving "${description}" empty shows: "${expectedMessage}"`, async ({ page }) => {
        const vendor = await loginAndOpenVendorManagement(page);
        await vendor.openCreateForm();
        await vendor.fillBasicDetails(build(validBase()));
        await vendor.submitAndExpectValidationErrors(expectedMessage);
      });
    }

    test('Vendor Type is required when Country is left empty (no auto-default before selection)', async ({
      page,
    }) => {
      // Confirmed on the live app: Customer form defaults Country to "India" up front, but
      // Vendor form only defaults it once Vendor Type is chosen - leaving Vendor Type empty
      // also leaves Country unset and surfaces its own message.
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();
      // Sub Type only renders once Vendor Type is chosen, and State's options only populate
      // once Country auto-defaults (which itself needs Vendor Type) - omit all three together.
      await vendor.fillBasicDetails(omitMany(validBase(), ['vendorType', 'subType', 'state']));
      await vendor.submitAndExpectValidationErrors('Vendor Type is required.', 'Country is required.');
    });

    test('Email Address is optional for a Vendor (unlike Customer, where it is required)', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(omit(generateVendorData(9650), 'email'));
      await vendor.submitAndExpectSuccess();
    });

    test('Phone Number silently rejects non-numeric keystrokes', async ({ page }) => {
      // Confirmed on the live app (same behavior as Customer): the field's input handler filters
      // non-numeric characters as you type, leaving the field empty rather than failing pattern
      // validation on submit.
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();
      const phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
      await phoneInput.pressSequentially('abcdefghij');
      await expect(phoneInput).toHaveValue('');
    });

    test('Phone Number enforces a maximum of 10 characters while typing', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();
      const phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
      await phoneInput.pressSequentially('123456789012345');
      await expect(phoneInput).toHaveValue('1234567890');
    });

    test('PAN must be exactly 10 characters (minlength/maxlength boundary)', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);
      await vendor.openCreateForm();
      const panInput = page.getByRole('textbox', { name: 'PAN' });
      await panInput.pressSequentially('SHORT12');
      const isTooShort = await panInput.evaluate((el: HTMLInputElement) => el.validity.tooShort);
      expect(isTooShort).toBe(true);
    });

    test('Duplicate phone number is rejected with the real backend error', async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);

      const first = generateVendorData(9700);
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(first);
      await vendor.submitAndExpectSuccess();

      const second = { ...generateVendorData(9701), phone: first.phone };
      await vendor.openCreateForm();
      await vendor.fillBasicDetails(second);
      await vendor.submitAndExpectDuplicatePhoneError();
    });
  });

  test.describe('Bulk creation via configurable loop', () => {
    // VENDOR_COUNT comes from VENDOR_COUNT in .env - change it there (5 -> 10 -> 20 -> 50)
    // without touching this loop.
    test(`Creates ${VENDOR_COUNT} unique vendors and verifies each appears in the listing`, async ({ page }) => {
      const vendor = await loginAndOpenVendorManagement(page);

      for (let i = 0; i < VENDOR_COUNT; i++) {
        await test.step(`Create vendor #${i + 1} of ${VENDOR_COUNT}`, async () => {
          const data = generateVendorData(i);
          try {
            await vendor.openCreateForm();
            await vendor.fillBasicDetails(data);
            await vendor.submitAndExpectSuccess();
            await vendor.verifyVendorInListing(data.vendorName);
          } catch (error) {
            throw new Error(
              `Vendor creation failed at iteration ${i + 1}/${VENDOR_COUNT} ` +
                `(vendorName="${data.vendorName}", phone="${data.phone}"): ${(error as Error).message}`
            );
          }
        });
      }
    });
  });
});

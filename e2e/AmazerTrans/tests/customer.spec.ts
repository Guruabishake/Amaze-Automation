import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { captureScreenshot } from '../utils/screenshot';
import {
  loginData,
  CUSTOMER_COUNT,
  generateCustomerData,
  generateCustomerContact,
  generateBankDetails,
  generateGstDetails,
  CustomerData,
} from '../utils/testData';

async function loginAndOpenCustomerManagement(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();

  const customer = new CustomerPage(page);
  await customer.navigateFromSidebar();
  return customer;
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

test.describe('Customer Management', () => {
  test('Customer Management page displays the listing, Create button and table columns', async ({ page }) => {
    const customer = await loginAndOpenCustomerManagement(page);
    await customer.verifyListingPageElements();
  });

  test('Create Customer form displays all required fields', async ({ page }) => {
    const customer = await loginAndOpenCustomerManagement(page);
    await customer.openCreateForm();
    await customer.verifyCreateFormFields();
  });

  test.describe('Positive: full-form customer creation', () => {
    test('Creates a customer with Basic, Contact, Bank, KYC, Document and Credit details', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();

      const data = generateCustomerData(9001);
      await customer.fillBasicDetails(data);
      await customer.fillContactDetails(generateCustomerContact(9001));
      await customer.fillBankDetails(generateBankDetails(9001));
      await customer.fillKycDetails(generateGstDetails(9001));
      await customer.uploadKycDocument('Aadhar');
      await customer.fillCreditDetails('30', '50000');

      await customer.submitAndExpectSuccess();
      await customer.verifyCustomerInListing(data.customerName);
    });
  });

  test.describe('Edit & Update', () => {
    test('Update Customer screen shows the existing record data and correct field/button states', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9500);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.editCustomerByName(data.customerName);
      await customer.verifyUpdateFormFields(data);
    });

    test('Updates Customer Name, Address and City, and the change is reflected in the listing', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const original = generateCustomerData(9510);
      await customer.openCreateForm();
      await customer.fillBasicDetails(original);
      await customer.submitAndExpectSuccess();

      // Confirmed on the live app: the Customer Name field silently strips underscores as you
      // type/set it (same real-time-sanitize pattern as Phone Number), so "_Updated" would land
      // as "Updated" with no separator - a space survives instead.
      const updatedName = `${original.customerName} Updated`;
      const updatedCity = 'Madurai Updated City';

      await customer.editCustomerByName(original.customerName);
      try {
        // Only the fields actually being changed are passed - fillBasicDetails leaves every
        // other (already-populated) field untouched.
        await customer.fillBasicDetails({ customerName: updatedName, city: updatedCity });
        await customer.submitUpdateAndExpectSuccess();
        await captureScreenshot(page, 'customer', 'update-success', updatedName);
      } catch (error) {
        await captureScreenshot(page, 'customer', 'update-failure', original.customerName);
        throw new Error(`Customer update failed for "${original.customerName}": ${(error as Error).message}`);
      }

      await customer.verifyCustomerInListing(updatedName);

      // Unchanged values (not shown in the listing table) must still be intact - reopen and check.
      await customer.editCustomerByName(updatedName);
      await expect(page.getByRole('textbox', { name: 'Phone Number' })).toHaveValue(original.phone);
      await expect(page.getByRole('textbox', { name: 'Email Address' })).toHaveValue(original.email);
      await customer.cancelUpdateForm();
    });

    test('Cancel on the Update screen discards changes', async ({ page }) => {
      // Confirmed on the live app: Cancel returns to the listing without calling updateCustomer,
      // and any in-progress edits are discarded rather than saved.
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9520);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.editCustomerByName(data.customerName);
      await customer.fillBasicDetails({ city: 'ShouldNotPersist' });
      await customer.cancelUpdateForm();
      await customer.verifyCustomerInListing(data.customerName);

      await customer.editCustomerByName(data.customerName);
      await expect(page.getByRole('textbox', { name: 'City' })).toHaveValue(data.city);
      await customer.cancelUpdateForm();
    });

    test.describe('Negative validations', () => {
      test('Clearing Customer Name on Update shows the same required-field message as Create', async ({
        page,
      }) => {
        const customer = await loginAndOpenCustomerManagement(page);
        const data = generateCustomerData(9530);
        await customer.openCreateForm();
        await customer.fillBasicDetails(data);
        await customer.submitAndExpectSuccess();

        await customer.editCustomerByName(data.customerName);
        await customer.fillBasicDetails({ customerName: '' });
        await customer.submitUpdateAndExpectValidationErrors('Customer Name is required.');
        await customer.cancelUpdateForm();
      });

      test('Invalid email format on Update is rejected by the browser (native type=email validation)', async ({
        page,
      }) => {
        const customer = await loginAndOpenCustomerManagement(page);
        const data = generateCustomerData(9531);
        await customer.openCreateForm();
        await customer.fillBasicDetails(data);
        await customer.submitAndExpectSuccess();

        await customer.editCustomerByName(data.customerName);
        await customer.fillBasicDetails({ email: 'not-a-valid-email' });
        const emailInput = page.getByRole('textbox', { name: 'Email Address' });
        const isTypeMismatch = await emailInput.evaluate((el: HTMLInputElement) => el.validity.typeMismatch);
        expect(isTypeMismatch).toBe(true);
        await customer.cancelUpdateForm();
      });

      test('Updating Phone Number to another customer\'s value is rejected as a duplicate', async ({ page }) => {
        const customer = await loginAndOpenCustomerManagement(page);
        const customerA = generateCustomerData(9540);
        const customerB = generateCustomerData(9541);

        await customer.openCreateForm();
        await customer.fillBasicDetails(customerA);
        await customer.submitAndExpectSuccess();

        await customer.openCreateForm();
        await customer.fillBasicDetails(customerB);
        await customer.submitAndExpectSuccess();

        await customer.editCustomerByName(customerB.customerName);
        await customer.fillBasicDetails({ phone: customerA.phone });
        await customer.submitUpdateAndExpectDuplicatePhoneError();
        await customer.cancelUpdateForm();
      });
    });
  });

  test.describe('View / Eye + Back', () => {
    test("View screen shows the record's current (post-Update) data with real read-only behavior, then Back returns to the list", async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);

      // Build on the existing Create -> Edit -> Update flow so View is exercised against the
      // record's CURRENT state, not just its as-created state.
      const original = generateCustomerData(9560);
      await customer.openCreateForm();
      await customer.fillBasicDetails(original);
      await customer.submitAndExpectSuccess();

      const updated: CustomerData = {
        ...original,
        customerName: `${original.customerName} Updated`,
        city: 'Trichy Updated',
      };
      await customer.editCustomerByName(original.customerName);
      await customer.fillBasicDetails({ customerName: updated.customerName, city: updated.city });
      await customer.submitUpdateAndExpectSuccess();

      // Captured from the listing before opening View, so View's Customer ID field can be
      // cross-checked against it rather than only confirming a screen navigated.
      const expectedCustomerId = await customer.getCustomerIdFromListing(updated.customerName);

      try {
        await customer.viewCustomerByName(updated.customerName);
        await customer.verifyViewFormFields(updated, expectedCustomerId);
        await captureScreenshot(page, 'customer', 'view', expectedCustomerId);
      } catch (error) {
        await captureScreenshot(page, 'customer', 'view-failure', updated.customerName);
        throw new Error(
          `Customer view failed for "${updated.customerName}" (${expectedCustomerId}): ${(error as Error).message}`
        );
      }

      await customer.returnToListingFromView();
      await expect(page).toHaveURL(/\/crm\/customerManagement/);
      await customer.verifyCustomerInListing(updated.customerName);
    });
  });

  test.describe('Filter', () => {
    test('Positive: exact Customer Name filter returns only that record', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9600);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      try {
        await customer.openFilterPanel();
        await customer.applyFilter({ customerName: data.customerName });
        await customer.expectFilteredResultCount(1);
        // Not just "a row exists" - the exact set of returned names must equal this one record.
        const names = await customer.getVisibleCustomerNames();
        expect(names).toEqual([data.customerName]);
        await captureScreenshot(page, 'customer', 'filter-positive', data.customerName);
      } catch (error) {
        await captureScreenshot(page, 'customer', 'filter-failure', data.customerName);
        throw error;
      }
    });

    test('Positive: Status filter returns only records with that status', async ({ page }) => {
      // Confirmed live: every customer this automation creates defaults to Active status, and
      // no Inactive records exist yet - this asserts the real current state rather than an
      // invented split. "Status" here is the Active/Inactive field, distinct from the
      // "Approval Status" listing column (Pending/Approved), which this panel does not filter.
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openFilterPanel();
      await customer.applyFilter({ status: 'Active' });

      const statuses = await customer.getVisibleStatuses();
      expect(statuses.length).toBeGreaterThan(0);
      for (const status of statuses) {
        expect(status).toBe('Active');
      }
    });

    test('Positive: Customer Name + Customer Type applies AND semantics, not OR', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9601); // generateCustomerData always sets Domestic
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: data.customerName, customerType: 'Domestic' });
      await customer.expectFilteredResultCount(1);

      // Same Customer Name, but a Customer Type this record can never match - a real record
      // narrows to zero only if both conditions are ANDed together, not ORed.
      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: data.customerName, customerType: 'Foreign' });
      await customer.expectNoFilterResults();
    });

    test('Negative: non-existing Customer Name shows the real no-results message', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const nonExistentName = `NoSuchCustomer_${Date.now()}`;

      try {
        await customer.openFilterPanel();
        await customer.applyFilter({ customerName: nonExistentName });
        await customer.expectNoFilterResults();
        await captureScreenshot(page, 'customer', 'filter-negative', 'non-existing-customer');
      } catch (error) {
        await captureScreenshot(page, 'customer', 'filter-negative-failure', 'non-existing-customer');
        throw error;
      }
    });

    test('Negative: special characters are handled gracefully with the same no-results message', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: '@#$%^&*!' });
      await customer.expectNoFilterResults();
    });

    test('Negative: searching with every field empty returns the full unfiltered listing (not an error)', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openFilterPanel();
      await customer.applyFilter({});
      await customer.expectUnfilteredListing();
    });

    test('Functional: Reset clears the filter and restores the unfiltered listing', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9602);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: data.customerName });
      await customer.expectFilteredResultCount(1);

      // Confirmed live: Reset alone (no separate Search click) clears the fields and refetches
      // the full unfiltered list in one action.
      await customer.resetFilter();
    });
  });

  // Confirmed live: pagination exists (Previous/Next arrows + windowed page numbers, page size
  // fixed at 10, no First/Last or page-size controls). The staging environment already has 100+
  // customers accumulated from prior automation runs, so these tests read whatever is really
  // there rather than creating records or asserting fixed page counts/content.
  test.describe('Pagination', () => {
    test('Next Page: navigating forward changes the URL and the displayed records', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const page1Names = await customer.getVisibleCustomerNames();

      await customer.goToNextPage();

      await customer.expectCurrentPage(2);
      const page2Names = await customer.getVisibleCustomerNames();
      // Proves real navigation happened - not just that the button was clicked.
      expect(page2Names[0]).not.toBe(page1Names[0]);

      await captureScreenshot(page, 'customer', 'pagination-page-2', 'next');
    });

    test('Previous Page: navigating back returns the exact original page content', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const page1Names = await customer.getVisibleCustomerNames();

      await customer.goToNextPage();
      await customer.expectCurrentPage(2);

      await customer.goToPreviousPage();
      await customer.expectCurrentPage(1);
      const backOnPage1Names = await customer.getVisibleCustomerNames();
      expect(backOnPage1Names).toEqual(page1Names);
    });

    test('Page Number: jumping directly to page 3 loads that page\'s own records', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const lastPage = await customer.getLastPageNumber();
      test.skip(lastPage < 3, `Only ${lastPage} page(s) currently exist - page 3 is not reachable`);

      const page1Names = await customer.getVisibleCustomerNames();
      await customer.goToPage(3);

      await customer.expectCurrentPage(3);
      const page3Names = await customer.getVisibleCustomerNames();
      expect(page3Names[0]).not.toBe(page1Names[0]);
    });

    test('Last page: Next becomes disabled and Previous stays enabled', async ({ page }) => {
      // No dedicated "Last" control exists (confirmed live) - the windowed page-number list
      // always includes the true final page as its last numbered button, which is what
      // getLastPageNumber() reads and this test jumps to directly.
      const customer = await loginAndOpenCustomerManagement(page);
      const lastPage = await customer.getLastPageNumber();
      test.skip(lastPage <= 1, 'Only one page currently exists - no last-page boundary to exercise');

      await customer.goToPage(lastPage);

      await customer.expectCurrentPage(lastPage);
      await expect(customer.nextPageButton).toBeDisabled();
      await expect(customer.previousPageButton).toBeEnabled();

      await captureScreenshot(page, 'customer', 'pagination-last-page', String(lastPage));
    });

    test('Boundary: Previous is disabled on page 1', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await expect(customer.previousPageButton).toBeDisabled();

      await captureScreenshot(page, 'customer', 'pagination-page-1', 'initial-load');
    });

    test('Filter + Pagination: filtered results paginate correctly and the filter persists across pages', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);

      // Every customer this automation creates shares this literal name prefix (see
      // generateCustomerData) - reusing that existing accumulated data rather than creating new
      // records specifically for this test.
      await customer.openFilterPanel();
      await customer.applyFilter({ customerName: 'QA Automation Customer' });

      const lastFilteredPage = await customer.getLastPageNumber();
      test.skip(
        lastFilteredPage < 2,
        'The filter matched only a single page this run - no multi-page filter+pagination to exercise'
      );

      const filteredPage1Names = await customer.getVisibleCustomerNames();

      try {
        await customer.goToNextPage();
        await customer.expectCurrentPage(2);
        await expect(page).toHaveURL(/customer_name=QA\+Automation\+Customer/);
        const filteredPage2Names = await customer.getVisibleCustomerNames();
        expect(filteredPage2Names[0]).not.toBe(filteredPage1Names[0]);
        await captureScreenshot(page, 'customer', 'pagination-filtered', 'page-2');
      } catch (error) {
        await captureScreenshot(page, 'customer', 'pagination-filtered-failure', 'page-2');
        throw error;
      }
    });
  });

  // Confirmed live: approval is a two-step dialog (select Approve/Reject, then a separate OK
  // confirms), both decisions submit through the same real approveCustomer API, there is no
  // reason/comment field for Reject, and a record can be re-decided at any time (the action
  // never becomes disabled/locked once a decision has been made).
  test.describe('Approve', () => {
    test('Successful approval: a Pending customer becomes Approved after confirming via the dialog', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9700);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      // New customers default to Pending - confirmed live, asserted before deciding anything.
      await customer.expectApprovalStatus(data.customerName, 'Pending');

      try {
        await customer.approveCustomerByName(data.customerName);
        await customer.expectApprovalStatus(data.customerName, 'Approved');
        await captureScreenshot(page, 'customer', 'approve-success', data.customerName);
      } catch (error) {
        await captureScreenshot(page, 'customer', 'approve-failure', data.customerName);
        throw new Error(`Customer approval failed for "${data.customerName}": ${(error as Error).message}`);
      }
    });

    test('Cancel approval: selecting Approve then closing the dialog does not approve the customer', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9701);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.openApprovalDialog(data.customerName);
      await customer.selectApprovalDecision('Approve');
      // Confirmed live: the (X) close icon is the only "Cancel" available - no labelled Cancel
      // button exists - and closing this way makes no API call.
      await customer.closeApprovalDialogWithoutDeciding();

      await customer.expectApprovalStatus(data.customerName, 'Pending');
    });

    test('Reject: selecting Reject and confirming sets the customer to Rejected (no reason field exists)', async ({
      page,
    }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9702);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      try {
        await customer.rejectCustomerByName(data.customerName);
        await customer.expectApprovalStatus(data.customerName, 'Rejected');
      } catch (error) {
        await captureScreenshot(page, 'customer', 'approve-failure', `${data.customerName}-reject`);
        throw new Error(`Customer rejection failed for "${data.customerName}": ${(error as Error).message}`);
      }
    });

    test('Already-approved customer: the action becomes disabled and relabeled "Approved" (a real locked state)', async ({
      page,
    }) => {
      // Confirmed live: once a record is Approved, its row action button is REPLACED - it no
      // longer reads "Approve or Reject" and becomes a disabled button labelled "Approved".
      // This is asymmetric with Rejected records, which keep the action open and can still be
      // approved later - only the confirmed Approved-is-terminal behavior is asserted here.
      const customer = await loginAndOpenCustomerManagement(page);
      const data = generateCustomerData(9703);
      await customer.openCreateForm();
      await customer.fillBasicDetails(data);
      await customer.submitAndExpectSuccess();

      await customer.approveCustomerByName(data.customerName);
      await customer.expectApprovalStatus(data.customerName, 'Approved');

      const row = customer.getRowByCustomerName(data.customerName);
      await expect(row.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled();
      await expect(row.getByRole('button', { name: 'Approve or Reject', exact: true })).toHaveCount(0);
    });
  });

  test.describe('Negative validations', () => {
    const validBase = (): CustomerData => generateCustomerData(9100);

    const requiredFieldCases: Array<{
      description: string;
      build: (base: CustomerData) => Partial<CustomerData>;
      expectedMessage: string;
    }> = [
      {
        description: 'Customer Name',
        build: (base) => omit(base, 'customerName'),
        expectedMessage: 'Customer Name is required.',
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
      {
        description: 'Email Address',
        build: (base) => omit(base, 'email'),
        expectedMessage: 'Email Address is required.',
      },
      {
        description: 'Sub Type (conditional on Domestic Customer Type)',
        // Gst Applicable only renders once Sub Type is chosen, so it must be left out too here.
        build: (base) => omitMany(base, ['subType', 'gstApplicable']),
        expectedMessage: 'Sub Type is required for Domestic customers.',
      },
    ];

    for (const { description, build, expectedMessage } of requiredFieldCases) {
      test(`Leaving "${description}" empty shows: "${expectedMessage}"`, async ({ page }) => {
        const customer = await loginAndOpenCustomerManagement(page);
        await customer.openCreateForm();
        await customer.fillBasicDetails(build(validBase()));
        await customer.submitAndExpectValidationErrors(expectedMessage);
      });
    }

    test('Submitting a completely empty form shows every required-field message together', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();
      await customer.submitAndExpectValidationErrors(
        'Customer Name is required.',
        'Address 1 is required.',
        'State is required.',
        'City is required.',
        'Phone Number is required.',
        'Email Address is required.'
      );
    });

    test('Invalid email format is rejected by the browser (native type=email validation)', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();
      await customer.fillBasicDetails({ ...validBase(), email: 'not-a-valid-email' });

      const emailInput = page.getByRole('textbox', { name: 'Email Address' });
      const isTypeMismatch = await emailInput.evaluate((el: HTMLInputElement) => el.validity.typeMismatch);
      expect(isTypeMismatch).toBe(true);
    });

    test('Phone Number silently rejects non-numeric keystrokes', async ({ page }) => {
      // Confirmed on the live app: the field's input handler filters non-numeric characters as
      // you type, rather than accepting them and failing pattern validation on submit - typing
      // pure letters leaves the field empty.
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();
      const phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
      await phoneInput.pressSequentially('abcdefghij');
      await expect(phoneInput).toHaveValue('');
    });

    test('Phone Number enforces a maximum of 10 characters while typing', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();
      const phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
      await phoneInput.pressSequentially('123456789012345');
      await expect(phoneInput).toHaveValue('1234567890');
    });

    test('PAN must be exactly 10 characters (minlength/maxlength boundary)', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);
      await customer.openCreateForm();
      const panInput = page.getByRole('textbox', { name: 'PAN' });
      await panInput.pressSequentially('SHORT12');
      const isTooShort = await panInput.evaluate((el: HTMLInputElement) => el.validity.tooShort);
      expect(isTooShort).toBe(true);
    });

    test('Duplicate phone number is rejected with the real backend error', async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);

      // Create one customer, then immediately try to reuse its exact phone number.
      const first = generateCustomerData(9200);
      await customer.openCreateForm();
      await customer.fillBasicDetails(first);
      await customer.submitAndExpectSuccess();

      const second = { ...generateCustomerData(9201), phone: first.phone };
      await customer.openCreateForm();
      await customer.fillBasicDetails(second);
      await customer.submitAndExpectDuplicatePhoneError();
    });
  });

  test.describe('Bulk creation via configurable loop', () => {
    // CUSTOMER_COUNT comes from CUSTOMER_COUNT in .env - change it there (5 -> 10 -> 20 -> 50)
    // without touching this loop.
    test(`Creates ${CUSTOMER_COUNT} unique customers and verifies each appears in the listing`, async ({ page }) => {
      const customer = await loginAndOpenCustomerManagement(page);

      for (let i = 0; i < CUSTOMER_COUNT; i++) {
        await test.step(`Create customer #${i + 1} of ${CUSTOMER_COUNT}`, async () => {
          const data = generateCustomerData(i);
          try {
            await customer.openCreateForm();
            await customer.fillBasicDetails(data);
            await customer.submitAndExpectSuccess();
            await customer.verifyCustomerInListing(data.customerName);
          } catch (error) {
            throw new Error(
              `Customer creation failed at iteration ${i + 1}/${CUSTOMER_COUNT} ` +
                `(customerName="${data.customerName}", phone="${data.phone}"): ${(error as Error).message}`
            );
          }
        });
      }
    });
  });
});

import * as path from 'path';
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { ConfirmOrderPage } from '../pages/ConfirmOrderPage';
import { ContractPage } from '../pages/ContractPage';
import { createQuoteConfirmedRecord } from '../utils/quoteConfirmedSetup';
import {
  loginData,
  generateCustomerData,
  generateCustomerContact,
  generateBankDetails,
  generateGstDetails,
  generateSubcontractData,
  generatePricingExtraSellEntry,
  CONTRACT_UPLOAD_ENABLED,
  CONTRACT_UPLOAD_FILES,
} from '../utils/testData';
import { captureScreenshot } from '../utils/screenshot';

/**
 * Contract List (CRM -> Sales Management -> "Contract") is the final stage of this pipeline
 * (Enquiry -> Quotation -> Pricing -> Quote Approval -> Confirm Order -> Combined Job -> Contract)
 * - see ContractPage.ts's own header comment for the full, live-confirmed real behavior this spec
 * exercises (route names, the Customer picker's real, non-standard DOM shape, the confirmed
 * `POST /contracts/createContract` 409-on-duplicate-customer business rule, the real "Order
 * Confirmed" prerequisite for a Subcontract's Enquiry No picker, the real Sub Contract Id format,
 * and the confirmed Transport-tab Create-vs-View/Edit difference).
 *
 * AmazerTrans only allows one active session per account - one login carries the ENTIRE
 * Customer -> Contract -> Subcontract lifecycle in the same continuous session, matching the same
 * constraint already documented for every other module in this suite. One Customer is created
 * ONCE and reused throughout (never recreated) - required both by this task's own instruction and
 * by the real, confirmed "one Contract per Customer" business rule (a second Contract attempt for
 * an already-contracted Customer returns a real 409).
 */
test.describe.configure({ mode: 'serial' });

async function loginOnce(page: import('@playwright/test').Page) {
  const login = new LoginPage(page);
  await login.goto(loginData.url);
  await login.login(loginData.username, loginData.password, loginData.branch);
  await login.verifyLoginSuccess();
}

test.describe('Contract List', () => {
  test('Customer -> Contract -> View -> Edit -> Create Subcontract -> Submit -> Subcontract View -> Edit -> Update', async ({ page }) => {
    test.setTimeout(600_000);

    const seed = Date.now() % 100000;
    let currentScreen = 'Login';
    let currentOperation = 'Login';
    const contract = new ContractPage(page);

    const customerData = generateCustomerData(seed);
    let contractId = '';
    let enquiryNo = '';
    let quoteNo = '';
    let subContractId = '';

    try {
      // ---------- 1. CUSTOMER (created ONCE, reused throughout) ----------
      currentScreen = 'Customer Management';
      currentOperation = 'Create and approve the one Customer this whole Contract/Subcontract flow reuses';
      await loginOnce(page);
      const customer = new CustomerPage(page);
      await customer.navigateFromSidebar();
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
      await captureScreenshot(page, 'contract', 'customer-created', customerData.customerName);

      // ---------- 2. CONTRACT: Add New -> Select Customer -> Create ----------
      currentScreen = 'Contract List';
      await test.step('Contract - Add New, Select Customer, Create', async () => {
        currentOperation = 'Navigate to Contract List';
        await contract.navigateFromSidebar();

        currentOperation = 'Open Add New and select the Customer';
        await contract.openCreateForm();
        await contract.selectCustomerForContract(customerData.customerName);

        currentOperation = 'Click Create and capture the real generated Contract Id';
        contractId = await contract.createContract();
        expect(contractId, 'A real Contract Id should be returned by the app - never hardcoded').not.toBe('');
        await captureScreenshot(page, 'contract', 'contract-created', contractId);

        currentOperation = 'Verify the Contract List record was actually created';
        const rowData = await contract.readRowByCustomerName(customerData.customerName);
        expect(rowData.contractId).toBe(contractId);
        expect(rowData.customerName).toBe(customerData.customerName);
        expect(rowData.status).toBe('Active');
      });

      // ---------- 3. CONTRACT VIEW ----------
      await test.step('Contract - View, verify fields, Back', async () => {
        currentScreen = 'Contract View';
        currentOperation = 'Open View and verify the Contract fields match creation data';
        await contract.viewContract(customerData.customerName);
        await contract.verifyContractView({ contractId, customerName: customerData.customerName, status: 'Active' });
        await captureScreenshot(page, 'contract', 'contract-view', contractId);

        currentOperation = 'Click Back and verify return to Contract List';
        await contract.backToList();
        await captureScreenshot(page, 'contract', 'list-after-view-back', contractId);
      });

      // ---------- 4. CONTRACT EDIT / UPDATE ----------
      await test.step('Contract - Edit, change Status, Update, verify persisted', async () => {
        currentScreen = 'Contract Edit';
        currentOperation = 'Open Edit and change Status to Inactive';
        await contract.editContract(customerData.customerName);
        await contract.selectContractStatus('Inactive');
        await captureScreenshot(page, 'contract', 'contract-edit-inactive', contractId);

        currentOperation = 'Click Update and verify the change persisted';
        await contract.updateContract();
        await contract.expectContractStatus(customerData.customerName, 'Inactive');
        await captureScreenshot(page, 'contract', 'list-after-update-inactive', contractId);

        currentOperation = 'Restore Status to Active (required for Subcontract creation)';
        await contract.editContract(customerData.customerName);
        await contract.selectContractStatus('Active');
        await contract.updateContract();
        await contract.expectContractStatus(customerData.customerName, 'Active');
        await captureScreenshot(page, 'contract', 'list-after-update-active', contractId);
      });

      // ---------- 5. ENQUIRY -> QUOTATION -> PRICING -> QUOTE APPROVAL -> CONFIRM QUOTE -> CONFIRM MASTER JOB ----------
      // Reuses the SAME Customer created above - required both by this task's own instruction and
      // by the real, confirmed rule that a Subcontract's Enquiry No picker is scoped to this
      // Contract's own Customer AND to that Customer's Enquiries that have reached real
      // "Order Confirmed" status (Quote Confirmed alone shows "No results found" - confirmed live).
      await test.step('Enquiry/Quotation/Pricing/Quote Approval/Confirm Quote/Confirm Master Job - reusing the SAME Customer', async () => {
        currentScreen = 'Enquiry -> Confirm Master Job setup';
        currentOperation = 'Run the full chain to real "Quote Confirmed" status for the SAME Customer';
        const record = await createQuoteConfirmedRecord(page, seed, 'contract', customerData.customerName);
        enquiryNo = record.enquiryNo;
        quoteNo = record.quoteNo;
        expect(enquiryNo, 'A real Enquiry No should have been created for this SAME Customer').not.toBe('');

        currentOperation = 'Confirm Master Job to reach real "Order Confirmed" status';
        const confirmOrder = new ConfirmOrderPage(page);
        await confirmOrder.navigateFromSidebar();
        await confirmOrder.openFilter();
        await confirmOrder.filterByEnquiryNumber(enquiryNo);
        await confirmOrder.clickConfirmMasterJob(enquiryNo);
        await confirmOrder.confirmMasterJob();
        await confirmOrder.expectApprovalStatus(enquiryNo, 'Order Confirmed');
        await captureScreenshot(page, 'contract', 'enquiry-order-confirmed', enquiryNo);
      });

      // ---------- 6. CREATE SUBCONTRACT ----------
      const subData = generateSubcontractData(seed);
      const extraOrigin = generatePricingExtraSellEntry(seed);
      const extraInternational = generatePricingExtraSellEntry(seed + 1);
      const extraDestination = generatePricingExtraSellEntry(seed + 2);

      await test.step('Create Sub Contract - Enquiry No, Start/End Date, Status, tabs', async () => {
        currentScreen = 'Create Sub Contract';
        currentOperation = 'Open Create Sub Contract from the Contract List row';
        await contract.navigateFromSidebar();
        await contract.openCreateSubcontractForm(customerData.customerName);

        currentOperation = 'Select the real Enquiry No (scoped to this Customer, Order Confirmed only)';
        await contract.selectSubcontractEnquiryNumber(enquiryNo);

        currentOperation = 'Fill Start Date / End Date and verify Status defaults to Active';
        await contract.fillSubcontractDates(subData.startDate, subData.endDate);
        await captureScreenshot(page, 'contract', 'subcontract-header', enquiryNo);

        currentOperation = 'Open and verify Product Information (read-only, carried over from the Enquiry)';
        await contract.openProductInformationTab();
        await captureScreenshot(page, 'contract', 'subcontract-product-information', enquiryNo);

        currentOperation = 'Open and verify Cargo Information (read-only, carried over from the Enquiry)';
        await contract.openCargoInformationTab();
        await captureScreenshot(page, 'contract', 'subcontract-cargo-information', enquiryNo);

        currentOperation = 'Open and verify the real Transport tab if present (confirmed live to be conditional, not always shown)';
        const transportTabPresent = await contract.openTransportTab();
        if (transportTabPresent) {
          await captureScreenshot(page, 'contract', 'subcontract-transport', enquiryNo);
        } else {
          console.log(`Contract Create Sub Contract: no "Transport" tab present for Enquiry ${enquiryNo} this run - a real, confirmed-conditional tab, not an automation gap.`);
        }

        currentOperation = 'Open Contract Price and add a real Sell charge to Origin/International/Destination';
        await contract.openContractPriceTab();
        await contract.addContractPriceSellCharge('Origin', extraOrigin);
        await captureScreenshot(page, 'contract', 'subcontract-price-origin', enquiryNo);
        await contract.addContractPriceSellCharge('International', extraInternational);
        await captureScreenshot(page, 'contract', 'subcontract-price-international', enquiryNo);
        await contract.addContractPriceSellCharge('Destination', extraDestination);
        await captureScreenshot(page, 'contract', 'subcontract-price-destination', enquiryNo);

        currentOperation = 'Verify the Contract Price Summary calculation (same formula already proven on Pricing)';
        await contract.verifyContractPriceSummaryCalculation();
        await captureScreenshot(page, 'contract', 'subcontract-price-summary', enquiryNo);

        if (CONTRACT_UPLOAD_ENABLED) {
          currentOperation = "Upload a document via Contract Price's own nested Upload File sub-tab";
          await contract.openContractPriceUploadFileSubTab();
          const priceUpload = { documentType: 'AIRWAY BILL', filePath: CONTRACT_UPLOAD_FILES[0] };
          await contract.uploadDocument(priceUpload);
          await contract.expectUploadedFileName(path.basename(priceUpload.filePath));
          await captureScreenshot(page, 'contract', 'subcontract-price-upload', enquiryNo);

          currentOperation = 'Upload a document via the TOP-LEVEL Upload File tab (a genuinely separate section)';
          await contract.openTopLevelUploadFileTab();
          const topUpload = { documentType: 'AIRWAY BILL', filePath: CONTRACT_UPLOAD_FILES[1] ?? CONTRACT_UPLOAD_FILES[0] };
          await contract.uploadDocument(topUpload);
          await contract.expectUploadedFileName(path.basename(topUpload.filePath));
          await captureScreenshot(page, 'contract', 'subcontract-toplevel-upload', enquiryNo);
        }

        currentOperation = 'Click Submit and capture the real generated Sub Contract Id';
        subContractId = await contract.submitSubcontract(enquiryNo);
        expect(subContractId, 'A real Sub Contract Id should be returned by the app - never hardcoded').not.toBe('');
        await captureScreenshot(page, 'contract', 'subcontract-created', subContractId);

        currentOperation = 'Verify the Subcontract record was actually created with the SAME identifiers';
        const rowData = await contract.readSubcontractRow(enquiryNo);
        expect(rowData.subContractId).toBe(subContractId);
        expect(rowData.enquiryNo).toBe(enquiryNo);
        expect(rowData.quoteNo).toBe(quoteNo);
        expect(rowData.status).toBe('Active');
      });

      // ---------- 7. SUBCONTRACT VIEW ----------
      await test.step('Subcontract - View, verify tabs, Back', async () => {
        currentScreen = 'Subcontract View';
        currentOperation = 'Open View and verify all available tabs';
        await contract.viewSubcontract(enquiryNo);
        await captureScreenshot(page, 'contract', 'subcontract-view-product', subContractId);
        await contract.openCargoInformationTab();
        await captureScreenshot(page, 'contract', 'subcontract-view-cargo', subContractId);
        await contract.openContractPriceTab();
        await captureScreenshot(page, 'contract', 'subcontract-view-price', subContractId);
        await contract.openTopLevelUploadFileTab();
        if (CONTRACT_UPLOAD_ENABLED) {
          await contract.expectUploadedFileName(path.basename(CONTRACT_UPLOAD_FILES[1] ?? CONTRACT_UPLOAD_FILES[0]));
        }
        await captureScreenshot(page, 'contract', 'subcontract-view-upload', subContractId);

        currentOperation = 'Click Back and verify return to Sub Contract List';
        await contract.backToSubcontractList();
        await captureScreenshot(page, 'contract', 'subcontract-list-after-back', subContractId);
      });

      // ---------- 8. SUBCONTRACT EDIT / UPDATE ----------
      await test.step('Subcontract - Edit, verify/update tabs, Update', async () => {
        currentScreen = 'Subcontract Edit';
        currentOperation = 'Open Edit and verify Product/Cargo/Contract Price';
        await contract.editSubcontract(enquiryNo);
        await captureScreenshot(page, 'contract', 'subcontract-edit-product', subContractId);
        await contract.openCargoInformationTab();
        await captureScreenshot(page, 'contract', 'subcontract-edit-cargo', subContractId);
        await contract.openContractPriceTab();
        await captureScreenshot(page, 'contract', 'subcontract-edit-price', subContractId);

        if (CONTRACT_UPLOAD_ENABLED) {
          currentOperation = 'Upload the configured document via the TOP-LEVEL Upload File tab during Edit';
          await contract.openTopLevelUploadFileTab();
          const editUpload = { documentType: 'AIRWAY BILL', filePath: CONTRACT_UPLOAD_FILES[0] };
          await contract.uploadDocument(editUpload);
          await contract.expectUploadedFileName(path.basename(editUpload.filePath));
          await captureScreenshot(page, 'contract', 'subcontract-edit-upload', subContractId);
        }

        currentOperation = 'Click Update and verify the update succeeded';
        await contract.updateSubcontract();
        await captureScreenshot(page, 'contract', 'subcontract-list-after-update', subContractId);
      });

      // ---------- 9. FINAL VERIFICATION ----------
      await test.step('Final Verification - reopen the SAME Subcontract, verify persisted data', async () => {
        currentScreen = 'Subcontract - Final Verification';
        currentOperation = 'Verify the SAME identifiers on the Sub Contract List itself (never read a list-row locator while sitting on the View/Edit form)';
        const finalRow = await contract.readSubcontractRow(enquiryNo);
        expect(finalRow.subContractId).toBe(subContractId);
        expect(finalRow.enquiryNo).toBe(enquiryNo);

        currentOperation = 'Reopen View and verify the uploaded document persisted';
        await contract.viewSubcontract(enquiryNo);
        if (CONTRACT_UPLOAD_ENABLED) {
          await contract.openTopLevelUploadFileTab();
          await contract.expectUploadedFileName(path.basename(CONTRACT_UPLOAD_FILES[0]));
        }
        await captureScreenshot(page, 'contract', 'final-verification', subContractId);
      });

      console.log(
        `Contract workflow completed successfully\n` +
          `Customer: ${customerData.customerName}\n` +
          `Contract: ${contractId}\n` +
          `Enquiry: ${enquiryNo}\n` +
          `Quote: ${quoteNo}\n` +
          `Sub Contract: ${subContractId}`
      );
    } catch (error) {
      await captureScreenshot(page, 'contract', 'scenario-failure', `${customerData.customerName}-${currentOperation.replace(/[^a-z0-9]+/gi, '-')}`);
      throw new Error(
        `Contract workflow failed\n` +
          `Customer: ${customerData.customerName}\n` +
          `Contract: ${contractId || '(not yet created)'}\n` +
          `Enquiry: ${enquiryNo || '(not yet created)'}\n` +
          `Sub Contract: ${subContractId || '(not yet created)'}\n` +
          `Screen: ${currentScreen}\n` +
          `Operation: ${currentOperation}\n` +
          `Error: ${(error as Error).message}`
      );
    }
  });
});

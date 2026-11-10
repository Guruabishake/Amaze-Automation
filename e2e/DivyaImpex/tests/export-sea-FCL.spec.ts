import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { CustomerPage } from '../pages/CustomerPage';
import { VendorPage } from '../pages/VendorPage';
import { EnquiryPage, TRANSPORT_TASKS, TransportRowValues, TransportTaskResult } from '../pages/EnquiryPage';
import { captureEvidence, log, EVIDENCE_DIR } from '../utils/screenshot';
import {
  loginData,
  generateCustomerData,
  generateVendorData,
  generateCargoData,
  enquiryCargoSettings,
  transportData,
  uploadData,
  enquiryUpdate,
  SCENARIO1_STATE_FILE,
  Scenario1State,
} from '../utils/testData';

/**
 * DivyaImpex - Export Sea FCL end-to-end (UI only, one session, no logout between steps):
 * Login -> Customer -> Vendor -> Enquiry (Customer Info, Sea/Export/FCL, TMS Select All, 10+ cargo,
 * Transport assignment + 4 task tables, Upload) -> Create -> Edit/Update -> View/Back -> Initiate Quote -> OK.
 */
test.describe.configure({ mode: 'serial' });

test('DivyaImpex Export Sea FCL: Customer -> Vendor -> Enquiry -> Edit -> View -> Initiate Quote', async ({ page }, testInfo) => {
  const customer = generateCustomerData();
  const vendor = generateVendorData();
  const cargo = generateCargoData();
  const summary: Record<string, unknown> = { customer: customer.customerName, vendor: vendor.vendorName, cargoCount: cargo.length };
  const enquiry = new EnquiryPage(page);
  let enquiryNo = '';

  try {
    await test.step('Login with branch selection', async () => {
      const login = new LoginPage(page);
      await login.goto(loginData.url);
      expect(await login.availableBranches()).toContain(loginData.branch);
      await login.login(loginData.username, loginData.password, loginData.branch);
      await login.verifyLoginSuccess(loginData.branch);
      log(`logged in as ${loginData.username} @ ${loginData.branch}`);
    });

    await test.step('Create and approve Customer', async () => {
      const customers = new CustomerPage(page);
      await customers.navigateFromSidebar();
      await customers.openCreateForm();
      await customers.fillForm(customer);
      await customers.submitAndExpectSuccess();
      await customers.verifyInListing(customer.customerName);
      expect(await customers.approvalStatus(customer.customerName)).toBe('Pending');
      await captureEvidence(page, testInfo, 'customer-created');
      await customers.approveByName(customer.customerName);
      expect(await customers.approvalStatus(customer.customerName)).toBe('Approved');
      log(`customer created + approved: ${customer.customerName}`);
    });

    await test.step('Create and approve Vendor', async () => {
      const vendors = new VendorPage(page);
      await vendors.navigateFromSidebar();
      await vendors.openCreateForm();
      await vendors.fillForm(vendor);
      await vendors.submitAndExpectSuccess();
      await vendors.verifyInListing(vendor.vendorName);
      await captureEvidence(page, testInfo, 'vendor-created');
      if ((await vendors.approvalStatus(vendor.vendorName)) === 'Pending') {
        await vendors.approveByName(vendor.vendorName);
      }
      log(`vendor created: ${vendor.vendorName} (${await vendors.approvalStatus(vendor.vendorName)})`);
    });

    await test.step('Enquiry - Customer Information', async () => {
      await enquiry.navigateFromSidebar();
      await enquiry.openCreateForm();
      await enquiry.selectCustomer(customer.customerName);
      await enquiry.verifyCustomerInformation(customer);
    });

    await test.step('Enquiry - Cargo Information: Sea / Export / FCL, TMS Select All', async () => {
      await enquiry.setShipment(enquiryCargoSettings.shipmentMode, enquiryCargoSettings.shipmentDirection, enquiryCargoSettings.shipmentType);
      await enquiry.selectAllTransportServices();
    });

    await test.step(`Enquiry - Add ${cargo.length} cargo records`, async () => {
      for (const [i, item] of cargo.entries()) {
        await enquiry.addCargo(item);
        log(`cargo ${i + 1}/${cargo.length} added: ${item.containerNo}`);
      }
      await expect(enquiry.cargoRows()).toHaveCount(cargo.length);
      await captureEvidence(page, testInfo, 'cargo-records-added');
    });

    await test.step('Enquiry - Transport: Assigned To + update every task table', async () => {
      const options = await enquiry.assignedToOptions();
      log(`Assigned To options: ${options.join(' | ')}`);
      const assignee = options.find((o) => o.includes(vendor.vendorName)) ?? options[0];
      expect(assignee, 'Assigned To must offer at least one option').toBeTruthy();
      summary.assignedTo = assignee;
      summary.assignedToIsNewVendor = assignee.includes(vendor.vendorName);
      await enquiry.selectAssignedTo(assignee);

      const values: Record<string, TransportRowValues> = {
        'Transport-Goods Pickup': { location: transportData.goodsPickup.from, address: transportData.goodsPickup.address, date: transportData.goodsPickup.date },
        'Transport-Goods Delivery': { location: transportData.goodsDelivery.to, address: transportData.goodsDelivery.address, date: transportData.goodsDelivery.date },
        'Transport-Container Pickup': {
          location: transportData.containerPickup.from,
          address: transportData.containerPickup.address,
          date: transportData.containerPickup.date,
          stuffing: transportData.containerPickup.stuffing,
          stuffingLocation: transportData.containerPickup.stuffingLocation,
        },
        'Transport-Container Delivery': { location: transportData.containerDelivery.to, address: transportData.containerDelivery.address, date: transportData.containerDelivery.date },
      };
      const results: TransportTaskResult[] = [];
      for (const task of TRANSPORT_TASKS) {
        const result = await enquiry.updateTransportTask(task, values[task]);
        results.push(result);
        log(`${task}: ${result.updatedRows}/${result.rows} rows updated ${result.note ? `(${result.note})` : ''}`);
        expect(result.rows, `${task} should have rows`).toBeGreaterThan(0);
        expect(result.updatedRows, `${task}: every row with an Edit button should be updated`).toBe(result.rows);
        await captureEvidence(page, testInfo, `transport-${task.replace('Transport-', '').toLowerCase().replace(/\s+/g, '-')}-updated`);
      }
      summary.transport = results;
    });

    await test.step('Enquiry - Upload File', async () => {
      await enquiry.uploadDocument(uploadData.documentType, uploadData.filePath);
      await captureEvidence(page, testInfo, 'document-uploaded');
    });

    await test.step('Create Enquiry', async () => {
      await enquiry.submitCreate();
      enquiryNo = await enquiry.enquiryNoForCustomer(customer.customerName);
      summary.enquiryNo = enquiryNo;
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText(enquiryCargoSettings.shipmentMode);
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText(enquiryCargoSettings.shipmentType);
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText('Enquiry Created');
      await captureEvidence(page, testInfo, 'enquiry-created');
      log(`enquiry created: ${enquiryNo}`);
    });

    await test.step('Edit -> Update the same Enquiry', async () => {
      await enquiry.openEdit(enquiryNo);
      await enquiry.openTab('Customer Information');
      await enquiry.verifyCustomerInformation(customer);
      await enquiry.openTab('Cargo Information');
      await expect(enquiry.cargoRows()).toHaveCount(cargo.length);
      await enquiry.updateTransportTask(
        'Transport-Goods Pickup',
        { location: transportData.goodsPickup.from, address: enquiryUpdate.goodsPickupAddress, date: transportData.goodsPickup.date },
        true
      );
      await enquiry.submitUpdate();
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toBeVisible();
      await captureEvidence(page, testInfo, 'enquiry-updated');
    });

    await test.step('View the Enquiry -> verify persisted data -> Back', async () => {
      await enquiry.openView(enquiryNo);
      await enquiry.openTab('Customer Information');
      await enquiry.verifyCustomerInformation(customer);
      await enquiry.openTab('Cargo Information');
      await expect(enquiry.cargoRows()).toHaveCount(cargo.length);
      for (const item of cargo) await expect(enquiry.cargoRows().filter({ hasText: item.containerNo })).toHaveCount(1);
      await enquiry.openTransportTask('Transport-Goods Pickup');
      await expect(enquiry.transportRows().first()).toContainText(enquiryUpdate.goodsPickupAddress);
      await enquiry.openTab('Upload File');
      await expect(enquiry.uploadTable()).toContainText(uploadData.documentType);
      await captureEvidence(page, testInfo, 'enquiry-view');
      await enquiry.backToListing();
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toBeVisible();
    });

    await test.step('Initiate Quote -> OK -> verify outcome', async () => {
      const message = await enquiry.initiateQuote(enquiryNo, true);
      log(`Initiate Quote confirmation: "${message}"`);
      summary.initiateQuoteMessage = message;
      expect(message).toContain(enquiryNo);
      // Outcome observed on this app family: navigation to Quotation Generation; otherwise the row status flips.
      await expect
        .poll(async () => {
          if (/quotation/i.test(page.url())) return 'quotation-page';
          const row = enquiry.rowByEnquiryNo(enquiryNo);
          if (await row.isVisible().catch(() => false)) return (await row.innerText()).includes('Quote Initiated') ? 'quote-initiated' : 'pending';
          return 'pending';
        }, { timeout: 30000 })
        .not.toBe('pending');
      summary.finalUrl = page.url();
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await captureEvidence(page, testInfo, 'quote-initiated');

      await enquiry.navigateFromSidebar();
      await expect(enquiry.rowByEnquiryNo(enquiryNo)).toContainText('Quote Initiated');
      summary.finalStatus = 'Quote Initiated';
      log(`final status for ${enquiryNo}: Quote Initiated`);

      // Handoff for Scenario 2 (Quote Generation -> Master Job) - written only after full success.
      const state: Scenario1State = {
        enquiryNo,
        customerName: customer.customerName,
        customerEmail: customer.email,
        vendorName: vendor.vendorName,
        cargoCount: cargo.length,
        cargo,
        completedAt: new Date().toISOString(),
      };
      fs.mkdirSync(path.dirname(SCENARIO1_STATE_FILE), { recursive: true });
      fs.writeFileSync(SCENARIO1_STATE_FILE, JSON.stringify(state, null, 2));
    });
  } catch (error) {
    await captureEvidence(page, testInfo, 'FAILURE').catch(() => undefined);
    throw error;
  } finally {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'run-summary.json'), JSON.stringify(summary, null, 2));
    await testInfo.attach('run-summary', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  }
});

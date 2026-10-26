import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, readDropdownOptions } from '../utils/commonActions';
import { CargoData } from '../utils/testData';

export type TransportTask =
  | 'Transport-Goods Pickup'
  | 'Transport-Goods Delivery'
  | 'Transport-Container Pickup'
  | 'Transport-Container Delivery';

export const TRANSPORT_TASKS: TransportTask[] = [
  'Transport-Goods Pickup',
  'Transport-Goods Delivery',
  'Transport-Container Pickup',
  'Transport-Container Delivery',
];

export interface TransportRowValues {
  location: string; // Pickup From / Delivery To
  address: string; // Pickup Address / Delivery Address
  date: string; // yyyy-mm-dd (native date input)
  stuffing?: string; // Container Pickup only
  stuffingLocation?: string; // Container Pickup only
}

export interface TransportTaskResult {
  task: TransportTask;
  rows: number;
  updatedRows: number;
  note: string;
}

/**
 * CRM -> Sales Management -> Enquiry. Verified live on DivyaImpex (differs from AmazerTrans):
 * - Tabs: Customer Information / Cargo Information / Transport (appears only once TMS options are selected) / Upload File.
 * - Customer Information: only "Customer Id" is editable; Customer Name and Address 1-3 are disabled
 *   and auto-filled from the selected (approved) customer.
 * - Cargo Information: Shipment Mode/Direction/Type + a "Transport Management System" multi-select
 *   (Select All + 4 transport tasks) + "Add Cargo" popup with a single Cargo Name field.
 * - Transport: "Assigned To" + one table per task; each row has an icon-only Edit button opening an
 *   Update popup.
 */
export class EnquiryPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly createButton: Locator;
  readonly createFormHeading: Locator;
  readonly submitButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Enquiry', exact: true });
    this.createButton = page.getByRole('button', { name: /create/i }).first();
    this.createFormHeading = page.getByRole('heading', { name: 'Create Enquiry', exact: true });
    this.submitButton = page.getByRole('button', { name: 'Create', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
  }

  /** "Sales Management" toggles its submenu, so only click it when "Enquiry" isn't already showing. */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const enquiryLink = this.page.getByRole('button', { name: 'Enquiry', exact: true });
    if (!(await enquiryLink.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await enquiryLink.click();
    await expect(this.pageHeading).toBeVisible();
  }

  async openCreateForm() {
    await this.createButton.click();
    await expect(this.createFormHeading).toBeVisible();
  }

  async openTab(tab: 'Customer Information' | 'Cargo Information' | 'Transport' | 'Upload File') {
    await this.page.getByRole('button', { name: tab, exact: true }).click();
  }

  // ---------------- Customer Information ----------------

  async customerIdOptions(): Promise<string[]> {
    await this.openTab('Customer Information');
    return readDropdownOptions(this.page, 'Customer Id');
  }

  /** Options render as "<name> [CUST-xxxxx]" - matched by the unique customer name. */
  async selectCustomer(customerName: string) {
    await this.openTab('Customer Information');
    await selectCustomDropdown(this.page, 'Customer Id', customerName, 'contains');
  }

  async verifyCustomerInformation(expected: { customerName: string; address1: string; address2: string; address3: string }) {
    const tb = (name: string) => this.page.getByRole('textbox', { name, exact: true });
    await expect(tb('Customer Name')).toHaveValue(expected.customerName);
    await expect(tb('Address 1')).toHaveValue(expected.address1);
    await expect(tb('Address 2')).toHaveValue(expected.address2);
    await expect(tb('Address 3')).toHaveValue(expected.address3);
  }

  // ---------------- Cargo Information ----------------

  async setShipment(mode: string, direction: string, type: string) {
    await this.openTab('Cargo Information');
    await selectCustomDropdown(this.page, 'Shipment Mode', mode);
    await selectCustomDropdown(this.page, 'Shipment Direction', direction);
    await selectCustomDropdown(this.page, 'Shipment Type', type);
  }

  private tmsTrigger(): Locator {
    // The TMS multi-select is a <button> (not role=combobox) sharing a wrapper with its floating label.
    return this.page
      .locator('div.relative', { has: this.page.getByText('Transport Management System', { exact: true }) })
      .last()
      .getByRole('button')
      .first();
  }

  /** Opens the TMS multi-select, ticks "Select All", verifies every task got ticked, then closes the list. */
  async selectAllTransportServices() {
    await this.openTab('Cargo Information');
    await this.tmsTrigger().click();
    const selectAll = this.page.getByRole('checkbox', { name: 'Select All', exact: true });
    await selectAll.check();
    await expect(selectAll).toBeChecked();
    for (const task of ['Transport Goods Pickup', 'Transport Goods Delivery', 'Transport Container Pickup', 'Transport Container Delivery']) {
      await expect(this.page.getByRole('checkbox', { name: task, exact: true })).toBeChecked();
    }
    await this.tmsTrigger().click();
    await expect(selectAll).toBeHidden();
    await expect(this.page.getByRole('button', { name: 'Transport', exact: true })).toBeVisible();
  }

  cargoTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Cargo Name' }) });
  }

  /** Data rows only (header row and the "No data available" placeholder excluded). */
  cargoRows(): Locator {
    return this.cargoTable().locator('tbody tr').filter({ hasNotText: 'No data available' });
  }

  async addCargo(cargo: CargoData) {
    await this.openTab('Cargo Information');
    const before = await this.cargoRows().count();
    await this.page.getByRole('button', { name: /add cargo/i }).click();
    await this.page.getByRole('textbox', { name: 'Container No', exact: true }).fill(cargo.containerNo);
    await selectCustomDropdown(this.page, 'Size Of Container', cargo.containerSize);
    await selectCustomDropdown(this.page, 'Type Of Container', cargo.containerType);
    // Cargo Name is an autocomplete input (role=combobox) - free text is accepted.
    await this.page.getByRole('combobox', { name: 'Cargo Name' }).fill(cargo.cargoName);
    await this.page.getByRole('textbox', { name: 'No Of Packages', exact: true }).click();
    await this.page.getByRole('textbox', { name: 'No Of Packages', exact: true }).fill(cargo.noOfPackages);
    await this.page.getByRole('textbox', { name: 'Gross Wt', exact: true }).fill(cargo.grossWt);
    await this.page.getByRole('textbox', { name: 'Net Wt', exact: true }).fill(cargo.netWt);
    await selectCustomDropdown(this.page, 'UOM', cargo.uom);
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(this.cargoRows()).toHaveCount(before + 1);
    const row = this.cargoRows().filter({ hasText: cargo.containerNo });
    await expect(row).toHaveCount(1);
    for (const value of [cargo.containerSize, cargo.containerType, cargo.cargoName, cargo.noOfPackages, cargo.grossWt, cargo.netWt, cargo.uom]) {
      await expect(row).toContainText(value);
    }
  }

  // ---------------- Transport ----------------

  async assignedToOptions(): Promise<string[]> {
    await this.openTab('Transport');
    return readDropdownOptions(this.page, 'Assigned To');
  }

  async selectAssignedTo(option: string) {
    await this.openTab('Transport');
    await selectCustomDropdown(this.page, 'Assigned To', option);
  }

  transportTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Est Date' }) });
  }

  transportRows(): Locator {
    return this.transportTable().locator('tbody tr').filter({ hasNotText: 'No data available' });
  }

  async openTransportTask(task: TransportTask) {
    await this.openTab('Transport');
    const tab = this.page.getByRole('button', { name: task, exact: true });
    await expect(tab, `${task} tab should be available`).toBeVisible();
    await tab.click();
  }

  /**
   * Edits every row of one transport task table via its row Edit button and the popup's Update button.
   * A row without an enabled Edit button is recorded, never force-clicked. Returns what actually happened.
   *
   * The popup and the page can both show an "Update" button (on the Update Enquiry screen); the
   * popup renders before the page footer in the DOM, so the popup's is `.first()`.
   */
  async updateTransportTask(task: TransportTask, values: TransportRowValues, onlyFirstRow = false): Promise<TransportTaskResult> {
    await this.openTransportTask(task);
    const rows = this.transportRows();
    const rowCount = await rows.count();
    const isPickup = task.endsWith('Pickup');
    const locationLabel = isPickup ? 'Pickup From' : 'Delivery To';
    const addressLabel = isPickup ? 'Pickup Address' : 'Delivery Address';
    let updated = 0;
    const notes: string[] = [];
    const limit = onlyFirstRow ? Math.min(1, rowCount) : rowCount;

    for (let i = 0; i < limit; i++) {
      const row = rows.nth(i);
      const editButton = row.locator('td').last().getByRole('button').first();
      if ((await editButton.count()) === 0 || !(await editButton.isEnabled())) {
        notes.push(`row ${i + 1}: no enabled Edit button`);
        continue;
      }
      await editButton.click();
      const location = this.page.getByRole('textbox', { name: locationLabel, exact: true });
      await expect(location).toBeVisible();
      await location.fill(values.location);
      await this.page.getByRole('textbox', { name: addressLabel, exact: true }).fill(values.address);
      if (task === 'Transport-Container Pickup') {
        if (values.stuffing) await selectCustomDropdown(this.page, 'Stuffing', values.stuffing);
        if (values.stuffingLocation) await this.page.getByRole('textbox', { name: 'Stuffing Location', exact: true }).fill(values.stuffingLocation);
      }
      await this.page.getByRole('textbox', { name: 'Est Date', exact: true }).fill(values.date);
      await this.page.getByRole('button', { name: 'Update', exact: true }).first().click();
      await expect(location).toBeHidden();
      await expect(row).toContainText(values.location);
      await expect(row).toContainText(values.address);
      if (task === 'Transport-Container Pickup' && values.stuffingLocation) await expect(row).toContainText(values.stuffingLocation);
      updated++;
    }
    if (rowCount === 0) notes.push('table has no rows');
    return { task, rows: rowCount, updatedRows: updated, note: notes.join('; ') };
  }

  // ---------------- Upload File ----------------

  uploadTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'File Name' }) });
  }

  async documentTypeOptions(): Promise<string[]> {
    await this.openTab('Upload File');
    return readDropdownOptions(this.page, 'Document Type');
  }

  async uploadDocument(documentType: string, filePath: string) {
    await this.openTab('Upload File');
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    const fileName = filePath.split(/[\\/]/).pop()!;
    await this.page.getByRole('button', { name: 'Upload', exact: true }).click();
    const row = this.uploadTable().locator('tbody tr').filter({ hasText: documentType });
    await expect(row.first()).toBeVisible({ timeout: 30000 });
    await expect(row.first()).toContainText(fileName.replace(/\.[^.]+$/, ''));
  }

  // ---------------- Create / list ----------------

  async submitCreate(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (res) => /enquiry/i.test(res.url()) && res.request().method() === 'POST' && !/upload/i.test(res.url()),
      { timeout: 60000 }
    );
    await this.submitButton.click();
    const response = await responsePromise;
    expect(response.ok(), `Create enquiry API failed (${response.status()}): ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible({ timeout: 30000 });
  }

  /** Listing rows are CSS-grid divs; the per-run customer name is unique, so it identifies this run's enquiry. */
  rowByCustomer(customerName: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(customerName, { exact: true }) })
      .first();
  }

  rowByEnquiryNo(enquiryNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(enquiryNo, { exact: true }) })
      .first();
  }

  async enquiryNoForCustomer(customerName: string): Promise<string> {
    const row = this.rowByCustomer(customerName);
    await expect(row).toBeVisible({ timeout: 30000 });
    const match = (await row.innerText()).match(/ENQUIRY-\d+/);
    expect(match, `Enquiry No should be shown in the row for ${customerName}`).not.toBeNull();
    return match![0];
  }

  async openEdit(enquiryNo: string) {
    await this.rowByEnquiryNo(enquiryNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: /Update Enquiry|Edit Enquiry/ })).toBeVisible();
  }

  async submitUpdate() {
    const responsePromise = this.page.waitForResponse(
      (res) => /enquiry/i.test(res.url()) && ['PUT', 'POST', 'PATCH'].includes(res.request().method()) && !/upload/i.test(res.url()),
      { timeout: 60000 }
    );
    await this.page.getByRole('button', { name: 'Update', exact: true }).last().click();
    const response = await responsePromise;
    expect(response.ok(), `Update enquiry API failed (${response.status()}): ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible({ timeout: 30000 });
  }

  async openView(enquiryNo: string) {
    await this.rowByEnquiryNo(enquiryNo).getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: /View Enquiry/ })).toBeVisible();
  }

  async backToListing() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Initiate Quote asks for confirmation. Handles both a native window.confirm (listener armed
   * before the click) and an in-page confirmation popup with an OK button. Returns the confirmation text.
   */
  async initiateQuote(enquiryNo: string, accept: boolean): Promise<string> {
    let nativeMessage = '';
    const handler = async (dialog: import('@playwright/test').Dialog) => {
      nativeMessage = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    };
    this.page.once('dialog', handler);
    await this.rowByEnquiryNo(enquiryNo).getByRole('button', { name: 'Initiate Quote', exact: true }).click();

    const okButton = this.page.getByRole('button', { name: /^(OK|Ok|Yes)$/ });
    const appeared = await okButton
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!nativeMessage && appeared) {
      this.page.off('dialog', handler);
      const popup = this.page.locator('div').filter({ has: okButton.first() }).filter({ hasText: /quote/i }).last();
      const message = (await popup.innerText().catch(() => '')).trim();
      if (accept) await okButton.first().click();
      else await this.page.getByRole('button', { name: /^(Cancel|No)$/ }).first().click();
      return message;
    }
    expect(nativeMessage, 'A confirmation should be shown for Initiate Quote').not.toBe('');
    return nativeMessage;
  }
}

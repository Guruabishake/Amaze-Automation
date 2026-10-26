import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, readToast } from '../utils/commonActions';
import { VendorData } from '../utils/testData';

/**
 * CRM -> Vendor Management. Adapted from e2e/AmazerTrans/pages/VendorPage.ts. Required fields
 * verified live: Vendor Name, Vendor Type, Address 1, Country, State, City, Phone Number.
 * Category Type options: Liner / CFS / Transport / Others.
 */
export class VendorPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly createButton: Locator;
  readonly createFormHeading: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Vendor Management', exact: true });
    this.createButton = page.getByRole('button', { name: /create/i }).first();
    this.createFormHeading = page.getByRole('heading', { name: 'Create Vendor', exact: true });
    this.submitButton = page.getByRole('button', { name: 'Create', exact: true });
  }

  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    await this.page.getByRole('button', { name: 'Vendor Management', exact: true }).click();
    await expect(this.pageHeading).toBeVisible();
  }

  async openCreateForm() {
    await this.createButton.click();
    await expect(this.createFormHeading).toBeVisible();
  }

  async fillForm(data: Partial<VendorData>) {
    const tb = (name: string) => this.page.getByRole('textbox', { name, exact: true });
    if (data.vendorName !== undefined) await tb('Vendor Name').fill(data.vendorName);
    if (data.vendorType) await selectCustomDropdown(this.page, 'Vendor Type', data.vendorType);
    // Sub Type is rendered only for Domestic records.
    if (data.subType && (await this.page.getByText('Sub Type', { exact: true }).isVisible())) {
      await selectCustomDropdown(this.page, 'Sub Type', data.subType);
    }
    if (data.categoryType) await selectCustomDropdown(this.page, 'Category Type', data.categoryType);
    if (data.address1 !== undefined) await tb('Address 1').fill(data.address1);
    if (data.address2 !== undefined) await tb('Address 2').fill(data.address2);
    if (data.address3 !== undefined) await tb('Address 3').fill(data.address3);
    if (data.country) await selectCustomDropdown(this.page, 'Country', data.country);
    if (data.state) await selectCustomDropdown(this.page, 'State', data.state);
    if (data.city !== undefined) await tb('City').fill(data.city);
    if (data.phone !== undefined) await tb('Phone Number').fill(data.phone);
    if (data.email !== undefined) await tb('Email Address').fill(data.email);
  }

  async submitAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => /vendor/i.test(res.url()) && /create/i.test(res.url()) && res.request().method() === 'POST'
    );
    await this.submitButton.click();
    const response = await responsePromise;
    expect(response.ok(), `Create vendor API failed (${response.status()}): ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible();
  }

  async submitAndExpectValidationErrors(messages: string[]) {
    await this.submitButton.click();
    for (const message of messages) {
      await expect(this.page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    expect(await readToast(this.page)).toContain('Please fill in all the required fields.');
    await expect(this.createFormHeading).toBeVisible();
  }

  rowByName(name: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .first();
  }

  async verifyInListing(name: string) {
    await expect(this.rowByName(name)).toBeVisible({ timeout: 20000 });
  }

  async approvalStatus(name: string): Promise<string> {
    const text = await this.rowByName(name).innerText();
    return (text.match(/\b(Pending|Approved|Rejected)\b/) || [''])[0];
  }

  async approveByName(name: string) {
    const row = this.rowByName(name);
    await row.getByRole('button', { name: 'Approve or Reject', exact: true }).click();
    await this.page.getByRole('button', { name: 'Approve', exact: true }).click();
    const responsePromise = this.page.waitForResponse((res) => /approve/i.test(res.url()) && res.request().method() !== 'GET');
    await this.page.getByRole('button', { name: 'OK', exact: true }).click();
    const response = await responsePromise;
    expect(response.ok(), `Approve API failed (${response.status()}): ${await response.text()}`).toBeTruthy();
    await expect(row.getByRole('button', { name: 'Approved', exact: true })).toBeDisabled({ timeout: 20000 });
  }
}

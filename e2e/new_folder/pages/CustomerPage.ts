import { Page, Locator } from '@playwright/test';
import * as path from 'path';
const filePath = path.resolve('e2e', 'new_folder', 'assets', 'sample.png');

export class CustomerPage {

  private readonly page: Page;
  private readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: '+ Create' });
  }

  async clickCreate(): Promise<void> {
    await this.page.getByRole('button', { name: 'CRM' }).click();
    await this.page.getByRole('button', { name: 'Customer Management' }).click();
    await this.createButton.waitFor({ state: 'visible' });
    await this.createButton.click();
  }

   async fillCustomerFullForm(): Promise<void> {
    const page = this.page; // Keep using page inside the method

     await page.getByRole('textbox', { name: 'Customer Name' }).click();
  await page.getByRole('textbox', { name: 'Customer Name' }).fill('jeyaram Industries Pvt Lmt');
  await page.getByLabel('Customer Type').selectOption('Domestic');
  await page.getByLabel('Sub Type').selectOption('Regular');
  await page.getByLabel('Gst Applicable').selectOption('Yes');
  await page.getByLabel('Gst Applicable').press('Tab');
  await page.getByRole('textbox', { name: 'Address 1' }).fill('107 south st south bypass');
  await page.getByRole('textbox', { name: 'Address 1' }).press('Tab');
  await page.getByRole('textbox', { name: 'Address 2' }).fill('no need');
  await page.getByRole('textbox', { name: 'Address 2' }).press('Tab');
  await page.getByRole('textbox', { name: 'Address 3' }).fill('no need');
  await page.getByRole('textbox', { name: 'Address 3' }).press('Tab');
  await page.getByLabel('Country').press('Tab');
  await page.getByLabel('State', { exact: true }).selectOption('Tamil Nadu');
  await page.getByLabel('State', { exact: true }).press('Tab');
  await page.getByRole('textbox', { name: 'State Code' }).press('Tab');
  await page.getByRole('textbox', { name: 'City' }).fill('tirunelveli');
  await page.getByRole('textbox', { name: 'City' }).press('Tab');
  await page.getByRole('textbox', { name: 'Phone Number' }).fill('9876546546');
  await page.getByRole('textbox', { name: 'Phone Number' }).press('Tab');
  await page.getByRole('textbox', { name: 'Email Address' }).fill('raguram@gmail.com');
  await page.getByRole('textbox', { name: 'Email Address' }).press('Tab');
  await page.getByRole('textbox', { name: 'PAN' }).fill('PVN8757487');
  await page.getByRole('textbox', { name: 'PAN' }).press('Tab');
  await page.getByRole('textbox', { name: 'IEC' }).fill('876898484');
  await page.getByRole('textbox', { name: 'IEC' }).press('Tab');
  await page.getByRole('textbox', { name: 'CIN No' }).fill('9844fssd8978s98df98');
  await page.getByRole('textbox', { name: 'CIN No' }).press('Tab');
  await page.getByLabel('Status').press('Tab');
  await page.getByRole('button', { name: 'Cancel' }).press('Tab');
  await page.locator('div').filter({ hasText: /^Contact Details$/ }).nth(1).click();
  await page.getByRole('textbox', { name: 'First Name' }).click();
  await page.getByRole('textbox', { name: 'First Name' }).fill('Murugan');
  await page.getByRole('textbox', { name: 'First Name' }).press('Tab');
  await page.getByRole('textbox', { name: 'Last Name' }).fill('muruga');
  await page.getByRole('textbox', { name: 'Last Name' }).press('Tab');
  await page.getByRole('textbox', { name: 'Designation' }).fill('head');
  await page.getByRole('textbox', { name: 'Designation' }).press('Tab');
  await page.locator('#phone_no').nth(1).fill('6549865449');
  await page.locator('#phone_no').nth(1).press('Tab');
  await page.locator('#email').nth(1).fill('murugan@gmail.com');
  await page.locator('#email').nth(1).press('Tab');
  await page.locator('div').filter({ hasText: /^Bank Details$/ }).nth(1).click();
  await page.getByRole('textbox', { name: 'Bank Name' }).click();
  await page.getByRole('textbox', { name: 'Bank Name' }).fill('IOB');
  await page.getByRole('textbox', { name: 'Bank Name' }).press('Tab');
  await page.getByRole('textbox', { name: 'Account Number' }).fill('9874586498498498');
  await page.getByRole('textbox', { name: 'Account Number' }).press('Tab');
  await page.getByLabel('Account Type').selectOption('savings');
  await page.getByLabel('Account Type').press('Tab');
  await page.getByRole('textbox', { name: 'IFSC Code' }).fill('IFST54656');
  await page.getByRole('textbox', { name: 'IFSC Code' }).press('Tab');
  await page.getByRole('textbox', { name: 'Branch Name' }).fill('MUMBAIU');
  await page.getByRole('textbox', { name: 'Branch Name' }).press('Tab');
  await page.locator('div').filter({ hasText: /^KYC Details$/ }).nth(1).click();
  await page.locator('#state').nth(1).selectOption('Tamil Nadu');
  await page.getByRole('textbox', { name: 'GST No' }).fill('DF98868FD7DF');
  await page.getByRole('textbox', { name: 'GST No' }).press('Tab');
  await page.getByRole('textbox', { name: 'Branch 1' }).fill('Mumbai');
  await page.getByRole('textbox', { name: 'Branch 1' }).press('Tab');
  await page.getByRole('textbox', { name: 'Branch Address' }).fill('abhudabi');
  await page.getByRole('textbox', { name: 'Branch Address' }).press('Tab');
  await page.getByRole('textbox', { name: 'Pincode' }).fill('978654');
  await page.getByRole('textbox', { name: 'Pincode' }).press('Tab');
  await page.locator('div').filter({ hasText: /^KYC Document Upload$/ }).nth(1).click();
  await page.getByLabel('Document Type').selectOption('Aadhar');
  await page.setInputFiles('input[type="file"]', filePath);
  await page.waitForTimeout(5000); // Wait for the file to be processed
  await page.getByRole('button', { name: 'Upload' }).click();
  await page.locator('div').filter({ hasText: /^Credit Details$/ }).nth(1).click();
  await page.getByRole('checkbox', { name: 'Invoice Overdue' }).check();
  await page.getByRole('checkbox', { name: 'Credit On Hold' }).check();
  await page.getByRole('textbox', { name: 'Payment Terms (In Days)' }).click();
  await page.getByRole('textbox', { name: 'Payment Terms (In Days)' }).fill('20');
  await page.locator('div').filter({ hasText: /^Payment Terms \(In Days\)Invoice Overdue Credit LimitsCredit On Hold$/ }).first().click();
  await page.getByRole('textbox', { name: 'Credit Limits' }).click();
  await page.getByRole('textbox', { name: 'Credit Limits' }).fill('20');
  await page.getByRole('button', { name: 'Create' }).click();
  }
}



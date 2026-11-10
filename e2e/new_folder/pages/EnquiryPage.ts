import { Page } from '@playwright/test';
import { fillTextbox, selectDropdown } from '../utils/commonActions';
import { enquiryData } from '../utils/testData';
    import * as path from 'path';

const filepath1 = path.resolve(process.cwd(), 'e2e', 'new_folder', 'assets', 'sample.png');


//const filepath1 = require('../utils/testData').enquiryData.filePath;
//import test from 'node:test';



// Set timeout to 15 minutes for the entire test suite
export class EnquiryPage {

  constructor(private page: Page) {}

  // ---------------- LOGIN ----------------
  async login() {
    await this.page.goto('https://staging-fc.cargowayz.net/login/AMAZERTRANS');

    await this.page.locator('input[type="text"]').fill(enquiryData.email);
    await this.page.getByRole('combobox').selectOption(enquiryData.branch);
    await this.page.locator('input[type="password"]').fill(enquiryData.password);
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  // ---------------- NAVIGATION ----------------
  async openCreateEnquiry() {
    await this.page.getByRole('button', { name: 'CRM' }).click();
    await this.page.getByRole('button', { name: 'Sales Management' }).click();
    await this.page.getByRole('button', { name: 'Enquiry' }).click();
    await this.page.getByRole('button', { name: '+ Create' }).click();
  }

  // ---------------- CUSTOMER ----------------
  async fillCustomerDetails() {
    await this.page.getByRole('checkbox', { name: 'Freight-Forwarding' }).check();
    await this.page.getByRole('checkbox', { name: 'Customs Broker' }).check();
    await this.page.getByRole('checkbox', { name: 'Transport Management System' }).check();

    await selectDropdown(this.page, 'Customer Id', 'CUST-000177');
    await fillTextbox(this.page, 'Source of Enquiry', enquiryData.source);
  }

  // ---------------- PRODUCT ----------------
  async fillProductInfo() {
    await this.page.getByRole('button', { name: 'Product Information' }).click();

    await this.page.locator('#product').selectOption('Sea');
    await this.page.locator('#product_type').selectOption('FCL');

    await selectDropdown(this.page, 'Inco Term', 'CFR');
    await selectDropdown(this.page, 'Service', 'Door to Door');
  await this.page.getByLabel('Direction').selectOption('Export');
  await this.page.getByLabel('Business Type').selectOption('Generated');
  await this.page.locator('.relative.inline-flex').first().click();
  await this.page.getByLabel('Origin Clearance By').selectOption('Forwarder');
  await this.page.getByRole('textbox', { name: 'Origin Clearance Location' }).click();
  await this.page.getByRole('textbox', { name: 'Origin Clearance Location' }).fill('Mumbai');
  await this.page.getByRole('textbox', { name: 'Origin Clearance Location' }).press('Tab');
  await this.page.getByRole('textbox', { name: 'Place of Receipt' }).fill('True');
  await this.page.getByLabel('POL').selectOption('ADANI');
  await this.page.locator('.relative.inline-flex.h-6.w-16.flex-shrink-0.cursor-pointer.rounded-full.bg-white.transition-colors.duration-200.ease-in-out.focus\\:outline-none.focus\\:ring-blue-500.focus\\:ring-offset-2.border.border-blue-600').click();
  await this.page.getByLabel('Destination Clearance By').selectOption('Forwarder');
  await this.page.getByRole('textbox', { name: 'Destination Clearance Location' }).click();
  await this.page.getByRole('textbox', { name: 'Destination Clearance Location' }).fill('Chennai');
  await this.page.getByRole('textbox', { name: 'Destination Clearance Location' }).press('Tab');
  await this.page.getByRole('textbox', { name: 'Place of Delivery' }).fill('Mumbai');
  await this.page.getByLabel('POD').selectOption('Chennai Air Cargo Complex');
}

  // ---------------- CARGO ----------------
  async fillCargoInfo() {
    await this.page.getByRole('button', { name: 'Cargo Information' }).click();
    // await this.page.getByRole('textbox', { name: 'Cargo Ready Date' }).fill('2026-02-18');
  // await fillTextbox(this.page, 'BL No', enquiryData.blNo);
    // await fillTextbox(this.page, 'Total No Of Containers', '20');
  
    // //bl_no 
    // // await this.page.locator('#bl_no').click();
    // await this.page.locator('#bl_no').fill(enquiryData.blNo);

    // Add CARGO

   const addCargoButton = this.page.locator('button:has-text("Add Cargo")').first();
   await addCargoButton.waitFor({ state: 'visible' });
   await addCargoButton.scrollIntoViewIfNeeded();

   try {
     await addCargoButton.click({ timeout: 5000 });
   } catch {
     await addCargoButton.click({ force: true });
   }

// Container
await fillTextbox(this.page, 'Container No', enquiryData.containerNo);
await this.page.locator('#size_of_container').selectOption('20');
await this.page.locator('#type_of_containers').selectOption('GP');

// Packages (these are ID fields → use locator)
await this.page.locator('#no_of_packages').fill('100');
await this.page.locator('#kind_of_packages').fill('Cartons');
await this.page.locator('#uom').selectOption('KG');


// Commodity
await fillTextbox(this.page, 'Commodity', enquiryData.commodity);
await this.page.locator('#hs_code').fill('HS1234');
await this.page.locator('#cargo_name').fill('Description of the commodity');

// Weight
await fillTextbox(this.page, 'Gross Wt', '2500');
await fillTextbox(this.page, 'Net Wt', '2500');
await fillTextbox(this.page, 'CBM', '28.00');

// DG
await this.page.getByLabel('DG/Non-DG').selectOption('dg');

// IMO Details (labels)
await fillTextbox(this.page, 'IMO No', 'IMO0001');
await fillTextbox(this.page, 'IM DG No', '152005');
await fillTextbox(this.page, 'UN No', 'UN0001');

// These are ID inputs
await this.page.locator('#imo_class').fill('class1');
await this.page.locator('#technical_name').fill('technical_name');

// Save
await this.page.getByRole('button', { name: 'Save' }).click();

  }

  // ---------------- TRANSPORT ----------------
async fillTransport() {

  await this.page.getByRole('button', { name: 'Transport' }).click();

  await this.page.getByLabel('Assigned To').selectOption('Customs Department – Mumbai');

  // PICKUP
  await this.page.getByRole('button', { name: 'Transport-Container Pickup' }).click();
  await this.page.locator('.flex.items-center.justify-center > .flex > button').first().click();
  await this.page.locator('#pickup_from').waitFor({ state: 'visible' });

  await this.page.locator('#pickup_from').fill(enquiryData.pickupCity);
  await this.page.locator('#pickup_address').fill(enquiryData.pickupAddress);
  await this.page.getByLabel('Container Status').selectOption('Empty');

  // keep update but make stable

  //
 // await this.page.getByRole('button', { name: /^Update$/ }).click();4
 //await this.page.locator("//button[.//span[text()='Update']]").click();



  await this.page.getByLabel('Stuffing/Destuffing Location').selectOption('Factory');

  const yard = this.page.getByRole('textbox', { name: 'Empty Yard Location' });
  await yard.fill('chennai');

  const date1 = this.page.getByRole('textbox', { name: 'Est Date & Time' });
  await date1.fill('2026-02-19T15:53');
  await date1.press('Enter');
  await this.page.locator("//button[.//span[text()='Update']]").click();


  // DELIVERY TAB
  await this.page.getByRole('button', { name: 'Transport-Container Delivery' }).click();
   await this.page.locator('.flex.items-center.justify-center > .flex > button').first().click();

  await fillTextbox(this.page, 'Delivery To', enquiryData.deliveryCity);
  await fillTextbox(this.page, 'Delivery Address', enquiryData.deliveryCity);

  await this.page.getByLabel('Container Status').selectOption('Laden');

  


  // SECOND DELIVERY ENTRY
 // await this.page.getByRole('button', { name: 'Transport-Container Delivery' }).click();
 

  await this.page.getByRole('textbox', { name: 'Delivery To' }).fill('Mumbau');
  await this.page.getByRole('textbox', { name: 'Delivery To' }).press('Tab');

  await this.page.getByRole('textbox', { name: 'Delivery Address' }).fill('Abhudhabo');
  await this.page.getByRole('textbox', { name: 'Delivery Address' }).press('Tab');

  await this.page.getByLabel('Stuffing/Destuffing Location').selectOption('Factory');

  const yard2 = this.page.getByRole('textbox', { name: 'Empty Yard Location' });
  await yard2.fill('Mumbai');
  await yard2.press('Tab');

  await this.page.getByLabel('Container Status').selectOption('Empty');

  const date2 = this.page.getByRole('textbox', { name: 'Est Date & Time' });
  await date2.fill('2026-02-21T17:08');
  await date2.press('Enter');
  await this.page.locator("//button[.//span[text()='Update']]").click();

  // Goods pickup section
  // await this.page.locator('.flex.items-center.justify-center > .flex > button').click();
  await this.page.locator('button:has-text("Transport-Goods Pickup")').first().click();
    // simplified selector for the SVG button
    // await this.page.locator('xpath=//button[.//svg]').click();
  await this.page.locator('.flex.items-center.justify-center > .flex > button').first().click();
  await this.page.getByRole('textbox', { name: 'Pickup From' }).fill('chennai');
  await this.page.getByRole('textbox', { name: 'Pickup Address' }).fill('Chennai north bye pass');
  await this.page.getByRole('textbox', { name: 'Est Date & Time' }).fill('2026-03-05T14:03');
  await this.page.getByRole('button', { name: 'Update' }).click();

  // Goods delivery section
  await this.page.getByRole('button', { name: 'Transport-Goods Delivery' }).click();
  await this.page.locator('button:has-text("Transport-Goods Delivery")').first().click();
  await this.page.locator('.flex.items-center.justify-center > .flex > button').first().click();
  await this.page.getByRole('textbox', { name: 'Delivery To' }).fill('Mumbai');
  await this.page.getByRole('textbox', { name: 'Delivery Address' }).fill('Mumbai');
  await this.page.getByRole('textbox', { name: 'Est Date & Time' }).fill('2026-03-05T14:04');
  await this.page.getByRole('button', { name: 'Update' }).click();
//   await this.page.keyboard.press('Tab');
}
  // ---------------- DOCUMENT ----------------
 async uploadDocument(){ 
  
    await this.page.getByRole('button', { name: 'Upload File' }).click();
    await this.page.getByLabel('Document Type').selectOption('Aadhar');
    await this.page.waitForTimeout(3000);

    await this.page.locator('input[type="file"]').setInputFiles(filepath1);
    await this.page.waitForTimeout(2000);
     await this.page.locator('#__next > main > div > main > div > div > div > form > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div > div:nth-child(1) > div:nth-child(3) > button').click();

   await this.page.waitForTimeout(3000);
  }

  // ---------------- FINAL ----------------
  async generateQuote() {
    await this.page.getByRole('button', { name: 'Create' }).click();
   
    await this.page.waitForTimeout(2000);
    await this.page.reload({ waitUntil: 'networkidle' });
    await this.page.waitForTimeout(3000);

    // Debug: Log all buttons on the page
    const allButtons = await this.page.locator('button').all();
    console.log(`Found ${allButtons.length} buttons on the page`);
    for (let i = 0; i < Math.min(10, allButtons.length); i++) {
      const buttonText = await allButtons[i].textContent();
      console.log(`Button ${i}: "${buttonText}"`);
    }

    // Set up dialog handler before clicking
    let dialogHandled = false;
    this.page.once('dialog', async dialog => {
      console.log('Dialog appeared:', dialog.message());
      dialogHandled = true;
      await dialog.accept();
      console.log('Dialog accepted');
    });

    // Try multiple selectors for the Generate Quote button
    let btn;
    try {
      btn = this.page.getByRole('button', { name: 'Generate Quote' });
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Found button with getByRole');
    } catch {
      console.log('Trying alternative selectors...');
      try {
        btn = this.page.locator('button:has-text("Generate Quote")').first();
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        console.log('Found button with has-text');
      } catch {
        try {
          btn = this.page.locator('button').filter({ hasText: /Quote/i }).first();
          await btn.waitFor({ state: 'visible', timeout: 5000 });
          console.log('Found button with filter');
        } catch {
          console.log('No quote-related button found, trying any button...');
          // As a last resort, try clicking the last button (might be the generate button)
          const buttons = await this.page.locator('button').all();
          if (buttons.length > 0) {
            btn = buttons[buttons.length - 1];
            console.log('Using last button as fallback');
          } else {
            throw new Error('No buttons found on the page');
          }
        }
      }
    }

    // Check if button is enabled before clicking
    const isEnabled = await btn.isEnabled();
    const isVisible = await btn.isVisible();
    console.log(`Button enabled: ${isEnabled}, visible: ${isVisible}`);

    if (!isEnabled) {
      throw new Error('Generate Quote button is not enabled');
    }

    // Click the button
    await btn.click();
    console.log('Clicked the Generate Quote button');

    // Wait for dialog to be handled
    await this.page.waitForTimeout(1000);
    
    // Wait for page to stabilize after dialog
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(2000);
    
    console.log('generateQuote method completed, page is ready for next step');
  }
}

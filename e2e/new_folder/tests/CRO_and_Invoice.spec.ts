import { test } from '@playwright/test';
import { CROPage } from '../FF/Export_Sea/cro';
import { InvoicePage } from '../FF/Export_Sea/Draftinvoice';
import { LoginPage } from '../pages/LoginPage';
import { loginData } from '../utils/testData';

const uploadFile = 'e2e/new_folder/assets/sample.png';

test.setTimeout(600000);

test('CRO and Invoice Flow', async ({ page }) => {
  const login = new LoginPage(page);

  await login.goto();
  await login.login(loginData.username, loginData.password);

  const cro = new CROPage(page);
  await cro.navigate();
  await cro.openJob();
  await cro.initiateCRO();
  await cro.fillBasicDetails();
  await cro.addContainers();
  await cro.addRoutes();
  await cro.uploadDocument(uploadFile);
  await cro.submit();

  const invoice = new InvoicePage(page);
  await invoice.initiateInvoice();
  await invoice.fillInvoiceHeader();
  await invoice.addCharges();
  await invoice.addVendorCharges();
  await invoice.fillParties();
  await invoice.uploadDocument(uploadFile);
  await invoice.submit();
});

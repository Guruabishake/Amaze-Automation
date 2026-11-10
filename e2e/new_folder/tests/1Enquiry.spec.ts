import { test } from '@playwright/test';
import { EnquiryPage } from '../pages/EnquiryPage';
test.setTimeout(900000);  

test('Create Enquiry End-to-End', async ({ page }) => {
  const enquiry = new EnquiryPage(page);
  await enquiry.login();
  await enquiry.openCreateEnquiry();
  await enquiry.fillCustomerDetails();
  await enquiry.fillProductInfo();
  await enquiry.fillCargoInfo();
  await enquiry.fillTransport();
  await enquiry.uploadDocument();
  await enquiry.generateQuote();
});

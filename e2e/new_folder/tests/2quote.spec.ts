import { test } from '@playwright/test';
import { EnquiryPage } from '../pages/EnquiryPage';
import { QuoteGen } from '../pages/Quotegen';
test.setTimeout(900000);

test('Quotation Generation Flow', async ({ page }) => {

  // First create an enquiry
  const enquiry = new EnquiryPage(page);
  await enquiry.login();
  await enquiry.openCreateEnquiry();
  await enquiry.fillCustomerDetails();
  await enquiry.fillProductInfo();
  await enquiry.fillCargoInfo();
  await enquiry.fillTransport();
  await enquiry.uploadDocument();
  await enquiry.generateQuote();

  // Then proceed with quotation generation
  const quote = new QuoteGen(page);
  await quote.openQuotationGeneration();
  await quote.fillProductInfo();
  await quote.addOrigin();
  await quote.addInternational();
  await quote.addDestination();
  await quote.uploadDocument();
  await quote.finalizeQuote();

});


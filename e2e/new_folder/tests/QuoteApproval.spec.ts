import { test } from '@playwright/test';
import { QuoteApprovalPage } from '../pages/QuoteApprovalPage';

test('Quote Approval Flow', async ({ page }) => {

  const quote = new QuoteApprovalPage(page);

  await quote.login();

  await quote.approveQuote();

  await quote.confirmQuote();

  await quote.confirmMasterJob();

  await quote.generateBookingJob();

});
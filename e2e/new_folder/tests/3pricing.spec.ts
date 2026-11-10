import { test } from '@playwright/test';
import { PricingPage } from '../pages/PricingPage';

test('Pricing Flow', async ({ page }) => {

  const pricing = new PricingPage(page);

  await pricing.navigateToPricing();
  await pricing.editOriginCharges();
  await pricing.editInternational();
  await pricing.editDestination();
  await pricing.uploadAndSubmit();

});

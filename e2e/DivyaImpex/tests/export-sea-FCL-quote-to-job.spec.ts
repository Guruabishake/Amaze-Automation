import { test, expect, Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { QuotePage, RateRow } from '../pages/QuotePage';
import { captureEvidence, log, EVIDENCE_DIR } from '../utils/screenshot';
import {
  loginData,
  SCENARIO1_STATE_FILE,
  Scenario1State,
  quoteSettings,
  rateData,
  rateSparePool,
  rateEdits,
  RateData,
  referenceInvoiceNo,
  SCENARIO2_STATE_FILE,
  Scenario2State,
} from '../utils/testData';

/**
 * DivyaImpex Scenario 2 - Quote Generation -> Master Job, continuing the quote that Scenario 1
 * (export-sea-FCL.spec.ts) initiated. The "scenario2" project depends on "scenario1", so a normal run
 * executes Scenario 1 first; this test then reads Scenario 1's handoff file and refuses to touch any
 * quote that is not the one it created (or that is no longer in "Quote Initiated").
 *
 * Order: Edit -> Quote Type / Charge Descriptions / CB + TMS vendor -> 5+ rates (duplicate handling)
 * -> edit 2 rates -> delete 1 rate -> Update -> View/Back -> Print (new tab) -> Approve -> Email
 * -> Confirm Quote -> Generate Job (manual Reference Invoice No) -> verify job.
 */
test.describe.configure({ mode: 'serial' });

function readScenario1State(): Scenario1State {
  if (!fs.existsSync(SCENARIO1_STATE_FILE)) {
    throw new Error(`BLOCKER: Scenario 1 has not completed successfully (no handoff at ${SCENARIO1_STATE_FILE}). Run the scenario1 project first.`);
  }
  return JSON.parse(fs.readFileSync(SCENARIO1_STATE_FILE, 'utf8')) as Scenario1State;
}

async function printQuote(quote: QuotePage, page: Page, testInfo: TestInfo, enquiryNo: string, summary: Record<string, unknown>) {
  const printPage = await quote.printFromList(enquiryNo, page.context());
  summary.printUrl = printPage.url();
  // The print tab can be held by the browser print flow, so every read is time-boxed.
  const timeBox = <T,>(p: Promise<T>, fallback: T) => Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), 8000))]);
  summary.printTitle = await timeBox(printPage.title().catch(() => ''), '(unreadable)');
  summary.printText = (await timeBox(printPage.locator('body').innerText().catch(() => ''), '(unreadable)')).replace(/\s+/g, ' ').slice(0, 300);
  log(`print tab opened: url="${printPage.url()}" title="${summary.printTitle}" text="${String(summary.printText).slice(0, 120)}"`);
  summary.printRequests = quote.printRequests.filter((r) => !/socket|\.js|\.css/i.test(r));
  log(`print requests: ${JSON.stringify(summary.printRequests)}`);
  expect(printPage, 'Print must open a separate tab').not.toBe(page);
  expect(printPage.url()).not.toBe('about:blank');
  // Best-effort: a tab blocked in the browser print flow may not be capturable.
  await printPage.screenshot({ path: path.join(EVIDENCE_DIR, 'print-popup-opened.png'), timeout: 15000 }).catch(() => log('print tab could not be screenshotted (browser print flow)'));
  if (fs.existsSync(path.join(EVIDENCE_DIR, 'print-popup-opened.png'))) {
    await testInfo.attach('print-popup-opened', { path: path.join(EVIDENCE_DIR, 'print-popup-opened.png'), contentType: 'image/png' });
  }
  // Closing only the print tab (never the application tab); runBeforeUnload:false so a pending print can't block it.
  await printPage.close({ runBeforeUnload: false }).catch(() => undefined);
  expect(page.isClosed(), 'Original application tab must stay open').toBe(false);
  // Original application tab is still the working page and still usable.
  await page.bringToFront();
  await expect(quote.listHeading).toBeVisible();
  await expect(quote.rowByEnquiryNo(enquiryNo)).toBeVisible();
  await captureEvidence(page, testInfo, 'original-tab-restored');
}

test('DivyaImpex Scenario 2: Quote Generation -> Approve -> Email -> Confirm -> Master Job', async ({ page }, testInfo) => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const state = readScenario1State();
  const quote = new QuotePage(page);
  const summary: Record<string, unknown> = { enquiryNo: state.enquiryNo, customer: state.customerName };
  let quoteNo = '';
  let printDone = false;
  let baselineRows = 0; // rows the app adds itself (Charge Descriptions "Select All" adds e.g. "CFS charges")

  try {
    await test.step('Precondition: login on Metro Freight Terminal and locate this execution\'s quote', async () => {
      const login = new LoginPage(page);
      await login.goto(loginData.url);
      await login.login(loginData.username, loginData.password, loginData.branch);
      await login.verifyLoginSuccess(loginData.branch);
      await quote.navigateFromSidebar();
      quoteNo = await quote.quoteNoForEnquiry(state.enquiryNo);
      summary.quoteNo = quoteNo;
      await expect(quote.rowByEnquiryNo(state.enquiryNo)).toContainText(state.customerName);
      const status = await quote.rowStatus(state.enquiryNo);
      expect(status, `BLOCKER: ${quoteNo} (${state.enquiryNo}) must still be "Quote Initiated"; it is "${status}". Re-run Scenario 1.`).toBe('Quote Initiated');
      log(`using ${quoteNo} for ${state.enquiryNo} (${state.customerName})`);
    });

    await test.step('Phase A: open quote, Quote Type, Charge Descriptions, CB/TMS vendors', async () => {
      await quote.openEdit(state.enquiryNo, quoteNo);
      await quote.openTab('Customer Information');
      await expect(page.getByRole('textbox', { name: 'Customer Name', exact: true })).toHaveValue(state.customerName);
      await quote.openTab('Cargo Information');
      await expect(page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Cargo Name' }) }).locator('tbody tr')).toHaveCount(state.cargoCount);
      await quote.openTab('Quote');
      await expect(page.getByRole('button', { name: /add rate/i })).toBeVisible();
      await captureEvidence(page, testInfo, 'quote-opened-for-edit');

      const types = await quote.quoteTypeOptions();
      log(`Quote Type options: ${types.join(' | ')}`);
      expect(types).toContain(quoteSettings.quoteType);
      await quote.selectQuoteType(quoteSettings.quoteType);
      const descriptions = await quote.selectAllChargeDescriptions();
      expect(descriptions.length, 'Charge Descriptions should offer at least one item').toBeGreaterThan(0);
      summary.quoteType = quoteSettings.quoteType;
      summary.chargeDescriptions = descriptions;
      log(`Charge Descriptions selected: ${descriptions.join(', ')}`);
      await captureEvidence(page, testInfo, 'quote-type-and-charge-descriptions');

      for (const kind of ['CB Vendor', 'TMS Vendor'] as const) {
        const options = await quote.vendorOptions(kind);
        log(`${kind} options: ${options.join(' | ')}`);
        expect(options, `BLOCKER: Scenario 1 vendor "${state.vendorName}" is not offered as ${kind}`).toContain(state.vendorName);
        await quote.selectVendor(kind, state.vendorName);
      }
      summary.cbVendor = state.vendorName;
      summary.tmsVendor = state.vendorName;
      await captureEvidence(page, testInfo, 'cb-and-tms-vendors-selected');
    });

    await test.step('Phase B: add 5+ distinct rates (with duplicate-description handling)', async () => {
      const baseline = await quote.readRateRows();
      baselineRows = baseline.length;
      summary.autoAddedRows = baseline;
      const used = new Set(baseline.map((r) => r.chargeDescription));
      const queue: RateData[] = [...rateData];
      const spares: RateData[] = [...rateSparePool];
      const rejected: Array<{ chargeDescription: string; message: string }> = [];
      const short = (d: string) => d.replace(/\s+-\s+(Direct|Indirect|Operating) Incomes.*$/, '');

      while (queue.length) {
        const rate = queue.shift()!;
        if (used.has(short(rate.chargeDescription))) {
          if (spares.length) queue.push(spares.shift()!);
          continue;
        }
        const result = await quote.addRate(rate);
        if (result.added) {
          used.add(result.row.chargeDescription);
          log(`rate added: ${result.row.chargeDescription} ${result.row.quantity} x ${result.row.rate} ${result.row.currency} @ ${result.row.exchangeRate} = ${result.row.valueInInr}`);
        } else {
          rejected.push({ chargeDescription: rate.chargeDescription, message: result.message });
          used.add(short(rate.chargeDescription)); // never resubmit the same value
          log(`rate rejected (${rate.chargeDescription}): ${result.message}`);
          if (spares.length) queue.push(spares.shift()!);
        }
      }

      // Deliberate duplicate attempt, to observe the app's actual duplicate behaviour.
      const duplicate = { ...rateData[0], quantity: '1', rate: '99', currency: 'INR' };
      const dup = await quote.addRate(duplicate);
      summary.duplicateBehaviour = dup.added
        ? 'Duplicate Charge Description was accepted on Add (no duplicate validation at row level)'
        : `Duplicate rejected: ${dup.message}`;
      log(String(summary.duplicateBehaviour));
      summary.rejectedRates = rejected;

      const ours = (await quote.readRateRows()).slice(baselineRows);
      const distinct = new Set(ours.map((r) => r.chargeDescription));
      expect(distinct.size, 'At least five distinct valid rate records added by this execution').toBeGreaterThanOrEqual(5);
      summary.ratesAdded = ours.length;
      await captureEvidence(page, testInfo, 'rates-added');
    });

    await test.step('Phase B: edit two rate rows', async () => {
      const updated: RateRow[] = [];
      for (const change of rateEdits) {
        const index = baselineRows + change.nth;
        updated.push(await quote.editRate(index, change));
        log(`rate row ${index + 1} updated -> qty ${updated.at(-1)!.quantity}, rate ${updated.at(-1)!.rate}, INR ${updated.at(-1)!.valueInInr}`);
      }
      summary.ratesUpdated = updated.length;
      await captureEvidence(page, testInfo, 'rates-updated');
    });

    await test.step('Phase B: delete one test-created rate row', async () => {
      const rows = await quote.readRateRows();
      // Delete the duplicate row if the app accepted it; otherwise add a spare and delete that -
      // either way only a row created by this execution is removed and >= 5 distinct remain.
      let index = rows.findIndex((r, i) => rows.findIndex((o) => o.chargeDescription === r.chargeDescription) !== i);
      if (index < 0) {
        const spare = rateSparePool.find((s) => !rows.some((r) => s.chargeDescription.startsWith(r.chargeDescription)));
        expect(spare, 'A spare charge description must be available to add-then-delete').toBeTruthy();
        const added = await quote.addRate(spare!);
        expect(added.added, 'Spare rate should be added').toBe(true);
        index = (await quote.rateRows().count()) - 1;
      }
      const target = (await quote.readRateRows())[index];
      const message = await quote.deleteRate(index);
      summary.deleteConfirmation = message;
      summary.deletedRate = target;
      summary.ratesDeleted = 1;
      log(`deleted rate row ${index + 1} (${target.chargeDescription}) - confirmation: "${message}"`);
      const remaining = await quote.readRateRows();
      expect(new Set(remaining.slice(baselineRows).map((r) => r.chargeDescription)).size).toBeGreaterThanOrEqual(5);
      summary.ratesRemaining = remaining;
      await captureEvidence(page, testInfo, 'rate-deleted');
    });

    await test.step('Phase C: Update the quote and verify persistence', async () => {
      const expectedRates = await quote.readRateRows();
      const toast = await quote.submitUpdate();
      summary.updateToast = toast;
      log(`quote update toast: "${toast}"`);
      await captureEvidence(page, testInfo, 'quote-updated');

      await quote.openEdit(state.enquiryNo, quoteNo);
      await quote.openTab('Quote');
      await expect(page.getByRole('button', { name: new RegExp(`^${quoteSettings.quoteType} - \\d+$`) })).toBeVisible();
      expect(await quote.readRateRows()).toEqual(expectedRates);
      await quote.backToList();
      summary.quoteStatusAfterUpdate = await quote.rowStatus(state.enquiryNo);
    });

    await test.step('Phase C: View the quote -> Back', async () => {
      await quote.openView(state.enquiryNo, quoteNo);
      await quote.openTab('Quote');
      const viewRows = await quote.readRateRows();
      expect(viewRows.length).toBe((summary.ratesRemaining as RateRow[]).length);
      // View renders the selections as disabled textboxes (verified live).
      await expect(page.getByRole('textbox', { name: 'Quote Type', exact: true })).toHaveValue(quoteSettings.quoteType);
      await expect(page.getByRole('textbox', { name: 'CB Vendor', exact: true })).toHaveValue(state.vendorName);
      await expect(page.getByRole('textbox', { name: 'TMS Vendor', exact: true })).toHaveValue(state.vendorName);
      expect(viewRows).toEqual(summary.ratesRemaining as RateRow[]);
      await captureEvidence(page, testInfo, 'quote-view');
      await quote.backToList();
      await expect(quote.rowByEnquiryNo(state.enquiryNo)).toBeVisible();
    });

    await test.step('Phase C: Print (new tab) and return to the application tab', async () => {
      if (await quote.rowButton(state.enquiryNo, 'Print').isEnabled()) {
        await printQuote(quote, page, testInfo, state.enquiryNo, summary);
        printDone = true;
      } else {
        summary.printNote = `Print is disabled while the quote is "${await quote.rowStatus(state.enquiryNo)}" - retried after approval`;
        log(String(summary.printNote));
      }
    });

    await test.step('Phase D: Approve the quote', async () => {
      await quote.openEdit(state.enquiryNo, quoteNo);
      await quote.openTab('Quote');
      const { confirmText, toast } = await quote.approve();
      summary.approveConfirmation = confirmText;
      summary.approveToast = toast;
      log(`approve: "${confirmText}" -> toast "${toast}"`);
      await captureEvidence(page, testInfo, 'quote-approved');
      if (!(await quote.listHeading.isVisible())) await quote.navigateFromSidebar();
      await expect.poll(() => quote.rowStatus(state.enquiryNo)).toMatch(/Approved/i);
      summary.statusAfterApprove = await quote.rowStatus(state.enquiryNo);
    });

    if (!printDone) {
      await test.step('Phase C (deferred): Print after approval', async () => {
        await printQuote(quote, page, testInfo, state.enquiryNo, summary);
      });
    }

    await test.step('Phase D: Email the quote', async () => {
      const toast = await quote.sendEmail(state.enquiryNo);
      summary.emailToast = toast;
      log(`email toast: "${toast}" (recipient: test customer ${state.customerEmail})`);
      expect(toast, 'Email should show a notification').not.toBe('');
      expect(toast).not.toMatch(/fail|error|unable/i);
      await captureEvidence(page, testInfo, 'email-success-toast');
    });

    await test.step('Phase E: Confirm the quote', async () => {
      await quote.openEdit(state.enquiryNo, quoteNo);
      await quote.openTab('Quote');
      const { confirmText, toast } = await quote.confirmQuote();
      summary.confirmConfirmation = confirmText;
      summary.confirmToast = toast;
      log(`confirm: "${confirmText}" -> toast "${toast}"`);
      await captureEvidence(page, testInfo, 'quote-confirmed');
      if (!(await quote.listHeading.isVisible())) await quote.navigateFromSidebar();
      await expect.poll(() => quote.rowStatus(state.enquiryNo)).toMatch(/Confirmed/i);
      summary.statusAfterConfirm = await quote.rowStatus(state.enquiryNo);
    });

    await test.step('Phase E: Generate Job -> Confirm Master Job (manual Reference Invoice No)', async () => {
      // Verified live: the app does not auto-generate the Reference Invoice No - it is a required manual input.
      const { popup, referenceInput, referenceInvoice: prefilled, message } = await quote.openGenerateJob(state.enquiryNo);
      summary.confirmMasterJobMessage = message;
      summary.referenceInvoicePrefilled = prefilled || '(empty)';
      log(`Confirm Master Job popup: "${message}" | prefilled Reference Invoice No = "${prefilled}"`);
      await captureEvidence(page, testInfo, 'confirm-master-job-popup');

      // Required-field validation (safe: blocked client-side, nothing is submitted).
      summary.emptyReferenceValidation = await quote.expectEmptyReferenceBlocked(popup, referenceInput);
      log(`empty Reference Invoice No blocked: "${summary.emptyReferenceValidation}"`);

      await quote.enterReferenceInvoice(referenceInput, referenceInvoiceNo);
      summary.referenceInvoice = referenceInvoiceNo;
      await captureEvidence(page, testInfo, 'reference-invoice-entered');

      // Confirm exactly once - never retried, so a slow first attempt can't create a duplicate job.
      const toast = await quote.confirmGenerateJob(popup);
      summary.generateJobToast = toast || '(no toast shown)';
      log(`generate job toast: "${toast}"`);
      await expect(popup, 'Confirm Master Job popup should close after a successful Confirm').toBeHidden({ timeout: 30000 });
      expect(toast, `Job creation reported an error: ${toast}`).not.toMatch(/fail|error|invalid|already|exist/i);

      // Verify the outcome in the UI regardless of the toast: quote row locked as "Job Generated" ...
      if (!(await quote.listHeading.isVisible())) await quote.navigateFromSidebar();
      await expect(quote.rowButton(state.enquiryNo, 'Job Generated')).toBeVisible({ timeout: 30000 });
      await expect(quote.rowButton(state.enquiryNo, 'Job Generated')).toBeDisabled();
      await expect(quote.rowButton(state.enquiryNo, /Edit not allowed once Job is generated/)).toBeDisabled();
      summary.finalStatus = await quote.rowStatus(state.enquiryNo);
      await captureEvidence(page, testInfo, 'master-job-created');

      // ... and the Master Job listed with this execution's reference and customer.
      summary.masterJobRow = await quote.findMasterJob(state.customerName, referenceInvoiceNo);
      await captureEvidence(page, testInfo, 'master-job-in-booking-list');
      const jobId = toast.replace(referenceInvoiceNo, '').match(/\b(?:JOB|MJ|MASTER)[-/]?[A-Z0-9-/]*\d+\b/i);
      summary.masterJobId = jobId ? jobId[0] : 'not displayed by the app (toast / Booking Master Job List show no job number)';
      log(`Master Job created for ${quoteNo}: ref ${referenceInvoiceNo}, job id ${summary.masterJobId}`);

      // Handoff for Scenario 3 - written only after the Master Job is verified in the UI.
      const handoff: Scenario2State = {
        ...state,
        quoteNo,
        referenceInvoiceNo,
        quoteType: quoteSettings.quoteType,
        jobCreatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(SCENARIO2_STATE_FILE, JSON.stringify(handoff, null, 2));
    });
  } catch (error) {
    await captureEvidence(page, testInfo, 'SCENARIO2-FAILURE').catch(() => undefined);
    throw error;
  } finally {
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'scenario2-summary.json'), JSON.stringify(summary, null, 2));
    await testInfo.attach('scenario2-summary', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  }
});

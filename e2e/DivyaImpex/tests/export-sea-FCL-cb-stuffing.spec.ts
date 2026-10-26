import { test, expect, Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { BookingJobPage } from '../pages/BookingJobPage';
import { CBJobPage } from '../pages/CBJobPage';
import { ShippingBillPage } from '../pages/ShippingBillPage';
import { captureEvidence, log, EVIDENCE_DIR } from '../utils/screenshot';
import { recordDefect, allDefects } from '../utils/defects';
import { testFilters, FilterResult } from '../utils/listFilters';
import { FieldOutcome, toIsoDate } from '../utils/formFields';
import { loginData, SCENARIO2_STATE_FILE, SCENARIO3_STATE_FILE, Scenario2State, Scenario3State, scenario3Data } from '../utils/testData';

/**
 * DivyaImpex Scenario 3 - continues the Booking Job created by Scenario 2 (project "scenario3" depends on
 * "scenario2"): Booking Job Master (View/Back, vessel update, Update Job with documents, filters) ->
 * Create CB Job (SB) with the Scenario 2 Reference Invoice No and the Enquiry's original container ->
 * Child Job List (View/Back/Edit/Update, filters) -> Initiate SB -> Shipping Bill (View/Back/Edit/Update,
 * filters) -> Initiate Stuffing.
 *
 * Booking filters run after the Booking updates so every filter field has a real value on this record.
 * State-changing steps check the current UI state first (existing Child Job / "SB Initiated" /
 * "Stuffing Initiated"), so a re-run on the same Scenario 2 data never creates duplicates.
 */
test.describe.configure({ mode: 'serial' });

function readScenario2State(): Scenario2State {
  if (!fs.existsSync(SCENARIO2_STATE_FILE)) {
    throw new Error(`PREREQUISITE FAILED: no Scenario 2 handoff at ${SCENARIO2_STATE_FILE} - Scenario 2 must create the Master Job first.`);
  }
  const s = JSON.parse(fs.readFileSync(SCENARIO2_STATE_FILE, 'utf8')) as Scenario2State;
  const missing = (['enquiryNo', 'quoteNo', 'referenceInvoiceNo', 'customerName'] as const).filter((k) => !s[k]);
  if (!s.cargo?.length || !s.cargo[0].containerNo) missing.push('cargo[0].containerNo' as never);
  if (missing.length) throw new Error(`PREREQUISITE FAILED: Scenario 2 handoff is missing ${missing.join(', ')}.`);
  return s;
}

async function reportUnfilled(testInfo: TestInfo, page: Page, screen: string, outcomes: FieldOutcome[], expectedDisabled: string[] = []) {
  for (const o of outcomes.filter((x) => ['absent', 'disabled', 'no-options'].includes(x.mode))) {
    const field = o.nth ? `${o.label} [${o.nth + 1}]` : o.label;
    if (expectedDisabled.includes(o.label)) {
      log(`${screen} / ${field}: ${o.mode} (expected on this screen)`);
      continue;
    }
    await recordDefect(testInfo, {
      module: 'CRM/CB',
      screen,
      fieldOrAction: field,
      input: o.value,
      expected: 'field present, enabled and offering the value',
      actual: `${o.mode}${o.note ? ` - ${o.note}` : ''}`,
      evidence: await captureEvidence(page, testInfo, `unfilled-${screen}-${field}`.replace(/\W+/g, '-')),
      url: page.url(),
      severity: 'Medium',
      reproducibility: 'Observed in this run',
      classification: o.mode === 'absent' ? 'invalid test data' : 'application defect',
    });
  }
}

test('DivyaImpex Scenario 3: Booking Job Master -> CB Export Sea -> Shipping Bill -> Initiate Stuffing', async ({ page }, testInfo) => {
  test.setTimeout(40 * 60 * 1000);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const s2 = readScenario2State();
  const data = scenario3Data(s2);
  const ref = s2.referenceInvoiceNo;
  const booking = new BookingJobPage(page);
  const cb = new CBJobPage(page);
  const sb = new ShippingBillPage(page);
  const summary: Record<string, unknown> = { enquiryNo: s2.enquiryNo, quoteNo: s2.quoteNo, referenceInvoiceNo: ref, customer: s2.customerName, container: data.cbContainer.containerNo };
  const filters: FilterResult[] = [];
  let bookingJobNo = '';
  let childJobNo = '';

  try {
    await test.step('Phase 1: login and verify the Scenario 2 Booking Job exists', async () => {
      const login = new LoginPage(page);
      await login.goto(loginData.url);
      await login.login(loginData.username, loginData.password, loginData.branch);
      await login.verifyLoginSuccess(loginData.branch);
      await booking.navigate();
      await expect(booking.rowByReference(ref), `PREREQUISITE FAILED: no Booking Job with BL/INVOICE ${ref}`).toBeVisible();
      await expect(booking.rowByReference(ref)).toContainText(s2.customerName);
    });

    await test.step('Phase 2A: Booking Job Master View -> Back', async () => {
      const view = await booking.openView(ref);
      bookingJobNo = view.bookingJobNo;
      summary.bookingView = view;
      expect(bookingJobNo).toMatch(/^JOB-\d+$/);
      expect(view.enquiryNo).toBe(s2.enquiryNo);
      expect(view.quoteNo).toBe(s2.quoteNo);
      await captureEvidence(page, testInfo, 'booking-view');
      await booking.back();
      await expect(booking.rowByReference(ref)).toBeVisible();
      log(`Booking Job ${bookingJobNo} for ${s2.enquiryNo} / ${s2.quoteNo}`);
    });

    await test.step('Phase 2C: Edit -> Cargo Information (vessel block) -> Update', async () => {
      await booking.openEdit(ref);
      const outcomes = await booking.fillVessel(page, data.vessel);
      summary.editVesselOutcomes = outcomes;
      await captureEvidence(page, testInfo, 'booking-edit-cargo-filled');
      await reportUnfilled(testInfo, page, 'Update Booking Master - Cargo Information', outcomes);
      const toast = await booking.submitEdit();
      summary.editUpdateToast = toast;
      log(`Booking Edit update toast: "${toast}"`);
      expect(toast).not.toMatch(/fail|error|invalid/i);
      await captureEvidence(page, testInfo, 'booking-edit-updated');
      // Persistence: reopen and compare every value that was actually set.
      await booking.openEdit(ref);
      const saved = await booking.readVessel(page);
      summary.editVesselSaved = saved;
      const notPersisted: string[] = [];
      for (const o of outcomes.filter((x) => ['text', 'date', 'dropdown'].includes(x.mode))) {
        const key = ['Transhipment Port ETD', 'Mother Vessel', 'Voyage No'].includes(o.label) ? `${o.label}[${o.nth + 1}]` : o.label;
        const shown = saved[key] ?? '';
        if (shown !== o.value && toIsoDate(shown) !== o.value) notPersisted.push(`${key}: saved "${o.value}", reopened shows "${shown}"`);
      }
      summary.editVesselNotPersisted = notPersisted;
      if (notPersisted.length) {
        await recordDefect(testInfo, {
          module: 'CRM', screen: 'Update Booking Master - Cargo Information', fieldOrAction: 'Update (persistence)',
          input: notPersisted.join('; '), expected: 'every updated value is shown again when the Booking Job is reopened',
          actual: `not persisted: ${notPersisted.join('; ')}`,
          evidence: await captureEvidence(page, testInfo, 'booking-edit-reopened-not-persisted'), url: page.url(),
          severity: 'Medium', reproducibility: 'Observed in this run', classification: 'application defect',
        });
      }
      expect.soft(notPersisted, 'Booking Edit values persisted after Update').toEqual([]);
      await booking.navigate();
    });

    await test.step('Phase 2D: Update Job - booking details, vessel, Document Tracking, File Uploads', async () => {
      await booking.openUpdateJob(ref);
      const header = await booking.fillUpdateJobHeader(data.updateJob);
      const vessel = await booking.fillVessel(page, data.vessel);
      summary.updateJobOutcomes = [...header, ...vessel];
      await reportUnfilled(testInfo, page, 'Update Job', [...header, ...vessel], ['SB No']);
      const tracking = await booking.completeDocumentTracking(data.updateJob);
      const upload = await booking.completeFileUpload(data.updateJob);
      summary.documentTrackingRow = `${tracking.reused ? '(already present from an earlier run on this Booking Job, kept) ' : ''}${tracking.row}`;
      summary.fileUploadRow = `${upload.reused ? '(already present from an earlier run on this Booking Job, kept) ' : ''}${upload.row}`;
      await reportUnfilled(testInfo, page, 'Update Job - Documents', [...tracking.outcomes, ...(upload.outcome ? [upload.outcome] : [])]);
      await captureEvidence(page, testInfo, 'update-job-completed');
      const toast = await booking.submitUpdateJob();
      summary.updateJobToast = toast;
      log(`Update Job toast: "${toast}"`);
      expect(toast, 'Update Job should report success').not.toBe('');
      expect(toast).not.toMatch(/fail|error|invalid|required/i);
      await captureEvidence(page, testInfo, 'update-job-saved');

      await booking.navigate();
      await booking.openUpdateJob(ref);
      for (const [label, value] of [
        ['Marks', data.updateJob.marks],
        ['Liner Booking No', data.updateJob.linerBookingNo],
        ['Document Reference Number', data.updateJob.documentReferenceNumber],
        ['BL No.', data.updateJob.blNo],
        ['CFS Name', data.updateJob.cfsName],
      ] as const) {
        await expect.soft(page.getByRole('textbox', { name: label, exact: true }), `${label} persisted`).toHaveValue(value);
      }
      await expect.soft(booking.uploadsTable().locator('tbody'), 'File Uploads row persisted').toContainText(path.basename(data.updateJob.filePath));
      await expect.soft(booking.trackingTable().locator('tbody'), 'Document Tracking row persisted').toContainText(path.basename(data.updateJob.filePath));
      await captureEvidence(page, testInfo, 'update-job-reopened');
      await booking.navigate();
      summary.bookingRowAfterUpdate = await booking.rowValues(ref);
    });

    await test.step('Phase 2B: Booking Job Master filters (each field on its own)', async () => {
      const row = await booking.rowValues(ref);
      const view = summary.bookingView as Record<string, string>;
      const results = await testFilters(page, testInfo, { name: 'Booking Master Job List', module: 'CRM', open: () => booking.navigate(), targetRow: () => booking.rowByReference(ref) }, [
        { label: 'BL/AWB/Invoice', value: ref },
        { label: 'Customer Name', value: s2.customerName },
        { label: 'Document Reference No', value: data.updateJob.documentReferenceNumber },
        { label: 'Liner Booking No', value: data.updateJob.linerBookingNo },
        { label: 'Transit Date', value: row['TRANSIT DATE'] || '', notTestable: row['TRANSIT DATE'] && row['TRANSIT DATE'] !== '--' ? undefined : 'record shows no Transit Date in the list' },
        { label: 'ETA', value: row['ETA'] || '', notTestable: row['ETA'] && row['ETA'] !== '--' ? undefined : 'record shows no ETA in the list' },
        { label: 'Mother/Feeder Vessel Name', value: data.vessel.feederVessel },
        { label: 'CFS Name', value: data.updateJob.cfsName },
        { label: 'Enquiry No', value: s2.enquiryNo },
        { label: 'Quote Number', value: s2.quoteNo },
        { label: 'Booking Job No', value: bookingJobNo },
        { label: 'Customer ID', value: view.customerId },
        { label: 'Import/Export', value: 'Export' },
        { label: 'Booking Status', value: '', notTestable: 'the record\'s Booking Status is not shown in the list or the View screen, so no matching value can be chosen' },
        { label: 'Shipment Type', value: 'FCL' },
      ]);
      filters.push(...results);
    });

    await test.step('Phase 3: Create CB Job (Shipping Bill) linked by the Reference Invoice No', async () => {
      await cb.openChildJobList();
      // Wait for the list to render before deciding: isVisible() alone returned false on a still-loading list
      // and the form was submitted a second time (the app then "updated" the existing Child Job).
      if (await cb.childRow(ref).waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
        summary.cbJobCreation = `reused - a Child Job with BL/Invoice ${ref} already exists (no duplicate created)`;
        log(String(summary.cbJobCreation));
        return;
      }
      await cb.openCreateSB();
      const general = await cb.fillGeneral(data.sbGeneral);
      summary.sbGeneralOutcomes = general;
      await reportUnfilled(testInfo, page, 'Create Manual Job - SB', general);
      await captureEvidence(page, testInfo, 'cb-general-information');

      const invoice = await cb.fillInvoice(ref, data.invoiceDate);
      expect(invoice, 'Invoice No. must equal the Scenario 2 Reference Invoice No exactly').toBe(ref);
      summary.invoiceNoMatch = invoice === ref;
      await captureEvidence(page, testInfo, 'cb-invoice-information');

      summary.packageRow = await cb.addPackage(data.cbPackage);
      const container = await cb.addContainer(data.cbContainer);
      summary.containerRow = container.row;
      summary.containerOutcomes = container.outcomes;
      expect(container.row).toContain(s2.cargo[0].containerNo);
      await reportUnfilled(testInfo, page, 'Add Container', container.outcomes);
      summary.cargoRow = await cb.addCargo(data.cbCargo);
      await captureEvidence(page, testInfo, 'cb-package-container-cargo');

      const toast = await cb.createJob();
      summary.createJobToast = toast;
      log(`Create Job toast: "${toast}"`);
      expect(toast, 'Create Job should report success').toMatch(/success|created/i);
      const id = toast.match(/CBJOB-[A-Z]+-\d+/);
      if (id) childJobNo = id[0];
      await captureEvidence(page, testInfo, 'cb-job-created');
    });

    await test.step('Phase 4A: Child Job List - View -> Back -> Edit (shipment check) -> Update', async () => {
      await cb.openChildJobList();
      await expect(cb.childRow(ref), `Child Job with BL/Invoice ${ref} should be listed`).toBeVisible();
      summary.childJobRowsForReference = await cb.childRowCount(ref);
      expect(summary.childJobRowsForReference, `Exactly one Child Job should exist for Reference Invoice No ${ref} (no duplicate)`).toBe(1);
      summary.childRow = await cb.childRowValues(ref);
      // Verified live: the Child Job View/Edit screens have two tabs. General Information holds Child Job No,
      // Child Job Date, Booking Job No/Date, Enquiry No, Quote No, Customer ID, Contract ID (the link back to
      // the Scenario 2 records); Cargo Information holds Shipment Type/Direction/Mode.
      const readGeneral = async () => {
        await page.getByRole('button', { name: 'General Information', exact: true }).click();
        // The values load a moment after the tab opens - wait for Child Job No before reading any of them.
        await expect(page.getByRole('textbox', { name: 'Child Job No', exact: true })).toHaveValue(/^CBJOB-/, { timeout: 20000 });
        const read = async (name: string) => (await page.getByRole('textbox', { name, exact: true }).inputValue()).trim();
        return {
          childJobNo: await read('Child Job No'),
          bookingJobNo: await read('Booking Job No'),
          enquiryNo: await read('Enquiry No'),
          quoteNo: await read('Quote No'),
          customerId: await read('Customer ID'),
        };
      };
      await cb.openChildView(ref);
      const view = await readGeneral();
      summary.childView = view;
      expect(view.childJobNo, 'Child Job No shown on View').toMatch(/^CBJOB-[A-Z]+-\d+$/);
      expect(view.bookingJobNo, 'Child Job is linked to the Scenario 2 Booking Job').toBe(bookingJobNo);
      expect(view.enquiryNo).toBe(s2.enquiryNo);
      expect(view.quoteNo).toBe(s2.quoteNo);
      childJobNo = view.childJobNo;
      await captureEvidence(page, testInfo, 'child-job-view');
      await cb.back();

      await cb.openChildEdit(ref);
      expect((await readGeneral()).childJobNo, 'Edit opens the same Child Job as View').toBe(childJobNo);
      await page.getByRole('button', { name: 'Cargo Information', exact: true }).click();
      const shipment: Record<string, string> = {};
      for (const [label, expected] of [['Shipment Type', 'FCL'], ['Shipment Direction', 'Export'], ['Shipment Mode', 'Sea']] as const) {
        const box = page.getByRole('textbox', { name: label, exact: true });
        shipment[label] = (await box.count()) ? (await box.first().inputValue()).trim() : '(field not present on this screen)';
        if (shipment[label] !== expected) {
          await recordDefect(testInfo, {
            module: 'CB', screen: 'Child Job - Edit (Cargo Information)', fieldOrAction: label, input: '-', expected, actual: shipment[label],
            evidence: await captureEvidence(page, testInfo, `child-edit-${label.replace(/\W+/g, '-')}-mismatch`), url: page.url(),
            severity: 'Medium', reproducibility: 'Observed in this run',
            classification: shipment[label].startsWith('(field not present') ? 'automation issue' : 'application defect',
          });
        }
      }
      summary.childEditShipment = shipment;
      await captureEvidence(page, testInfo, 'child-job-edit-cargo-information');
      await page.getByRole('button', { name: 'General Information', exact: true }).click();
      await captureEvidence(page, testInfo, 'child-job-edit');
      const toast = await cb.submitChildUpdate();
      summary.childUpdateToast = toast;
      log(`Child Job update toast: "${toast}"`);
      expect(toast).not.toMatch(/fail|error|invalid|required/i);
      await cb.openChildJobList();
      await expect(cb.childRow(ref)).toBeVisible();
    });

    await test.step('Phase 4B: Child Job List filters (each field on its own)', async () => {
      const row = await cb.childRowValues(ref);
      summary.childRow = row;
      const val = (k: string) => (row[k] && row[k] !== '-' && row[k] !== '--' ? row[k] : '');
      const results = await testFilters(page, testInfo, { name: 'Child Job List', module: 'CB', open: () => cb.openChildJobList(), targetRow: () => cb.childRow(ref) }, [
        { label: 'BL/Invoice', value: ref },
        { label: 'Document Reference No.', value: val('DOCUMENT REFERENCE NO.'), notTestable: val('DOCUMENT REFERENCE NO.') ? undefined : 'record shows no Document Reference No.' },
        { label: 'Exporter', value: s2.customerName },
        { label: 'Transit Date', value: val('TRANSIT DATE'), notTestable: val('TRANSIT DATE') ? undefined : 'record shows no Transit Date' },
        { label: 'ETA', value: val('ETA'), notTestable: val('ETA') ? undefined : 'record shows no ETA' },
        { label: 'Feeder Vessel', value: val('FEEDER VESSEL'), notTestable: val('FEEDER VESSEL') ? undefined : 'record shows no Feeder Vessel' },
        { label: 'Nominated CFS', value: val('NOMINATED CFS'), notTestable: val('NOMINATED CFS') ? undefined : 'record shows no Nominated CFS' },
        { label: 'Liner', value: val('LINER'), contains: true, notTestable: val('LINER') ? undefined : 'record shows no Liner' },
        { label: 'Child Job No', value: childJobNo, notTestable: childJobNo ? undefined : 'Child Job No could not be read from the Child Job View screen' },
        { label: 'Booking Job No', value: bookingJobNo },
      ]);
      filters.push(...results);
    });

    await test.step('Phase 5: Initiate SB -> Create', async () => {
      await cb.openChildJobList();
      const action = await cb.childStatusAction(ref);
      summary.childStatusBeforeSB = action;
      if (action !== 'Initiate SB') {
        summary.initiateSB = `skipped - row action is "${action}" (Shipping Bill already initiated)`;
        log(String(summary.initiateSB));
        return;
      }
      await cb.clickInitiateSB(ref);
      await captureEvidence(page, testInfo, 'initiate-sb-form');
      const prefilled = await sb.formSnapshot();
      summary.initiateSBPrefilled = prefilled;
      const outcomes = await sb.fillInitiateSB(data.initiateSB);
      summary.initiateSBOutcomes = outcomes;
      summary.initiateSBNotPresent = outcomes.filter((o) => o.mode === 'absent').map((o) => o.label);
      // Verified live: all ten fields exist on the Initiate SB form - one going missing is a change worth failing on.
      expect.soft(summary.initiateSBNotPresent, 'Initiate SB fields not found on the form').toEqual([]);
      expect.soft(outcomes.filter((o) => o.mode === 'disabled' || o.mode === 'no-options').map((o) => o.label), 'Initiate SB fields that could not be set').toEqual([]);
      await reportUnfilled(testInfo, page, 'Initiate SB', outcomes.filter((o) => o.mode !== 'absent'));
      await captureEvidence(page, testInfo, 'initiate-sb-filled');
      const toast = await sb.submitCreate();
      summary.initiateSBToast = toast;
      log(`Initiate SB toast: "${toast}"`);
      expect(toast, 'Initiate SB Create should report success').toMatch(/success|created/i);
      await captureEvidence(page, testInfo, 'initiate-sb-created');
      await cb.openChildJobList();
      summary.childStatusAfterSB = await cb.childStatusAction(ref);
      expect(summary.childStatusAfterSB).toBe('SB Initiated');
    });

    await test.step('Phase 6: Shipping Bill View -> Back -> Edit -> Update', async () => {
      await sb.navigate();
      await expect(sb.row(ref), `Shipping Bill with BL/Invoice ${ref} should be listed`).toBeVisible();
      const row = await sb.rowValues(ref);
      summary.sbRow = row;
      childJobNo = row['CHILD JOB NO.'] || childJobNo;
      expect(row['BOOKING JOB NO.'], 'Shipping Bill should be linked to the Scenario 2 Booking Job').toBe(bookingJobNo);
      expect(row['CONTAINER NO']).toContain(data.cbContainer.containerNo);
      await sb.openView(ref);
      const viewValues = await sb.formSnapshot();
      summary.sbView = viewValues;
      await expect.soft(page.locator('main').last()).toContainText(data.cbContainer.containerNo);
      await captureEvidence(page, testInfo, 'shipping-bill-view');
      await sb.back();
      await sb.openEdit(ref);
      const before = await sb.formSnapshot();
      await captureEvidence(page, testInfo, 'shipping-bill-edit');
      const toast = await sb.submitUpdate();
      summary.sbUpdateToast = toast;
      log(`Shipping Bill update toast: "${toast}"`);
      expect(toast).not.toMatch(/fail|error|invalid|required/i);
      await sb.navigate();
      await sb.openEdit(ref);
      const after = await sb.formSnapshot();
      const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
      summary.sbFieldsChangedByNoOpUpdate = changed;
      expect.soft(changed, 'An Update without changes must not alter saved Shipping Bill values').toEqual([]);
      await sb.navigate();
      summary.sbRowAfterUpdate = await sb.rowValues(ref);
    });

    await test.step('Phase 7: Shipping Bill filters (each field on its own)', async () => {
      const row = (summary.sbRowAfterUpdate || summary.sbRow) as Record<string, string>;
      const val = (k: string) => (row[k] && row[k] !== '-' && row[k] !== '--' ? row[k] : '');
      const results = await testFilters(page, testInfo, { name: 'Shipping Bill', module: 'CB', open: () => sb.navigate(), targetRow: () => sb.row(ref) }, [
        { label: 'BL / Invoice No.', value: ref },
        { label: 'Document Reference No.', value: val('DOCUMENT REFERENCE NO.'), notTestable: val('DOCUMENT REFERENCE NO.') ? undefined : 'record shows no Document Reference No.' },
        { label: 'Port of Loading', value: val('PORT OF LOADING') || data.sbGeneral.portOfLoading, contains: true },
        { label: 'Port of Discharge', value: val('PORT OF DISCHARGE') || data.sbGeneral.portOfDischarge, contains: true },
        { label: 'Invoice Date', value: val('INVOICE DATE'), notTestable: val('INVOICE DATE') ? undefined : 'record shows no Invoice Date' },
        { label: 'Container No.', value: data.cbContainer.containerNo },
        { label: 'LEO No.', value: val('LEO NO'), notTestable: val('LEO NO') ? undefined : 'record shows no LEO No' },
        { label: 'Child Job No.', value: childJobNo },
        { label: 'Booking Job No.', value: bookingJobNo },
      ]);
      filters.push(...results);
    });

    await test.step('Phase 8: Initiate Stuffing', async () => {
      await sb.navigate();
      const action = await sb.stuffingAction(ref);
      summary.stuffingActionBefore = action;
      if (action === 'Initiate Stuffing') {
        await sb.clickInitiateStuffing(ref);
        await expect(sb.listHeading).toBeHidden({ timeout: 30000 });
      } else {
        summary.initiateStuffing = `row already shows "${action}"`;
      }
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
      summary.stuffingUrl = page.url();
      // Verified live: "Stuffing-Create" (Booking Reference / Container Information / Upload File tabs). The
      // Booking Reference fields are pre-filled asynchronously, so wait for them before reading or judging.
      await expect(page.getByRole('heading', { name: 'Stuffing-Create', exact: true })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Child Job No', exact: true }), 'Stuffing opens for this Child Job').toHaveValue(childJobNo, { timeout: 20000 });
      await expect(page.getByRole('textbox', { name: 'Booking Job No', exact: true })).toHaveValue(bookingJobNo);
      summary.stuffingHeading = 'Stuffing-Create';
      summary.stuffingScreen = await sb.formSnapshot();
      summary.stuffingButtons = (await page.locator('main').last().getByRole('button').allInnerTexts()).map((b) => b.trim()).filter(Boolean);
      await captureEvidence(page, testInfo, 'initiate-stuffing-screen');
      // Container Information tab: the containers the stuffing would cover - must include the Enquiry's container.
      await page.getByRole('button', { name: 'Container Information', exact: true }).click();
      const containerText = await page.locator('main').last().innerText();
      summary.stuffingContainerTab = containerText.replace(/\s+/g, ' ').trim().slice(0, 400);
      expect.soft(containerText, 'Stuffing Container Information lists the Scenario 2 container').toContain(data.cbContainer.containerNo);
      await captureEvidence(page, testInfo, 'initiate-stuffing-containers');
      await page.getByRole('button', { name: 'Booking Reference', exact: true }).click();
      log(`Initiate Stuffing -> "${summary.stuffingHeading}" ${summary.stuffingUrl}`);
    });

    const state: Scenario3State = {
      ...s2,
      bookingJobNo,
      childJobNo,
      sbNo: data.sbGeneral.sbNo,
      documentReferenceNumber: data.updateJob.documentReferenceNumber,
      leoNo: data.initiateSB.find((f) => f.label === 'LEO No.')!.value,
    };
    fs.writeFileSync(SCENARIO3_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    await captureEvidence(page, testInfo, 'SCENARIO3-FAILURE').catch(() => undefined);
    throw error;
  } finally {
    summary.bookingJobNo = bookingJobNo;
    summary.childJobNo = childJobNo;
    summary.filters = filters;
    summary.filterTotals = ['Booking Master Job List', 'Child Job List', 'Shipping Bill'].map((s) => ({
      screen: s,
      tested: filters.filter((f) => f.screen === s && f.status !== 'NOT TESTABLE').length,
      passed: filters.filter((f) => f.screen === s && f.status === 'PASS').length,
      failed: filters.filter((f) => f.screen === s && f.status === 'FAIL').length,
      intermittent: filters.filter((f) => f.screen === s && f.status === 'INTERMITTENT').length,
      notTestable: filters.filter((f) => f.screen === s && f.status === 'NOT TESTABLE').length,
    }));
    summary.defects = allDefects();
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'scenario3-summary.json'), JSON.stringify(summary, null, 2));
    await testInfo.attach('scenario3-summary', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  }
  // Filter failures were recorded as defects and the run continued; they still fail the test here.
  expect(filters.filter((f) => f.status === 'FAIL').map((f) => `${f.screen} / ${f.field}`), 'Filter fields that did not work').toEqual([]);
});

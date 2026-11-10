import { test, expect, Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LoginPage } from '../pages/LoginPage';
import { CBJobPage } from '../pages/CBJobPage';
import { ShippingBillPage } from '../pages/ShippingBillPage';
import { StuffingPage } from '../pages/StuffingPage';
import { DraftInvoicePage } from '../pages/DraftInvoicePage';
import { VendorBillPage } from '../pages/VendorBillPage';
import { captureEvidence, log, EVIDENCE_DIR } from '../utils/screenshot';
import { recordDefect, allDefects } from '../utils/defects';
import { testFilters, FilterResult } from '../utils/listFilters';
import {
  loginData,
  SCENARIO3_STATE_FILE,
  SCENARIO4_STATE_FILE,
  Scenario3State,
  Scenario4State,
  scenario4Data,
} from '../utils/testData';

/**
 * DivyaImpex Scenario 4 - continues the Child Job from Scenario 3 (its handoff: reports/state/scenario3-latest.json):
 * Initiate Stuffing -> Reference No -> Master Job container rows (edit one, add rows, delete exactly one) -> document ->
 * Create Stuffing -> Edit/Update -> Stuffing filters -> EIR Received -> EGM Filed -> Initiate Draft Invoice ->
 * View/Edit (copies + invoice line)/Update -> Draft Invoice filters -> Job Completed -> Vendor Bill.
 *
 * Resume safety: every completed stage is written to reports/state/scenario4-latest.json (keyed by Child Job No). A rerun
 * skips stages this automation already completed and re-verifies them in the UI; a Child Job whose records exist but were NOT
 * created by this automation (processed by hand, or by an older run) is refused instead of silently "passing".
 */
test.describe.configure({ mode: 'serial' });

function readScenario3State(): Scenario3State {
  if (!fs.existsSync(SCENARIO3_STATE_FILE)) {
    throw new Error(`PREREQUISITE FAILED: no Scenario 3 handoff at ${SCENARIO3_STATE_FILE} - run Scenario 3 first.`);
  }
  const s = JSON.parse(fs.readFileSync(SCENARIO3_STATE_FILE, 'utf8')) as Scenario3State;
  const missing = (['childJobNo', 'bookingJobNo', 'referenceInvoiceNo', 'sbNo', 'customerName', 'vendorName'] as const).filter((k) => !s[k]);
  if (!s.cargo?.length || !s.cargo[0].containerNo || s.cargo.length < 7) missing.push('cargo (>= 7 containers)' as never);
  if (missing.length) throw new Error(`PREREQUISITE FAILED: Scenario 3 handoff is missing ${missing.join(', ')}.`);
  return s;
}

function loadState(s3: Scenario3State): Scenario4State {
  if (fs.existsSync(SCENARIO4_STATE_FILE)) {
    const existing = JSON.parse(fs.readFileSync(SCENARIO4_STATE_FILE, 'utf8')) as Scenario4State;
    if (existing.childJobNo === s3.childJobNo) return existing;
  }
  return { childJobNo: s3.childJobNo, bookingJobNo: s3.bookingJobNo, referenceInvoiceNo: s3.referenceInvoiceNo, startedAt: new Date().toISOString(), stages: {} };
}

function saveState(state: Scenario4State) {
  fs.mkdirSync(path.dirname(SCENARIO4_STATE_FILE), { recursive: true });
  fs.writeFileSync(SCENARIO4_STATE_FILE, JSON.stringify(state, null, 2));
}

function markStage(state: Scenario4State, name: string, detail?: Record<string, unknown>) {
  state.stages[name] = { at: new Date().toISOString(), detail };
  saveState(state);
}

const done = (state: Scenario4State, name: string) => Boolean(state.stages[name]);

async function blocker(testInfo: TestInfo, page: Page, summary: Record<string, unknown>, screen: string, action: string, actual: string, classification: 'application defect' | 'automation issue' | 'invalid test data' | 'environment issue' = 'invalid test data') {
  (summary.blockers as string[]).push(`${screen} / ${action}: ${actual}`);
  await recordDefect(testInfo, {
    module: 'CB', screen, fieldOrAction: action, input: '-', expected: 'the step can be performed',
    actual, evidence: await captureEvidence(page, testInfo, `blocked-${screen}-${action}`.replace(/\W+/g, '-')), url: page.url(),
    severity: 'High', reproducibility: 'Observed in this run', classification,
  });
}

test('DivyaImpex Scenario 4: Stuffing -> Draft Invoice -> Job Completed -> Vendor Bill', async ({ page }, testInfo) => {
  test.setTimeout(60 * 60 * 1000);
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const s3 = readScenario3State();
  const state = loadState(s3);
  const data = scenario4Data(s3);
  const ref = s3.referenceInvoiceNo;
  const childJobNo = s3.childJobNo;
  const cb = new CBJobPage(page);
  const sb = new ShippingBillPage(page);
  const stuffing = new StuffingPage(page);
  const invoice = new DraftInvoicePage(page);
  const vendorBill = new VendorBillPage(page);
  const summary: Record<string, unknown> = { childJobNo, bookingJobNo: s3.bookingJobNo, referenceInvoiceNo: ref, sbNo: s3.sbNo, originalContainer: s3.cargo[0].containerNo, resumedStages: Object.keys(state.stages), blockers: [] as string[] };
  const filters: FilterResult[] = [];
  let canContinue = true;

  try {
    await test.step('Phase 1: login and prerequisites (Scenario 3 Child Job, Shipping Bill, untouched stuffing)', async () => {
      const login = new LoginPage(page);
      await login.goto(loginData.url);
      await login.login(loginData.username, loginData.password, loginData.branch);
      await login.verifyLoginSuccess(loginData.branch);
      await cb.openChildJobList();
      await expect(cb.childRow(ref), `PREREQUISITE FAILED: Child Job for ${ref} not found`).toBeVisible();
      expect(await cb.childRowCount(ref), 'exactly one Child Job for the Reference Invoice No').toBe(1);
      await sb.navigate();
      await expect(sb.row(ref), `PREREQUISITE FAILED: Shipping Bill for ${ref} not found`).toBeVisible();
      const sbRow = await sb.rowValues(ref);
      expect(sbRow['CHILD JOB NO.']).toBe(childJobNo);
      expect(sbRow['BOOKING JOB NO.']).toBe(s3.bookingJobNo);
      summary.shippingBillRow = sbRow;
      if (!done(state, 'stuffingCreated')) {
        const action = await sb.stuffingAction(ref);
        expect(action, `PREREQUISITE FAILED: ${childJobNo} already has stuffing ("${action}") but this automation did not create it - the Child Job was processed outside it. Run Scenario 3 for a fresh job.`).toBe('Initiate Stuffing');
        await stuffing.navigateList();
        expect(await stuffing.rowCountFor(childJobNo), `PREREQUISITE FAILED: a Stuffing record for ${childJobNo} already exists (not created by this automation)`).toBe(0);
      }
      saveState(state);
    });

    // ---------------- Stuffing ----------------
    if (!done(state, 'stuffingCreated')) {
      await test.step('Phase 1b: Initiate Stuffing -> Stuffing-Create, Reference No', async () => {
        await sb.navigate();
        await sb.clickInitiateStuffing(ref);
        await expect(page.getByRole('heading', { name: 'Stuffing-Create', exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('textbox', { name: 'Child Job No', exact: true })).toHaveValue(childJobNo, { timeout: 20000 });
        await captureEvidence(page, testInfo, 'stuffing-create-screen');
        const outcome = await stuffing.fillReferenceNo(data.referenceNo);
        summary.referenceNo = { value: data.referenceNo, mode: outcome.mode };
        const booking = await stuffing.bookingReference();
        summary.bookingReference = booking;
        expect(booking.childJobNo).toBe(childJobNo);
        expect(booking.bookingJobNo).toBe(s3.bookingJobNo);
        expect(booking.referenceNo).toBe(data.referenceNo);
        await captureEvidence(page, testInfo, 'stuffing-reference-no');
      });

      await test.step('Phase 2: Container Info - Master Job: edit, add rows, delete exactly one', async () => {
        await stuffing.openMasterJobSection();
        const initial = await stuffing.readMasterRows();
        summary.initialContainerRows = initial;
        expect(initial.length, 'The Master Job section lists the Shipping Bill container').toBeGreaterThanOrEqual(1);
        const original = initial.find((r) => r['Container No.'] === s3.cargo[0].containerNo);
        expect(original, `Original container ${s3.cargo[0].containerNo} should be listed`).toBeTruthy();
        const originalIndex = initial.indexOf(original!);
        expect(original!['SB No.']).toBe(s3.sbNo);
        const sbNo = original!['SB No.'];
        const sbDateDisplay = original!['SB Date'];
        const sbDateIso = sbDateDisplay.split('-').reverse().join('-');

        // A. edit the existing row (container number and SB details stay consistent with the Child Job / Shipping Bill)
        const edited = await stuffing.editRow(originalIndex, data.originalRowEdit);
        summary.editedRow = edited.row;
        summary.editOutcomes = edited.outcomes;
        expect(edited.row['Container No.']).toBe(s3.cargo[0].containerNo);
        expect(edited.row['SB No.']).toBe(sbNo);
        await captureEvidence(page, testInfo, 'container-row-updated');

        // B. delete exactly one eligible row. Verified live: the section lists every Enquiry container (only the original
        // carries SB No./SB Date); delete one of the OTHER pre-existing rows - never the original container row.
        const eligible = initial.map((r, i) => ({ r, i })).filter(({ i }) => i !== originalIndex);
        expect(eligible.length, 'at least one row other than the original container exists to delete').toBeGreaterThanOrEqual(1);
        const toDelete = eligible[eligible.length - 1];
        const del = await stuffing.deleteRow(toDelete.i);
        summary.deleteConfirmation = del.confirmation;
        summary.deletedContainer = del.deleted['Container No.'];
        summary.rowsAfterDelete = del.remaining.length;
        await captureEvidence(page, testInfo, 'container-row-deleted');
        expect(del.remaining.length).toBe(initial.length - 1);
        expect(del.remaining.some((r) => r['Container No.'] === s3.cargo[0].containerNo), 'the original container row is untouched').toBe(true);

        // C. add at least five NEW rows (brand-new valid container numbers, same Shipping Bill)
        const added: string[] = [];
        const existing = new Set((await stuffing.readMasterRows()).map((r) => r['Container No.']));
        for (const [i, row] of data.newRows.entries()) {
          expect(existing.has(row.containerNo!), `new container ${row.containerNo} must not already be listed`).toBe(false);
          const r = await stuffing.addRow({ ...row, sbNo, sbDate: sbDateIso });
          added.push(r.row['Container No.']);
          existing.add(r.row['Container No.']);
          log(`container row ${i + 1}/${data.newRows.length} added: ${r.row['Container No.']}`);
          const bad = r.outcomes.filter((o) => ['absent', 'disabled', 'no-options'].includes(o.mode));
          expect(bad, `Add New dialog fields that could not be set: ${JSON.stringify(bad)}`).toEqual([]);
        }
        expect(new Set(added).size, 'added container numbers are unique').toBe(data.newRows.length);
        expect(added.length).toBeGreaterThanOrEqual(5);
        const finalRows = await stuffing.readMasterRows();
        expect(finalRows.length).toBe(initial.length - 1 + added.length);
        for (const c of added) expect(finalRows.filter((r) => r['Container No.'] === c).length, `new container ${c} is in the table once`).toBe(1);
        expect(finalRows.some((r) => r['Container No.'] === s3.cargo[0].containerNo)).toBe(true);
        await captureEvidence(page, testInfo, 'container-rows-added');
        summary.newContainersAdded = added;
        summary.finalContainerRows = finalRows.length;
        state.newContainers = added;
        state.stages.containerRowsPrepared = { at: new Date().toISOString(), detail: { rows: finalRows.length } };
      });

      await test.step('Phase 3: upload a document and Create the Stuffing', async () => {
        const upload = await stuffing.uploadDocument(data.document.documentType, data.document.filePath);
        summary.uploadedDocument = upload.row;
        await captureEvidence(page, testInfo, 'stuffing-document-uploaded');
        // pre-create checks
        expect((await stuffing.bookingReference()).referenceNo).toBe(data.referenceNo);
        expect((await stuffing.readMasterRows()).length, 'container rows still as prepared before Create').toBe(summary.finalContainerRows as number);
        expect((await stuffing.documentRows()).length).toBeGreaterThanOrEqual(1);
        const toast = await stuffing.submitCreate();
        summary.createStuffingToast = toast;
        log(`Create Stuffing toast: "${toast}"`);
        expect(toast, 'Create Stuffing should report success').not.toMatch(/fail|error|invalid|required/i);
        await stuffing.navigateList();
        expect(await stuffing.rowCountFor(childJobNo), 'exactly one Stuffing record for the Child Job').toBe(1);
        state.stuffingNo = await stuffing.stuffingNoFor(childJobNo);
        summary.stuffingNo = state.stuffingNo;
        summary.stuffingRow = await stuffing.rowValues(childJobNo);
        await captureEvidence(page, testInfo, 'stuffing-created');
        markStage(state, 'stuffingCreated', { stuffingNo: state.stuffingNo });
      });
    } else {
      summary.stuffingNo = state.stuffingNo;
      log(`stage stuffingCreated already done (${state.stuffingNo}) - skipping creation`);
    }

    if (!done(state, 'stuffingUpdated')) {
      await test.step('Phase 4: Edit -> Update the Stuffing', async () => {
        await stuffing.navigateList();
        await stuffing.openEdit(childJobNo);
        const booking = await stuffing.bookingReference();
        expect(booking.referenceNo, 'Reference No persisted').toBe(data.referenceNo);
        await stuffing.openMasterJobSection();
        const rows = await stuffing.readMasterRows();
        summary.savedContainerRows = rows.length;
        for (const c of state.newContainers ?? []) expect(rows.some((r) => r['Container No.'] === c), `saved container ${c}`).toBe(true);
        expect(rows.some((r) => r['Container No.'] === s3.cargo[0].containerNo)).toBe(true);
        expect((await stuffing.documentRows()).join(' ')).toContain(path.basename(data.document.filePath));
        await captureEvidence(page, testInfo, 'stuffing-edit-screen');
        const toast = await stuffing.submitUpdate();
        summary.updateStuffingToast = toast;
        log(`Update Stuffing toast: "${toast}"`);
        expect(toast).not.toMatch(/fail|error|invalid|required/i);
        await expect(stuffing.row(childJobNo)).toBeVisible();
        summary.stuffingRowAfterUpdate = await stuffing.rowValues(childJobNo);
        await captureEvidence(page, testInfo, 'stuffing-updated');
        markStage(state, 'stuffingUpdated');
      });
    }

    await test.step('Phase 5: Stuffing filters (each field on its own)', async () => {
      if (done(state, 'stuffingFilters')) {
        filters.push(...((state.stages.stuffingFilters.detail?.results as FilterResult[]) ?? []));
        log('stage stuffingFilters already done - reusing its recorded results');
        return;
      }
      await stuffing.navigateList();
      await expect(stuffing.row(childJobNo)).toBeVisible({ timeout: 30000 });
      const row = await stuffing.rowValues(childJobNo);
      const val = (k: string) => (row[k] && row[k] !== '-' && row[k] !== '--' ? row[k] : '');
      const results = await testFilters(page, testInfo, { name: 'Stuffing', module: 'CB', open: () => stuffing.navigateList(), targetRow: () => stuffing.row(childJobNo) }, [
        { label: 'BL / Invoice No.', value: ref },
        { label: 'Document Reference No.', value: val('DOCUMENT REFERENCE NO.'), notTestable: val('DOCUMENT REFERENCE NO.') ? undefined : 'record shows no Document Reference No.' },
        { label: 'Shipper', value: s3.customerName },
        { label: 'Consignee', value: val('CONSIGNEE'), notTestable: val('CONSIGNEE') ? undefined : 'record shows no Consignee' },
        { label: 'Stuffing No.', value: state.stuffingNo ?? '' },
        { label: 'Product Type', value: val('PRODUCT TYPE'), notTestable: val('PRODUCT TYPE') ? undefined : 'record shows no Product Type' },
        { label: 'TMS Enabled', value: val('TMS ENABLED'), notTestable: val('TMS ENABLED') ? undefined : 'record shows no TMS Enabled value' },
        { label: 'Child Job No', value: childJobNo },
        { label: 'Booking Job No', value: s3.bookingJobNo },
      ]);
      filters.push(...results);
      markStage(state, 'stuffingFilters', { results });
    });

    // ---------------- Child Job statuses ----------------
    for (const status of ['EIR Received', 'EGM Filed'] as const) {
      const key = `status:${status}`;
      if (!canContinue || done(state, key)) continue;
      await test.step(`Phase ${status === 'EIR Received' ? 6 : 7}: Child Job status -> ${status}`, async () => {
        await cb.openChildJobList();
        const result = await cb.updateStatus(ref, status);
        summary[`status ${status}`] = { succeeded: result.succeeded, message: result.message, toast: result.toast, before: result.before, after: result.after };
        log(`status ${status}: succeeded=${result.succeeded} message="${result.message}" toast="${result.toast}"`);
        await captureEvidence(page, testInfo, `status-${status.replace(/\W+/g, '-').toLowerCase()}`);
        if (!result.succeeded) {
          canContinue = false;
          await blocker(testInfo, page, summary, 'Child Job List - Update Status', status, result.selectable ? `Save refused: ${result.message || result.toast}` : result.message);
          return;
        }
        expect(result.after[status]?.checked, `${status} is saved`).toBe(true);
        markStage(state, key, { toast: result.toast });
      });
    }
    if (canContinue) {
      const snap = (summary['status EGM Filed'] as { after?: Record<string, { checked: boolean }> } | undefined)?.after;
      if (snap) {
        summary.eirPreservedAfterEgm = snap['EIR Received']?.checked ?? null;
        expect.soft(snap['EIR Received']?.checked, 'EIR Received is still checked after EGM Filed was saved').toBe(true);
      }
    }

    // ---------------- Draft Invoice ----------------
    if (canContinue && !done(state, 'draftInvoiceInitiated')) {
      await test.step('Phase 8A: Initiate Draft Invoice', async () => {
        await cb.openChildJobList();
        summary.childRowActionsBeforeDraftInvoice = await cb.rowActions(ref);
        // The click is its own stage: once it has happened (this run or an earlier partial run) it is never repeated.
        if (!done(state, 'draftInvoiceClicked')) {
          const toast = await cb.clickInitiateDraftInvoice(ref);
          summary.initiateDraftInvoiceToast = toast;
          log(`Initiate Draft Invoice toast: "${toast}"`);
          markStage(state, 'draftInvoiceClicked', { toast });
        } else {
          summary.initiateDraftInvoiceToast = `(already clicked earlier: ${String(state.stages.draftInvoiceClicked.detail?.toast ?? '')})`;
        }
        await invoice.navigateList();
        await expect(invoice.row(childJobNo), `Draft Invoice for ${childJobNo} should be listed`).toBeVisible({ timeout: 30000 });
        expect(await invoice.rowCountFor(childJobNo), 'exactly one Draft Invoice for the Child Job').toBe(1);
        state.draftInvoiceNo = await invoice.invoiceNoFor(childJobNo);
        summary.draftInvoiceNo = state.draftInvoiceNo;
        summary.draftInvoiceRow = await invoice.rowValues(childJobNo);
        await captureEvidence(page, testInfo, 'draft-invoice-initiated');
        markStage(state, 'draftInvoiceInitiated', { draftInvoiceNo: state.draftInvoiceNo });
      });
    }

    if (canContinue && !done(state, 'draftInvoiceUpdated')) {
      await test.step('Phase 8B: Draft Invoice View -> Back -> Edit (copies + invoice line) -> Update', async () => {
        await invoice.navigateList();
        await invoice.openView(childJobNo);
        const header = await invoice.readHeader(['Invoice Date', 'Shipper', 'SB / BE No', 'No of Invoice Copies', 'Shipper Invoice No', 'Consignee', 'Container No', 'No of Packages']);
        summary.draftInvoiceView = header;
        // Observation: which containers the invoice carries versus the SB-linked containers saved on the Stuffing.
        summary.draftInvoiceContainers = header['Container No'];
        summary.stuffingSbLinkedContainers = [s3.cargo[0].containerNo, ...(state.newContainers ?? [])];
        expect.soft(header['Container No'], 'Draft Invoice carries the original container').toContain(s3.cargo[0].containerNo);
        expect.soft(header['Shipper'], 'Draft Invoice shipper').toBe(s3.customerName);
        expect.soft(header['SB / BE No'], 'Draft Invoice SB No').toBe(s3.sbNo);
        expect.soft(header['Shipper Invoice No'], 'Draft Invoice shows the Reference Invoice No').toBe(ref);
        await captureEvidence(page, testInfo, 'draft-invoice-view');
        await invoice.back();

        await invoice.openEdit(childJobNo);
        await invoice.setCopies(data.draftInvoice.copies);
        const linesBefore = await invoice.readLines();
        // Idempotent: a resumed/retried run must not add a second copy of the same test line.
        const already = linesBefore.find((l) => l['Qty'] === data.draftInvoice.line.qty && l['Rate'] === data.draftInvoice.line.rate && l['Currency'] === data.draftInvoice.line.currency);
        const line = already
          ? { chosen: { description: already['Description'], uom: already['UOM'], qty: already['Qty'], rate: already['Rate'], currency: already['Currency'] }, auto: { hsn: already['HSN/SAC Code'], exchangeRate: already['Exchange Rate'], valueInInr: already['Value in INR'], taxable: already['Taxable'], nonTaxable: already['Non Taxable'] }, row: already }
          : await invoice.addLine(data.draftInvoice.line);
        summary.draftInvoiceLine = line;
        summary.draftInvoiceLineReused = Boolean(already);
        await captureEvidence(page, testInfo, 'draft-invoice-line-added');
        const expectedCount = already ? linesBefore.length : linesBefore.length + 1;
        expect((await invoice.readLines()).length).toBe(expectedCount);
        const toast = await invoice.submitUpdate();
        summary.updateDraftInvoiceToast = toast;
        log(`Update Draft Invoice toast: "${toast}"`);
        expect(toast).not.toMatch(/fail|error|invalid|required/i);
        await captureEvidence(page, testInfo, 'draft-invoice-updated');

        await invoice.navigateList();
        await invoice.openEdit(childJobNo);
        const copiesNow = await page.getByRole('textbox', { name: 'No of Invoice Copies', exact: true }).inputValue();
        summary.noOfInvoiceCopiesAfterReopen = copiesNow;
        if (copiesNow !== data.draftInvoice.copies) {
          // Observed live: the field reopens showing No of Packages (e.g. "950"), not the "3" that was saved - an app defect,
          // not a block on the rest of Scenario 4 (the invoice line itself is still verified below).
          await recordDefect(testInfo, {
            module: 'CB', screen: 'Draft Invoice - Edit', fieldOrAction: 'No of Invoice Copies (persistence)',
            input: data.draftInvoice.copies, expected: `"${data.draftInvoice.copies}" is shown when the invoice is reopened`,
            actual: `shows "${copiesNow}" instead (matches No of Packages)`,
            evidence: await captureEvidence(page, testInfo, 'draft-invoice-copies-not-persisted'), url: page.url(),
            severity: 'Medium', reproducibility: 'Observed in this run', classification: 'application defect',
          });
        }
        const saved = await invoice.readLines();
        summary.draftInvoiceSavedLines = saved.length;
        expect(saved.some((l) => l['Description'] === line.row['Description'] && l['Qty'] === line.row['Qty'] && l['Value in INR'] === line.row['Value in INR']), 'added invoice line persisted').toBe(true);
        await invoice.back();
        markStage(state, 'draftInvoiceUpdated');
      });
    }

    if (canContinue) {
      await test.step('Phase 9: Draft Invoice filters (each field on its own)', async () => {
        if (done(state, 'draftInvoiceFilters')) {
          filters.push(...((state.stages.draftInvoiceFilters.detail?.results as FilterResult[]) ?? []));
          log('stage draftInvoiceFilters already done - reusing its recorded results');
          return;
        }
        await invoice.navigateList();
        await expect(invoice.row(childJobNo)).toBeVisible({ timeout: 30000 });
        const row = await invoice.rowValues(childJobNo);
        const val = (k: string) => (row[k] && row[k] !== '-' && row[k] !== '--' ? row[k] : '');
        const results = await testFilters(page, testInfo, { name: 'Draft Invoice', module: 'CB', open: () => invoice.navigateList(), targetRow: () => invoice.row(childJobNo) }, [
          { label: 'Invoice/BL Number', value: ref },
          { label: 'Invoice No', value: state.draftInvoiceNo ?? '' },
          { label: 'Invoice Date', value: val('INVOICE DATE'), notTestable: val('INVOICE DATE') ? undefined : 'record shows no Invoice Date' },
          { label: 'Document Reference No.', value: val('DOCUMENT REFERENCE NO.'), notTestable: val('DOCUMENT REFERENCE NO.') ? undefined : 'record shows no Document Reference No.' },
          { label: 'Shipper', value: s3.customerName },
          { label: 'Consignee', value: val('CONSIGNEE'), notTestable: val('CONSIGNEE') ? undefined : 'record shows no Consignee' },
          { label: 'Child Job No', value: childJobNo },
          { label: 'Booking Job No', value: s3.bookingJobNo },
        ]);
        filters.push(...results);
        markStage(state, 'draftInvoiceFilters', { results });
      });
    }

    // ---------------- Job Completed ----------------
    // Verified live: the app enforces a strict sequential status progression. "Job Completed" is not
    // selectable immediately after EGM Filed - "Invoice Generated" and "Payment Received" (real, existing
    // statuses in the same Update Status checklist) must be reached first. These were not named in the
    // original task, which only asked for EIR Received -> EGM Filed -> Job Completed; they are advanced
    // through here (same mechanism: tick the one enabled checkbox, Save) only because the app itself
    // requires them to reach the task's actual goal, never with invented data - and are reported as a
    // note, not a defect.
    for (const status of ['Invoice Generated', 'Payment Received'] as const) {
      const key = `status:${status}`;
      if (!canContinue || done(state, key)) continue;
      await test.step(`Phase 10 (prerequisite): Child Job status -> ${status} (required by the app before Job Completed)`, async () => {
        await cb.openChildJobList();
        const result = await cb.updateStatus(ref, status);
        summary[`status ${status}`] = { succeeded: result.succeeded, selectable: result.selectable, message: result.message, toast: result.toast };
        log(`status ${status} (app prerequisite for Job Completed): succeeded=${result.succeeded} message="${result.message}" toast="${result.toast}"`);
        await captureEvidence(page, testInfo, `status-${status.replace(/\W+/g, '-').toLowerCase()}`);
        if (!result.succeeded && result.before[status]?.checked) {
          // Already reached (the app itself ticked it, e.g. Draft Invoice generation auto-advances "Invoice
          // Generated") - disabled because it's done, not because it's refused. Not a blocker.
          log(`${status} is already checked (reached by an earlier app action) - continuing`);
          markStage(state, key, { toast: '(already satisfied before this automation acted)' });
          return;
        }
        if (!result.succeeded) {
          canContinue = false;
          await blocker(testInfo, page, summary, 'Child Job List - Update Status', status, result.selectable ? `Save refused: ${result.message || result.toast}` : result.message);
          return;
        }
        expect(result.after[status]?.checked, `${status} is saved`).toBe(true);
        markStage(state, key, { toast: result.toast });
      });
    }

    if (canContinue && !done(state, 'status:Job Completed')) {
      await test.step('Phase 10: Child Job status -> Job Completed', async () => {
        await cb.openChildJobList();
        const result = await cb.updateStatus(ref, 'Job Completed');
        summary['status Job Completed'] = { succeeded: result.succeeded, selectable: result.selectable, message: result.message, toast: result.toast, before: result.before, after: result.after };
        log(`status Job Completed: succeeded=${result.succeeded} selectable=${result.selectable} message="${result.message}" toast="${result.toast}"`);
        await captureEvidence(page, testInfo, 'status-job-completed');
        if (!result.succeeded) {
          await blocker(testInfo, page, summary, 'Child Job List - Update Status', 'Job Completed', result.selectable ? `Save refused: ${result.message || result.toast}` : result.message);
          return;
        }
        expect(result.after['Job Completed']?.checked, 'Job Completed is saved').toBe(true);
        markStage(state, 'status:Job Completed', { toast: result.toast });
      });
    }

    // ---------------- Vendor Bill ----------------
    if (canContinue && !done(state, 'vendorBillCreated')) {
      await test.step('Phase 11: Vendor Bill for the latest Child Job', async () => {
        await vendorBill.navigateList();
        const before = await vendorBill.rowsForChildJob(childJobNo).count();
        expect(before, `PREREQUISITE FAILED: a Vendor Bill for ${childJobNo} already exists (not created by this automation)`).toBe(0);
        await vendorBill.openCreate();
        const vendorOptions = await vendorBill.options('Vendor Name');
        summary.vendorOptions = vendorOptions;
        expect(vendorOptions, `The Scenario 1 vendor "${s3.vendorName}" should be offered`).toContain(s3.vendorName);
        const vendorOutcome = await vendorBill.select('Vendor Name', s3.vendorName);
        expect(vendorOutcome.mode, `Vendor Name (${vendorOutcome.note ?? vendorOutcome.mode})`).toBe('dropdown');
        const childOptions = await vendorBill.options('Child Job No.');
        summary.childJobOptions = childOptions;
        expect(childOptions.some((o) => o.includes(childJobNo)), `Child Job ${childJobNo} should be offered; options: ${childOptions.slice(0, 10).join(' | ')}`).toBe(true);
        const childOutcome = await vendorBill.select('Child Job No.', childJobNo, true);
        expect(childOutcome.mode, `Child Job No. (${childOutcome.note ?? childOutcome.mode})`).toBe('dropdown');
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
        const identityBefore = await vendorBill.readIdentity();
        summary.vendorBillIdentityAuto = identityBefore;
        expect(identityBefore['Vendor ID'], 'Vendor ID should be auto-populated for the selected vendor').not.toBe('');
        await captureEvidence(page, testInfo, 'vendor-bill-vendor-and-job-selected');
        state.vendorName = s3.vendorName;
        state.stages.vendorBillFormOpened = { at: new Date().toISOString() };
        saveState(state);

        // Job Details auto-populates with the real charge lines from the Scenario 2 quote once the Child Job
        // is selected - verified live, never added manually here.
        const lines = await vendorBill.readLines();
        summary.vendorBillAutoLines = lines.length;
        expect(lines.length, 'Job Details should auto-populate from the quote charges').toBeGreaterThan(0);
        for (const l of lines) expect(l['Job No.']).toBe(childJobNo);

        // Vendor GST / Company GST: real dropdown options (each offers exactly one real choice here).
        const vendorGstOptions = await vendorBill.options('Vendor GST');
        const companyGstOptions = await vendorBill.options('Company GST');
        summary.vendorGstOptions = vendorGstOptions;
        summary.companyGstOptions = companyGstOptions;
        const realVendorGst = vendorGstOptions.find((o) => !/^(—|select)/i.test(o));
        const realCompanyGst = companyGstOptions.find((o) => !/^(—|select)/i.test(o));
        // GST selection is optional on this form (not required to Create) - attempted with 'contains' matching
        // (the real option text starts with "- ") and recorded as a note rather than failing the whole phase
        // if the app's own dropdown does not register the click.
        for (const [label, value] of [
          ['Vendor GST', realVendorGst],
          ['Company GST', realCompanyGst],
        ] as const) {
          if (!value) continue;
          try {
            const o = await vendorBill.select(label, value, true);
            summary[`${label}Outcome`] = o;
            if (o.mode !== 'dropdown') log(`${label}: could not select "${value}" (${o.note ?? o.mode}) - continuing without it`);
          } catch (e) {
            summary[`${label}Outcome`] = { error: (e as Error).message.split('\n')[0] };
            log(`${label}: selecting "${value}" failed (${(e as Error).message.split('\n')[0]}) - continuing without it`);
          }
        }
        const outcomes = await vendorBill.fillBill(data.vendorBill.billNo, data.vendorBill.billDate);
        expect(outcomes.filter((o) => ['absent', 'disabled'].includes(o.mode)), 'Vendor Bill No / Date fields should be editable').toEqual([]);

        const identityAfter = await vendorBill.readIdentity();
        summary.vendorBillIdentityFinal = identityAfter;
        expect(identityAfter['Vendor Name']).toBe(s3.vendorName);
        expect(identityAfter['Child Job No.']).toContain(childJobNo);
        expect(identityAfter['Vendor ID']).toBe(identityBefore['Vendor ID']);
        expect(identityAfter['Vendor Bill No']).toBe(data.vendorBill.billNo);
        summary.vendorBillTotals = await vendorBill.readTotals();
        await captureEvidence(page, testInfo, 'vendor-bill-form-completed');

        const toast = await vendorBill.submitCreate();
        summary.createVendorBillToast = toast;
        log(`Create Vendor Bill toast: "${toast}"`);
        if (!toast || /fail|error|invalid|required/i.test(toast)) {
          await blocker(testInfo, page, summary, 'Create Vendor Bill', 'Create', toast || '(no toast shown)');
          return;
        }
        await vendorBill.navigateList();
        const after = await vendorBill.rowsForChildJob(childJobNo).count();
        expect(after, 'exactly one Vendor Bill is now listed for this Child Job').toBe(1);
        const row = await vendorBill.rowValues(childJobNo);
        summary.vendorBillRow = row;
        state.vendorBillNo = row['VENDOR BILL NO'] || data.vendorBill.billNo;
        expect(row['VENDOR NAME']).toBe(s3.vendorName);
        await captureEvidence(page, testInfo, 'vendor-bill-created');
        markStage(state, 'vendorBillCreated', { vendorBillNo: state.vendorBillNo, toast });
      });
    }
  } catch (error) {
    await captureEvidence(page, testInfo, 'SCENARIO4-FAILURE').catch(() => undefined);
    throw error;
  } finally {
    summary.state = state;
    summary.filters = filters;
    summary.filterTotals = ['Stuffing', 'Draft Invoice'].map((s) => ({
      screen: s,
      tested: filters.filter((f) => f.screen === s && f.status !== 'NOT TESTABLE').length,
      passed: filters.filter((f) => f.screen === s && f.status === 'PASS').length,
      failed: filters.filter((f) => f.screen === s && f.status === 'FAIL').length,
      intermittent: filters.filter((f) => f.screen === s && f.status === 'INTERMITTENT').length,
      notTestable: filters.filter((f) => f.screen === s && f.status === 'NOT TESTABLE').length,
    }));
    summary.defects = allDefects();
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'scenario4-summary.json'), JSON.stringify(summary, null, 2));
    await testInfo.attach('scenario4-summary', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  }
  expect(filters.filter((f) => f.status === 'FAIL').map((f) => `${f.screen} / ${f.field}`), 'Filter fields that did not work').toEqual([]);
  expect(summary.blockers, 'Blocked steps').toEqual([]);
});

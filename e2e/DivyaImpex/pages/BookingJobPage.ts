import { Page, Locator, expect } from '@playwright/test';
import { actionToast } from '../utils/commonActions';
import { setField, readField, FieldOutcome } from '../utils/formFields';

export interface VesselData {
  pol: string;
  pod: string;
  voyageMode: string;
  destination: string;
  feederVessel: string;
  feederVoyageNo: string;
  /** Three distinct "Transhipment Port ETD" controls, in screen order (yyyy-mm-dd). */
  transhipmentEtd: [string, string, string];
  /** Two distinct "Mother Vessel" / "Voyage No" controls, in screen order. */
  motherVessel: [string, string];
  voyageNo: [string, string];
  podEta: string;
  liner: string;
  agent: string;
}

export interface UpdateJobData {
  consigneeName: string;
  marks: string;
  linerBookingNo: string;
  documentReferenceNumber: string;
  blNo: string;
  portOfDischarge: string;
  polDate: string;
  totalNoOfContainers: string;
  cfsName: string;
  cargoType: string;
  requiredDocument: string;
  trackingDocumentType: string;
  uploadDocumentType: string;
  filePath: string;
}

/**
 * CRM -> Sales Management -> Booking Job Generation ("Booking Master Job List"). Verified live (2026-10-22):
 * - List rows are CSS-grid divs; the BL/INVOICE column holds the Reference Invoice No typed in
 *   Scenario 2's Confirm Master Job, so that value identifies this execution's job.
 * - Row actions: View More (-> "Booking Master View"), Edit (-> "Update Booking Master"), "Update Job"
 *   (-> "Update Job"), Report.
 * - "Update Booking Master" -> Cargo Information tab holds the Vessel Information block (POL, POD,
 *   Voyage Mode, Destination, Feeder Vessel, Feeder Voyage No, 3x Transhipment Port ETD, 2x Mother
 *   Vessel, 2x Voyage No, POD ETA, Liner, Agent). POL/POD/Destination there are free-text inputs.
 * - "Update Job" holds Consignee/Marks/Liner Booking No/SB No (disabled)/Document Reference Number/
 *   BL No./Port of Discharge, Cargo Details (POL Date, Total No Of Containers, CFS Name), the same
 *   Vessel Information block (with populated master lists), Document Tracking and File Uploads.
 */
export class BookingJobPage {
  readonly page: Page;
  readonly listHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Booking Master Job List', exact: true });
  }

  async navigate() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Booking Job Generation', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    await link.click();
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  rowByReference(referenceInvoiceNo: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(referenceInvoiceNo, { exact: true }) })
      .first();
  }

  /** The list's column headers in order (first grid row) - used to read this record's displayed values by column name. */
  async rowValues(referenceInvoiceNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) =>
      h.replace(/\s+/g, ' ').trim().toUpperCase()
    );
    const cells = (await this.rowByReference(referenceInvoiceNo).locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  // ---------------- View ----------------

  async openView(referenceInvoiceNo: string): Promise<Record<string, string>> {
    await this.rowByReference(referenceInvoiceNo).getByRole('button', { name: 'View More' }).click();
    await expect(this.page.getByRole('heading', { name: 'Booking Master View', exact: true })).toBeVisible();
    const read = async (name: string) => (await this.page.getByRole('textbox', { name, exact: true }).inputValue()).trim();
    return {
      bookingJobNo: await read('Booking Job No'),
      bookingJobDate: await read('Booking Job Date'),
      enquiryNo: await read('Enquiry No'),
      quoteNo: await read('Quote No'),
      customerId: await read('Customer Id'),
      contractId: await read('Contract Id'),
    };
  }

  async back() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(this.listHeading).toBeVisible();
  }

  // ---------------- Edit -> Cargo Information (vessel block) ----------------

  async openEdit(referenceInvoiceNo: string) {
    await this.rowByReference(referenceInvoiceNo).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: 'Update Booking Master', exact: true })).toBeVisible();
    await this.page.getByRole('button', { name: 'Cargo Information', exact: true }).click();
    await expect(this.page.getByText('Voyage Mode', { exact: true })).toBeVisible();
  }

  /** Fills every distinct vessel control; repeated labels use their own nth control. Returns per-field outcomes. */
  async fillVessel(scope: Page | Locator, v: VesselData): Promise<FieldOutcome[]> {
    const p = this.page;
    const out: FieldOutcome[] = [];
    out.push(await setField(p, scope, 'POL', v.pol));
    out.push(await setField(p, scope, 'POD', v.pod));
    out.push(await setField(p, scope, 'Voyage Mode', v.voyageMode));
    out.push(await setField(p, scope, 'Destination', v.destination));
    out.push(await setField(p, scope, 'Feeder Vessel', v.feederVessel));
    out.push(await setField(p, scope, 'Feeder Voyage No', v.feederVoyageNo));
    for (let i = 0; i < 3; i++) out.push(await setField(p, scope, 'Transhipment Port ETD', v.transhipmentEtd[i], { nth: i }));
    for (let i = 0; i < 2; i++) {
      out.push(await setField(p, scope, 'Mother Vessel', v.motherVessel[i], { nth: i }));
      out.push(await setField(p, scope, 'Voyage No', v.voyageNo[i], { nth: i }));
    }
    out.push(await setField(p, scope, 'POD ETA', v.podEta));
    out.push(await setField(p, scope, 'Liner', v.liner));
    out.push(await setField(p, scope, 'Agent', v.agent));
    return out;
  }

  async readVessel(scope: Page | Locator): Promise<Record<string, string>> {
    const r: Record<string, string> = {};
    for (const [label, n] of [['POL', 1], ['POD', 1], ['Voyage Mode', 1], ['Destination', 1], ['Feeder Vessel', 1], ['Feeder Voyage No', 1], ['Transhipment Port ETD', 3], ['Mother Vessel', 2], ['Voyage No', 2], ['POD ETA', 1], ['Liner', 1], ['Agent', 1]] as const) {
      for (let i = 0; i < n; i++) r[n > 1 ? `${label}[${i + 1}]` : label] = await readField(scope, label, i);
    }
    return r;
  }

  /** Booking Master "Update" (Edit screen footer). */
  async submitEdit(): Promise<string> {
    const toast = await actionToast(this.page, () => this.page.getByRole('button', { name: 'Update', exact: true }).last().click(), 30000);
    await expect(this.listHeading).toBeVisible({ timeout: 30000 });
    return toast;
  }

  // ---------------- Update Job ----------------

  async openUpdateJob(referenceInvoiceNo: string) {
    await this.rowByReference(referenceInvoiceNo).getByRole('button', { name: 'Update Job', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: 'Update Job', exact: true })).toBeVisible();
    await expect(this.page.getByRole('textbox', { name: 'Reference Invoice No', exact: true })).toHaveValue(referenceInvoiceNo);
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  }

  /**
   * Document Tracking and File Uploads both have a "Document Type", a file input and an "Upload" button.
   * Verified live: their file inputs are #document_upload (Document Tracking) and #kycFile (File Uploads);
   * the Document Tracking table has "Received Date"/"Original Received" columns, the File Uploads table does not.
   */
  trackingTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'Received Date' }) });
  }

  uploadsTable(): Locator {
    return this.page
      .getByRole('table')
      .filter({ has: this.page.getByRole('columnheader', { name: 'File Name' }) })
      .filter({ hasNot: this.page.getByRole('columnheader', { name: 'Received Date' }) });
  }

  /** Upload button that sits next to a given file input (nearest common container). */
  private uploadButtonFor(fileInputId: string): Locator {
    return this.page.locator(`#${fileInputId}`).locator('xpath=ancestor::div[.//button[normalize-space()="Upload"]][1]').getByRole('button', { name: 'Upload', exact: true });
  }

  async fillUpdateJobHeader(d: UpdateJobData): Promise<FieldOutcome[]> {
    const p = this.page;
    return [
      await setField(p, p, 'Consignee Name', d.consigneeName),
      await setField(p, p, 'Marks', d.marks),
      await setField(p, p, 'Liner Booking No', d.linerBookingNo),
      await setField(p, p, 'SB No', ''), // verified live: disabled here (filled later by the CB/SB flow) - recorded, never forced
      await setField(p, p, 'Document Reference Number', d.documentReferenceNumber),
      await setField(p, p, 'BL No.', d.blNo),
      await setField(p, p, 'Port of Discharge', d.portOfDischarge),
      await setField(p, p, 'POL Date', d.polDate),
      await setField(p, p, 'Total No Of Containers', d.totalNoOfContainers),
      await setField(p, p, 'CFS Name', d.cfsName),
    ];
  }

  /** Document Tracking: Cargo Type, Required Documents (multi-select), then Document Type + file + Upload. */
  async completeDocumentTracking(d: UpdateJobData): Promise<{ outcomes: FieldOutcome[]; row: string; reused: boolean }> {
    const p = this.page;
    const fileName = d.filePath.split(/[\\/]/).pop()!;
    // Verified live: once a document type is tracked the app stops offering it, so a re-run on the same
    // Booking Job keeps the existing row instead of trying (and failing) to add a duplicate.
    const existing = this.trackingTable().locator('tbody tr').filter({ hasText: d.trackingDocumentType }).filter({ hasText: fileName }).first();
    if (await existing.isVisible().catch(() => false)) {
      return { outcomes: [], row: (await existing.innerText()).replace(/\s+/g, ' ').trim(), reused: true };
    }
    const outcomes: FieldOutcome[] = [await setField(p, p, 'Cargo Type', d.cargoType)];
    const reqTrigger = p.getByText('Required Documents', { exact: true }).locator('xpath=ancestor::div[.//button][1]').getByRole('button').first();
    await reqTrigger.click();
    const box = this.page.getByRole('checkbox', { name: d.requiredDocument, exact: true });
    await box.check();
    await expect(box).toBeChecked();
    await reqTrigger.click();
    outcomes.push({ label: 'Required Documents', nth: 0, mode: 'dropdown', value: d.requiredDocument });
    const docType = await setField(p, p, 'Document Type', d.trackingDocumentType, { nth: 0 });
    outcomes.push(docType);
    expect(docType.mode, `Document Tracking Document Type must be selectable (${docType.note ?? docType.mode})`).toBe('dropdown');
    await p.locator('#document_upload').setInputFiles(d.filePath);
    await this.uploadButtonFor('document_upload').click();
    const row = this.trackingTable().locator('tbody tr').filter({ hasText: fileName }).first();
    await expect(row, 'Document Tracking upload should list the file').toBeVisible({ timeout: 30000 });
    return { outcomes, row: (await row.innerText()).replace(/\s+/g, ' ').trim(), reused: false };
  }

  async completeFileUpload(d: UpdateJobData): Promise<{ outcome?: FieldOutcome; row: string; reused: boolean }> {
    const p = this.page;
    const fileName = d.filePath.split(/[\\/]/).pop()!;
    const existing = this.uploadsTable().locator('tbody tr').filter({ hasText: d.uploadDocumentType }).filter({ hasText: fileName }).first();
    if (await existing.isVisible().catch(() => false)) {
      return { row: (await existing.innerText()).replace(/\s+/g, ' ').trim(), reused: true };
    }
    const outcome = await setField(p, p, 'Document Type', d.uploadDocumentType, { nth: 1 });
    expect(outcome.mode, `File Uploads Document Type must be selectable (${outcome.note ?? outcome.mode})`).toBe('dropdown');
    await p.locator('#kycFile').setInputFiles(d.filePath);
    await this.uploadButtonFor('kycFile').click();
    const row = this.uploadsTable().locator('tbody tr').filter({ hasText: fileName }).first();
    await expect(row, 'File Uploads should list the file').toBeVisible({ timeout: 30000 });
    return { outcome, row: (await row.innerText()).replace(/\s+/g, ' ').trim(), reused: false };
  }

  async submitUpdateJob(): Promise<string> {
    const toast = await actionToast(this.page, () => this.page.getByRole('button', { name: 'Update Job', exact: true }).last().click(), 30000);
    return toast;
  }
}

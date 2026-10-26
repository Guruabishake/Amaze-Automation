import { Page, Locator, expect } from '@playwright/test';
import { assertStillLoggedIn } from '../utils/commonActions';
import { actionToast, readToast } from '../utils/commonActions';
import { setField, FieldOutcome } from '../utils/formFields';

export interface SBGeneralInfo {
  childJobDate: string;
  exporter: string;
  exporterAddress: string;
  sbNo: string;
  sbDate: string;
  consigneeName: string;
  consigneeAddress: [string, string, string];
  portOfLoading: string;
  portOfDischarge: string;
  portOfFinalDestination: string;
  portCode: string;
}

export interface CBPackage { noOfPackages: string; grossWeight: string; netWeight: string; uom: string }
export interface CBContainer { containerNo: string; size: string; type: string; customsSealNo: string; shipperSealNo: string; linerSealNo: string }
export interface CBCargo { cargoName: string; hsCode: string; commodity: string }

/**
 * CB module (left-rail "CB"). Verified live on DivyaImpex (2026-10-22):
 * - Create CB Job -> "Shipping Bill (SB)" -> "Create Manual Job - SB" (/cb/createManualJobSB) with tabs
 *   General Information / Invoice Information / Cargo Information. General Information fields:
 *   Child Job Date, Exporter (dropdown, "<name> [CUST-xxxxx]"), Importer/Expoter Address [sic], SB No,
 *   SB Date, Consignee Name, Consignee Address 1-3, Port of Loading / Port of Discharge (dropdowns),
 *   Port of Final Destination, Port Code, MAWB No, HAWB No.
 * - Invoice Information: Invoice No., Invoice Date. Cargo Information: "+ Add Package", "+ Add Container"
 *   (Container No, Size, Type, Customs/Shipper seal no., Liner seal no. dropdown), "+ Add Cargo"
 *   (Cargo Name, HS Code, Commodity), each popup closed with "Add".
 * - CB - Export Sea -> "Child Job List" (/cb/exportseachildjob): rows show Exporter, Consignee,
 *   BL/INVOICE, Document Reference No., Origin, Transit Date, ETA, Feeder Vessel, Nominated CFS, Liner;
 *   actions are two icon buttons (View, Edit), "Update Status" and a status action ("Initiate SB" /
 *   "SB Initiated" ...). The BL/INVOICE value (the Reference Invoice No) identifies this execution's row.
 */
export class CBJobPage {
  readonly page: Page;
  readonly sbFormHeading: Locator;
  readonly childListHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sbFormHeading = page.getByRole('heading', { name: 'Create Manual Job - SB', exact: true });
    this.childListHeading = page.getByRole('heading', { name: 'Child Job List', exact: true });
  }

  private async openExportSeaMenu(item: 'Child Job List' | 'Shipping Bill' | 'Stuffing') {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    const link = this.page.getByRole('button', { name: item, exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    await link.click();
  }

  // ---------------- Create CB Job (SB) ----------------

  async openCreateSB() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.getByRole('button', { name: 'Create CB Job', exact: true }).click();
    await this.page.getByRole('button', { name: 'Shipping Bill (SB)', exact: true }).click();
    await expect(this.sbFormHeading).toBeVisible();
  }

  async tab(name: 'General Information' | 'Invoice Information' | 'Cargo Information') {
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  async fillGeneral(d: SBGeneralInfo): Promise<FieldOutcome[]> {
    const p = this.page;
    await this.tab('General Information');
    const out = [
      await setField(p, p, 'Child Job Date', d.childJobDate),
      await setField(p, p, 'Exporter', d.exporter, { contains: true }),
      await setField(p, p, 'Importer/Expoter Address', d.exporterAddress),
      await setField(p, p, 'SB No', d.sbNo),
      await setField(p, p, 'SB Date', d.sbDate),
      await setField(p, p, 'Consignee Name', d.consigneeName),
      await setField(p, p, 'Consignee Address 1', d.consigneeAddress[0]),
      await setField(p, p, 'Consignee Address 2', d.consigneeAddress[1]),
      await setField(p, p, 'Consignee Address 3', d.consigneeAddress[2]),
      await setField(p, p, 'Port of Loading', d.portOfLoading),
      await setField(p, p, 'Port of Discharge', d.portOfDischarge),
      await setField(p, p, 'Port of Final Destination', d.portOfFinalDestination),
      await setField(p, p, 'Port Code', d.portCode),
    ];
    // MAWB / HAWB deliberately left blank (Sea shipment; a MAWB makes the app treat the SB as Air).
    await expect(p.getByRole('textbox', { name: 'MAWB No', exact: true })).toHaveValue('');
    await expect(p.getByRole('textbox', { name: 'HAWB No', exact: true })).toHaveValue('');
    return out;
  }

  async fillInvoice(invoiceNo: string, invoiceDate: string): Promise<string> {
    await this.tab('Invoice Information');
    const input = this.page.getByRole('textbox', { name: 'Invoice No.', exact: true });
    await input.fill(invoiceNo);
    await expect(input).toHaveValue(invoiceNo);
    await setField(this.page, this.page, 'Invoice Date', invoiceDate);
    return input.inputValue();
  }

  private popup(title: string): Locator {
    return this.page.locator('div').filter({ has: this.page.getByRole('heading', { name: title, exact: true }) }).filter({ has: this.page.getByRole('button', { name: 'Add', exact: true }) }).last();
  }

  private table(header: string): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: header, exact: true }) });
  }

  private async submitPopup(title: string) {
    await this.popup(title).getByRole('button', { name: 'Add', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: title, exact: true }), `${title} popup should close after Add (still open = values rejected)`).toBeHidden({ timeout: 15000 });
  }

  async addPackage(d: CBPackage): Promise<string> {
    await this.tab('Cargo Information');
    await this.page.getByRole('button', { name: /Add Package/ }).click();
    const pop = this.popup('Add Package');
    await expect(pop).toBeVisible();
    await setField(this.page, pop, 'No of Packages', d.noOfPackages);
    await setField(this.page, pop, 'Gross Weight', d.grossWeight);
    await setField(this.page, pop, 'Net Weight', d.netWeight);
    await setField(this.page, pop, 'UOM', d.uom);
    await this.submitPopup('Add Package');
    const row = this.table('No of Packages').locator('tbody tr').first();
    for (const v of [d.noOfPackages, d.grossWeight, d.netWeight, d.uom]) await expect(row).toContainText(v);
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }

  async addContainer(d: CBContainer): Promise<{ row: string; outcomes: FieldOutcome[] }> {
    await this.tab('Cargo Information');
    await this.page.getByRole('button', { name: /Add Container/ }).click();
    const pop = this.popup('Add Container');
    await expect(pop).toBeVisible();
    const containerInput = pop.getByRole('textbox', { name: 'Container No', exact: true });
    await containerInput.fill(d.containerNo);
    await expect(containerInput).toHaveValue(d.containerNo);
    const outcomes = [
      await setField(this.page, pop, 'Size', d.size),
      await setField(this.page, pop, 'Type', d.type),
      await setField(this.page, pop, 'Customs seal no.', d.customsSealNo),
      await setField(this.page, pop, 'Shipper seal no.', d.shipperSealNo),
      await setField(this.page, pop, 'Liner seal no.', d.linerSealNo),
    ];
    await this.submitPopup('Add Container');
    const row = this.table('Container No').locator('tbody tr').filter({ hasText: d.containerNo }).first();
    await expect(row).toBeVisible();
    return { row: (await row.innerText()).replace(/\s+/g, ' ').trim(), outcomes };
  }

  async addCargo(d: CBCargo): Promise<string> {
    await this.tab('Cargo Information');
    await this.page.getByRole('button', { name: /Add Cargo/ }).click();
    const pop = this.popup('Add Cargo');
    await expect(pop).toBeVisible();
    await setField(this.page, pop, 'Cargo Name', d.cargoName);
    await setField(this.page, pop, 'HS Code', d.hsCode);
    await setField(this.page, pop, 'Commodity', d.commodity);
    await this.submitPopup('Add Cargo');
    const row = this.table('Commodity').locator('tbody tr').filter({ hasText: d.cargoName }).first();
    for (const v of [d.cargoName, d.hsCode, d.commodity]) await expect(row).toContainText(v);
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }

  /** Create Job, accepting a confirmation popup if one appears. Returns the toast text. */
  async createJob(): Promise<string> {
    return actionToast(this.page, async () => {
      await this.page.getByRole('button', { name: 'Create Job', exact: true }).click();
      const yes = this.page.getByRole('button', { name: /^(Yes|OK|Confirm)/ }).first();
      if (await yes.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) await yes.click();
    }, 30000);
  }

  // ---------------- Child Job List ----------------

  async openChildJobList() {
    await assertStillLoggedIn(this.page);
    await this.openExportSeaMenu('Child Job List');
    await expect(this.childListHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  childRow(referenceInvoiceNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(referenceInvoiceNo, { exact: true }) }).first();
  }

  /** How many list rows carry this BL/Invoice value - used to prove a re-run never created a duplicate Child Job. */
  async childRowCount(referenceInvoiceNo: string): Promise<number> {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(referenceInvoiceNo, { exact: true }) }).count();
  }

  async childRowValues(referenceInvoiceNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
    const cells = (await this.childRow(referenceInvoiceNo).locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  /** The row's icon-only actions in DOM order: View, then Edit. */
  async openChildView(referenceInvoiceNo: string) {
    await this.childRow(referenceInvoiceNo).getByRole('button').nth(0).click();
    await expect(this.childListHeading).toBeHidden();
    await expect(this.page.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  }

  async openChildEdit(referenceInvoiceNo: string) {
    await this.childRow(referenceInvoiceNo).getByRole('button').nth(1).click();
    await expect(this.childListHeading).toBeHidden();
    await expect(this.page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
  }

  async back() {
    await this.page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(this.childListHeading).toBeVisible();
  }

  async submitChildUpdate(): Promise<string> {
    return actionToast(this.page, () => this.page.getByRole('button', { name: 'Update', exact: true }).last().click(), 30000);
  }

  /** Text of the row's status action button ("Initiate SB", "SB Initiated", ...). */
  async childStatusAction(referenceInvoiceNo: string): Promise<string> {
    // Wait for the row's own action buttons to render - reading them while the list is still loading returns [].
    await expect(this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Update Status', exact: true })).toBeVisible({ timeout: 20000 });
    const buttons = await this.childRow(referenceInvoiceNo).getByRole('button').allInnerTexts();
    return buttons.map((b) => b.trim()).filter((b) => b && b !== 'Update Status').pop() ?? '';
  }

  async clickInitiateSB(referenceInvoiceNo: string) {
    await this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Initiate SB', exact: true }).click();
    await expect(this.page.getByRole('heading', { name: /Shipping Bill/ })).toBeVisible();
  }

  readToast(timeout?: number) {
    return readToast(this.page, timeout);
  }

  // ---------------- Update Status ----------------

  /** Every action button on the Child Job row, in order (icons have no text), e.g. ["", "", "Update Status", "Initiate SB"]. */
  async rowActions(referenceInvoiceNo: string): Promise<string[]> {
    await expect(this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Update Status', exact: true })).toBeVisible({ timeout: 20000 });
    return (await this.childRow(referenceInvoiceNo).getByRole('button').allInnerTexts()).map((b) => b.trim());
  }

  /**
   * Opens the row's "Update Status" dialog and reads every status checkbox as { checked, enabled }. Verified live: the
   * dialog is a checklist (Export Invoice Received, Job Generated, SB Received, LEO Received, Stuffing Completed, EIR Received,
   * EGM Filed, Invoice Generated, Payment Received, Job Completed, LEO Cancellation, Shut Out); reached statuses are
   * checked+disabled, only the next allowed ones are enabled. Closes the dialog again with Cancel.
   */
  async statusSnapshot(referenceInvoiceNo: string): Promise<Record<string, { checked: boolean; enabled: boolean }>> {
    await this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Update Status', exact: true }).click();
    const heading = this.page.getByRole('heading', { name: 'Update Status', exact: true });
    await expect(heading).toBeVisible();
    const snap = await this.readStatusDialog();
    await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(heading).toBeHidden();
    return snap;
  }

  private async readStatusDialog(): Promise<Record<string, { checked: boolean; enabled: boolean }>> {
    const boxes = this.page.getByRole('checkbox');
    await expect(boxes.first()).toBeVisible();
    const out: Record<string, { checked: boolean; enabled: boolean }> = {};
    for (let i = 0; i < (await boxes.count()); i++) {
      const b = boxes.nth(i);
      const name = await b.evaluate((el: HTMLInputElement) => (el.closest('label')?.textContent || el.parentElement?.textContent || '').trim());
      out[name] = { checked: await b.isChecked(), enabled: await b.isEnabled() };
    }
    return out;
  }

  /**
   * Ticks one status in the Update Status dialog and Saves. The API answers HTTP 200 even when it refuses
   * ({"type":"warning","message":"Process is not completed yet..."}), so the response BODY decides success - never the click.
   * Returns the dialog state before, the response message, the toast and the state after reopening the dialog.
   */
  async updateStatus(referenceInvoiceNo: string, status: string): Promise<{
    succeeded: boolean;
    selectable: boolean;
    message: string;
    toast: string;
    before: Record<string, { checked: boolean; enabled: boolean }>;
    after: Record<string, { checked: boolean; enabled: boolean }>;
  }> {
    await this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Update Status', exact: true }).click();
    const heading = this.page.getByRole('heading', { name: 'Update Status', exact: true });
    await expect(heading).toBeVisible();
    const before = await this.readStatusDialog();
    const box = this.page.getByRole('checkbox', { name: status, exact: true });
    const selectable = await box.isEnabled();
    if (!selectable) {
      await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(heading).toBeHidden();
      return { succeeded: false, selectable: false, message: `"${status}" is not selectable in the dialog (checked=${before[status]?.checked}, enabled=false)`, toast: '', before, after: before };
    }
    await box.check();
    let message = '';
    let succeeded = false;
    const toast = await actionToast(this.page, async () => {
      const responsePromise = this.page.waitForResponse((res) => /updateChildJobStatus/.test(res.url()) && res.request().method() === 'PUT', { timeout: 30000 });
      await this.page.getByRole('button', { name: 'Save', exact: true }).click();
      const response = await responsePromise;
      const body = await response.json().catch(() => null);
      message = String(body?.message ?? '');
      succeeded = response.ok() && !(body && body.type === 'warning');
    }, 30000);
    if (await heading.isVisible().catch(() => false)) {
      await this.page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(heading).toBeHidden();
    }
    await this.openChildJobList();
    const after = await this.statusSnapshot(referenceInvoiceNo);
    return { succeeded, selectable: true, message, toast, before, after };
  }

  async clickInitiateDraftInvoice(referenceInvoiceNo: string): Promise<string> {
    const button = this.childRow(referenceInvoiceNo).getByRole('button', { name: 'Initiate Draft Invoice', exact: true });
    await expect(button, 'Initiate Draft Invoice should be offered for this Child Job').toBeVisible({ timeout: 20000 });
    return actionToast(this.page, () => button.click(), 30000);
  }
}

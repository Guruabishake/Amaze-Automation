import { Page, Locator, expect } from '@playwright/test';
import { assertStillLoggedIn } from '../utils/commonActions';
import { actionToast, readToast } from '../utils/commonActions';
import { setField, readField, FieldOutcome } from '../utils/formFields';
import { StuffingRowData } from '../utils/testData';

/** One Master Job container row as the table shows it, keyed by column header. */
export type ContainerRow = Record<string, string>;

/**
 * CB -> CB - Export Sea -> Stuffing (/cb/stuffing) and the Stuffing-Create / Stuffing-Edit form
 * (/cb/stuffingForm?shipping_bill_es_id=...). Verified live on DivyaImpex (2026-10-23):
 * - List columns: Child Job No / Booking Job No / Document Reference No. / Stuffing No / Product Type / TMS Enabled /
 *   Shipper / Consignee / Status / BL/Invoice No. / Actions (View icon, then Edit icon - Edit is disabled for some records).
 * - Form tabs: Booking Reference (Child Job No, Booking Job No, Reference No, Mode, Product Type, Shipper, Consignee),
 *   Container Information (sub-tabs "Container Info - Flatfile" read-only and "Container Info - Master Job" with
 *   "+ Add New", row Edit/Delete icons) and Upload File (Document Type, file, "+ Add Document").
 * - The container dialog (Edit / Add New) holds SB No., SB Date, Container No., Size, Type, Customs Seal, Shipper Seal,
 *   Liner Seal, No of Pkgs, Gross Weight, Net Weight, CBM, HS Code, Commodity; Edit has "Update", Add New has "Add".
 */
export class StuffingPage {
  readonly page: Page;
  readonly listHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.listHeading = page.getByRole('heading', { name: 'Stuffing', exact: true });
  }

  // ---------------- List ----------------

  async navigateList() {
    await assertStillLoggedIn(this.page);
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    const link = this.page.getByRole('button', { name: 'Stuffing', exact: true });
    if (!(await link.isVisible())) await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    await link.click();
    await expect(this.listHeading).toBeVisible();
    await expect(this.page.getByText(/\d+ records$/).first()).toBeVisible({ timeout: 20000 });
  }

  /** The list row for a Child Job (Child Job No is unique per Scenario 3 run). */
  row(childJobNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(childJobNo, { exact: true }) }).first();
  }

  async rowValues(childJobNo: string): Promise<Record<string, string>> {
    const header = (await this.page.locator('div[style*="grid-template-columns"]').first().locator(':scope > div').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim().toUpperCase());
    const cells = (await this.row(childJobNo).locator(':scope > div').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = cells[i] ?? ''));
    return out;
  }

  async rowCountFor(childJobNo: string): Promise<number> {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ has: this.page.getByText(childJobNo, { exact: true }) }).count();
  }

  async stuffingNoFor(childJobNo: string): Promise<string> {
    await expect(this.row(childJobNo), `Stuffing for ${childJobNo} should be listed`).toBeVisible({ timeout: 30000 });
    const m = (await this.row(childJobNo).innerText()).match(/STUFFING-\d+/);
    expect(m, `Stuffing No should be shown for ${childJobNo}`).not.toBeNull();
    return m![0];
  }

  /** Row icons in DOM order: View (unnamed), Edit ("Edit"). */
  async openEdit(childJobNo: string) {
    const edit = this.row(childJobNo).getByRole('button', { name: 'Edit', exact: true });
    await expect(edit, 'Edit should be enabled for this Stuffing').toBeEnabled();
    await edit.click();
    await expect(this.page.getByRole('heading', { name: 'Stuffing-Edit', exact: true })).toBeVisible();
    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
  }

  // ---------------- Form ----------------

  async openTab(tab: 'Booking Reference' | 'Container Information' | 'Upload File') {
    await this.page.getByRole('button', { name: tab, exact: true }).click();
  }

  async openMasterJobSection() {
    await this.openTab('Container Information');
    await this.page.getByRole('button', { name: 'Container Info - Master Job', exact: true }).click();
    await expect(this.page.getByRole('button', { name: /Add New/ })).toBeVisible();
  }

  async bookingReference(): Promise<Record<string, string>> {
    await this.openTab('Booking Reference');
    const read = async (label: string) => (await this.page.getByRole('textbox', { name: label, exact: true }).inputValue()).trim();
    return {
      childJobNo: await read('Child Job No'),
      bookingJobNo: await read('Booking Job No'),
      referenceNo: await read('Reference No'),
      mode: await read('Mode'),
      productType: await read('Product Type'),
      shipper: await read('Shipper'),
      consignee: await read('Consignee'),
    };
  }

  async fillReferenceNo(value: string): Promise<FieldOutcome> {
    await this.openTab('Booking Reference');
    const outcome = await setField(this.page, this.page, 'Reference No', value);
    expect(outcome.mode, `Reference No must be editable (${outcome.note ?? outcome.mode})`).toMatch(/text/);
    await expect(this.page.getByRole('textbox', { name: 'Reference No', exact: true })).toHaveValue(value);
    return outcome;
  }

  masterTable(): Locator {
    return this.page.getByRole('table').filter({ has: this.page.getByRole('columnheader', { name: 'CBM', exact: true }) });
  }

  masterRows(): Locator {
    return this.masterTable().locator('tbody tr').filter({ hasNotText: 'No data' });
  }

  async readMasterRows(): Promise<ContainerRow[]> {
    // The table only exists on Container Information > Container Info - Master Job; make sure that is what is showing.
    await this.openMasterJobSection();
    await expect(this.masterTable()).toBeVisible();
    const headers = (await this.masterTable().locator('thead th').allInnerTexts()).map((h) => h.replace(/\s+/g, ' ').trim());
    const rows = this.masterRows();
    const out: ContainerRow[] = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const cells = (await rows.nth(i).locator('td').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
      const r: ContainerRow = {};
      headers.forEach((h, j) => (r[h] = cells[j] ?? ''));
      out.push(r);
    }
    return out;
  }

  /** Dialog field map: label -> row-table header it must show afterwards. */
  private static FIELDS: Array<[keyof StuffingRowData, string, string, 'text' | 'dropdown']> = [
    ['sbNo', 'SB No.', 'SB No.', 'text'],
    ['sbDate', 'SB Date', 'SB Date', 'text'],
    ['containerNo', 'Container No.', 'Container No.', 'text'],
    ['size', 'Size', 'Container Size', 'dropdown'],
    ['type', 'Type', 'Container Type', 'dropdown'],
    ['customsSeal', 'Customs Seal', 'Customs seal no.', 'text'],
    ['shipperSeal', 'Shipper Seal', 'Shipper seal no.', 'text'],
    ['linerSeal', 'Liner Seal', 'Liner seal no.', 'text'],
    ['noOfPkgs', 'No of Pkgs', 'No of Pkgs', 'text'],
    ['grossWeight', 'Gross Weight', 'Gross Weight', 'text'],
    ['netWeight', 'Net Weight', 'Net Weight', 'text'],
    ['cbm', 'CBM', 'CBM', 'text'],
    ['hsCode', 'HS Code', 'HS Code', 'text'],
    ['commodity', 'Commodity', 'Commodity', 'text'],
  ];

  /** Fills the open container dialog; returns per-field outcomes (absent/disabled fields are reported, never forced). */
  private async fillDialog(values: StuffingRowData): Promise<FieldOutcome[]> {
    const out: FieldOutcome[] = [];
    for (const [key, label] of StuffingPage.FIELDS.map((f) => [f[0], f[1]] as const)) {
      const v = values[key];
      if (v === undefined) continue;
      out.push(await setField(this.page, this.page, label, v));
    }
    return out;
  }

  /** Edits one Master Job row via its edit icon and the dialog's Update; verifies the table shows what was entered. */
  async editRow(index: number, values: StuffingRowData): Promise<{ outcomes: FieldOutcome[]; row: ContainerRow }> {
    await this.openMasterJobSection();
    const row = this.masterRows().nth(index);
    await row.locator('td').last().getByRole('button').first().click();
    await expect(this.page.getByRole('button', { name: 'Update', exact: true }).first()).toBeVisible();
    const outcomes = await this.fillDialog(values);
    await this.page.getByRole('button', { name: 'Update', exact: true }).first().click();
    await expect(this.page.getByRole('button', { name: 'Update', exact: true }).first()).toBeHidden({ timeout: 15000 });
    const saved = (await this.readMasterRows())[index];
    for (const [key, , header] of StuffingPage.FIELDS) {
      const v = values[key];
      const outcome = outcomes.find((o) => o.value === v);
      if (v === undefined || !outcome || !['text', 'date', 'dropdown'].includes(outcome.mode)) continue;
      expect.soft(saved[header], `row ${index + 1} "${header}" after Update`).toContain(this.displayed(key, v));
    }
    return { outcomes, row: saved };
  }

  /** dd-mm-yyyy is what the table displays for an ISO date typed into a date input. */
  private displayed(key: keyof StuffingRowData, value: string): string {
    if (key === 'sbDate') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    }
    return value;
  }

  async addRow(values: StuffingRowData): Promise<{ outcomes: FieldOutcome[]; row: ContainerRow }> {
    await this.openMasterJobSection();
    const before = await this.masterRows().count();
    await this.page.getByRole('button', { name: /Add New/ }).click();
    const addButton = this.page.getByRole('button', { name: 'Add', exact: true });
    await expect(addButton).toBeVisible();
    const outcomes = await this.fillDialog(values);
    await addButton.click();
    await expect(addButton, 'Add New dialog should close after Add (still open = values rejected)').toBeHidden({ timeout: 15000 });
    await expect(this.masterRows()).toHaveCount(before + 1);
    const saved = (await this.readMasterRows())[before];
    if (values.containerNo) expect(saved['Container No.']).toBe(values.containerNo);
    return { outcomes, row: saved };
  }

  /** Deletes ONE row via its trash icon and the confirmation (Yes); proves only that row went and the others are intact. */
  async deleteRow(index: number): Promise<{ confirmation: string; deleted: ContainerRow; remaining: ContainerRow[] }> {
    await this.openMasterJobSection();
    const before = await this.readMasterRows();
    const target = before[index];
    let nativeMessage = '';
    const handler = async (d: import('@playwright/test').Dialog) => {
      nativeMessage = d.message();
      await d.accept();
    };
    this.page.once('dialog', handler);
    await this.masterRows().nth(index).locator('td').last().getByRole('button').last().click();
    const yes = this.page.getByRole('button', { name: /^(Yes|OK)/ }).first();
    let confirmation = nativeMessage;
    if (!nativeMessage && (await yes.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false))) {
      this.page.off('dialog', handler);
      const box = this.page.locator('div').filter({ has: yes }).filter({ has: this.page.locator('p, h1, h2, h3') }).last();
      const labels = (await box.getByRole('button').allInnerTexts()).map((b) => b.trim());
      confirmation = (await box.innerText()).split('\n').map((l) => l.trim()).filter((l) => l && !labels.includes(l)).join(' ');
      await yes.click();
    }
    this.page.off('dialog', handler);
    expect(confirmation, 'Delete should ask for confirmation').not.toBe('');
    await expect(this.masterRows()).toHaveCount(before.length - 1);
    const remaining = await this.readMasterRows();
    const expected = before.filter((_, i) => i !== index);
    expect(remaining, 'Only the selected row is deleted; every other row is unchanged').toEqual(expected);
    // Count-based (the table can legitimately list a container number more than once): exactly one fewer row carries it.
    const sameBefore = before.filter((r) => r['Container No.'] === target['Container No.']).length;
    const sameAfter = remaining.filter((r) => r['Container No.'] === target['Container No.']).length;
    expect(sameAfter, `Exactly one row for ${target['Container No.']} is removed`).toBe(sameBefore - 1);
    return { confirmation, deleted: target, remaining };
  }

  // ---------------- Upload ----------------

  async uploadDocument(documentType: string, filePath: string): Promise<{ row: string; outcome: FieldOutcome }> {
    await this.openTab('Upload File');
    const outcome = await setField(this.page, this.page, 'Document Type', documentType);
    expect(outcome.mode, `Document Type must be selectable (${outcome.note ?? outcome.mode})`).toBe('dropdown');
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    await this.page.getByRole('button', { name: /Add Document/ }).click();
    const fileName = filePath.split(/[\\/]/).pop()!;
    const row = this.page.getByRole('table').locator('tbody tr').filter({ hasText: fileName }).first();
    await expect(row, 'Uploaded document should be listed').toBeVisible({ timeout: 30000 });
    await expect(row).toContainText(documentType);
    return { row: (await row.innerText()).replace(/\s+/g, ' ').trim(), outcome };
  }

  async documentRows(): Promise<string[]> {
    await this.openTab('Upload File');
    const rows = this.page.getByRole('table').locator('tbody tr').filter({ hasNotText: 'No data' });
    return (await rows.allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim());
  }

  // ---------------- Create / Update ----------------

  async submitCreate(): Promise<string> {
    const toast = await actionToast(this.page, () => this.page.getByRole('button', { name: 'Create', exact: true }).last().click(), 30000);
    await expect(this.listHeading, 'Create should return to the Stuffing list').toBeVisible({ timeout: 30000 });
    return toast;
  }

  async submitUpdate(): Promise<string> {
    const toast = await actionToast(this.page, () => this.page.getByRole('button', { name: 'Update', exact: true }).last().click(), 30000);
    await expect(this.listHeading, 'Update should return to the Stuffing list').toBeVisible({ timeout: 30000 });
    return toast;
  }

  readToast(timeout?: number) {
    return readToast(this.page, timeout);
  }

  async readField(label: string) {
    return readField(this.page, label);
  }
}

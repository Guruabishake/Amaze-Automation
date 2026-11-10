import { Page, Locator, expect } from '@playwright/test';
import { captureToastAndScreenshot, currentToastText } from '../utils/toast';

/**
 * CB - Export Sea's own "Job List" (CB -> "CB - Export Sea" expandable submenu -> "Job List").
 * Confirmed live via direct UI discovery (never assumed):
 *
 * - "CB - Export Sea" (and the other three "CB - {Direction} {Mode}" sidebar entries) is an
 *   EXPANDABLE SUBMENU, not a navigation link itself - clicking it reveals its own real sub-links:
 *   "Job List", "Shipping Bill", "Stuffing", "Draft Invoice", "Final Invoice", "Vendor Bill".
 *   Confirmed live the submenu is not rendered at all while sitting deep on a create-form page
 *   (e.g. right after Create CB Job) - re-clicking the top-level "CB" module icon first reliably
 *   re-shows it, so every navigation method here does that first.
 * - Route `/cb/exportseachildjob`, heading "Job List". Columns: Enquiry No / Quote No / Customer ID
 *   / Customer Name / SB No. / Job Status / Actions - confirmed live the Enquiry No/Quote No/
 *   Customer ID cells are blank for jobs created through this automation's own flow, so SB No. (the
 *   value this suite itself generates and controls) is the reliable row identifier, not Enquiry No.
 * - A row's own Actions are "Update Status" (always) plus a SECOND action that changes with the
 *   real Job Status - confirmed live "Initiate SB" for "Job Generated", "Initiate Draft Invoice"
 *   once the status has progressed past "LEO Received". Never assume "Initiate SB" is always
 *   present - check status first.
 * - "Update Status" opens a real modal - confirmed live NOT a searchable combobox (an earlier
 *   assumption that hung indefinitely with no matching element), but a plain "Search Status" filter
 *   textbox above a scrollable checklist of every real status, each its own checkbox. Real full
 *   status list (never invented): Export Invoice Received, Job Generated, SB Received, LEO
 *   Received, Stuffing Completed, EIR Received, Invoice Generated, Payment Received, EGM Filed, Job
 *   Completed, SB Cancellation, LEO Cancellation, Shut Out, Partial Shutout. Already-reached
 *   statuses render checked+disabled; only the real immediate-next status (plus a couple of
 *   always-available exception statuses, e.g. "Shut Out") renders enabled+unchecked - the app
 *   enforces sequential progression, this Page Object does not. Cancel/Save buttons.
 * - The real Filter panel fields (confirmed live, exact labels): SB Number, Customer Name, Customer
 *   ID, Job No, Enquiry No, Quote No, Combined Job No - plus Reset/Search buttons. Confirmed live
 *   the Filter panel auto-closes once Search succeeds (unlike several other lists in this suite,
 *   where it stays open) - the standalone toolbar "Reset" button (not scoped inside any `<form>`)
 *   is what actually clears a filter here. Also confirmed live: "Combined Job No" genuinely never
 *   has a value for jobs created through this automation's own flow (filtering by it always returns
 *   "No data matches your filter criteria.") - a real app data-linkage gap, not a bug here.
 */
export class CBJobPage {
  readonly page: Page;
  readonly pageHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = this.page.getByRole('heading', { name: 'Job List', exact: true });
  }

  /** Re-clicks the top-level "CB" module icon (required to re-render the submenu from a deep create-form page), then opens the "CB - Export Sea" submenu only if it is not already open. */
  private async ensureExportSeaSubmenuOpen() {
    await this.page.getByRole('button', { name: 'CB', exact: true }).click();
    await this.page.waitForTimeout(300);
    const jobListVisible = await this.page.getByRole('button', { name: 'Job List', exact: true }).isVisible().catch(() => false);
    if (!jobListVisible) {
      await this.page.getByRole('button', { name: 'CB - Export Sea', exact: true }).click();
    }
  }

  async navigateFromSidebar() {
    await this.ensureExportSeaSubmenuOpen();
    await this.page.getByRole('button', { name: 'Job List', exact: true }).click({ timeout: 15_000 });
    await expect(this.pageHeading).toBeVisible();
  }

  /** SB No. is the reliable row identifier for jobs this suite created (Enquiry No/Quote No/Customer ID are confirmed blank in this list). */
  getRowBySbNo(sbNo: string): Locator {
    return this.page.locator('div[style*="grid-template-columns"]').filter({ hasText: sbNo }).first();
  }

  async expectJobStatus(sbNo: string, status: string) {
    await expect(this.getRowBySbNo(sbNo)).toContainText(status);
  }

  async openFilter() {
    const alreadyOpen = await this.page.getByRole('textbox', { name: 'SB Number', exact: true }).isVisible().catch(() => false);
    if (!alreadyOpen) {
      await this.page.getByRole('button', { name: 'Filter', exact: true }).click();
    }
    await expect(this.page.getByRole('textbox', { name: 'SB Number', exact: true })).toBeVisible();
  }

  private async searchAndWait() {
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(this.page.getByText(/\d+(\s+of\s+\d+)?\s+records$/)).toBeVisible();
  }

  async filterBySbNumber(value: string) {
    await this.page.getByRole('textbox', { name: 'SB Number', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByCustomerName(value: string) {
    await this.page.getByRole('textbox', { name: 'Customer Name', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByCustomerId(value: string) {
    await this.page.getByRole('textbox', { name: 'Customer ID', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByJobNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Job No', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByEnquiryNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByQuoteNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Quote No', exact: true }).fill(value);
    await this.searchAndWait();
  }
  async filterByCombinedJobNo(value: string) {
    await this.page.getByRole('textbox', { name: 'Combined Job No', exact: true }).fill(value);
    await this.searchAndWait();
  }

  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /**
   * Confirmed live: unlike several other lists in this suite, the Filter panel here auto-closes
   * once Search succeeds - leaving only the single standalone toolbar "Reset" button (not scoped
   * inside any `<form>`), so this targets that directly rather than a form-scoped one. Also
   * confirmed live (same real staging-concurrency issue already fixed on FFJobPage/VendorBillPage's
   * own resetFilter): asserting the post-Reset total matches an EXACT pre-filter count is flaky
   * since other real activity on the shared staging environment can genuinely change it in between
   * - checking that a "N records" summary reappears at all is the real, reliable success signal.
   */
  async resetFilter() {
    await this.page.getByRole('button', { name: 'Reset', exact: true }).click({ timeout: 20_000 });
    await expect(this.pageHeading).toBeVisible();
    await expect(this.page.getByText(/^\d+ records$/)).toBeVisible({ timeout: 20_000 });
  }

  /**
   * Updates a row's Job Status via the real "Update Status" modal. Confirmed live via a real DOM
   * scan (NOT a searchable combobox, as first assumed - that guess hung indefinitely with no
   * matching element): "Search Status" is a plain filter textbox above a scrollable checklist of
   * every real status (14 confirmed-live real values - see class comment). Already-reached statuses
   * render checked and disabled; only the immediate next status in the real progression (plus a
   * couple of always-available exception statuses, e.g. "Shut Out") renders enabled and unchecked.
   * Each checkbox's accessible name comes from its adjacent `<span>` text, so
   * `getByRole('checkbox', { name: status })` resolves it directly - `status` must be one of the
   * confirmed-live real values, never an invented name.
   *
   * Confirmed live real business rule (root-caused via the actual response BODY, not just its HTTP
   * status - the API returns HTTP 200 even on rejection): `PUT .../childjob/updateChildJobStatus/
   * {id}` responds `{"status":8,"type":"warning","message":"Process is not completed yet! Please
   * complete the process before updating the status."}` when the real downstream step for that
   * status (e.g. "SB Received" requires the Shipping Bill to actually exist, via "Initiate SB")
   * has not happened yet - the app enforces sequential process completion, not just a checkbox
   * selection. Callers must run "Initiate SB" (or whatever the target status' own real prerequisite
   * is) BEFORE calling this for that status, never assume HTTP 200 alone means success.
   *
   * `captureToast` (optional, additive - every existing call site omits it and keeps its exact
   * prior behavior): when the update succeeds, captures the real success toast (via the shared
   * `captureToastAndScreenshot` utility) BEFORE the modal's own Cancel dismiss below, since the
   * toast is confirmed live to auto-dismiss well before `navigateFromSidebar()`'s own multi-click
   * round-trip would otherwise get back to it.
   */
  async updateJobStatus(
    sbNo: string,
    status: string,
    captureToast?: { module: string; actionName: string }
  ): Promise<{ succeeded: boolean; message?: string; toastText?: string }> {
    await this.getRowBySbNo(sbNo).getByRole('button', { name: 'Update Status', exact: true }).click({ timeout: 20_000 });
    const modalHeading = this.page.getByRole('heading', { name: 'Update Status', exact: true });
    await expect(modalHeading).toBeVisible({ timeout: 15_000 });
    await this.page.getByRole('checkbox', { name: status, exact: true }).check({ timeout: 20_000 });
    const toastBefore = captureToast ? await currentToastText(this.page) : undefined;
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes('/childjob/updateChildJobStatus/') && res.request().method() === 'PUT'
    );
    await this.page.getByRole('button', { name: 'Save', exact: true }).click({ timeout: 20_000 });
    const response = await responsePromise;
    expect(response.ok(), `Update Status HTTP call should succeed. Status ${response.status()}`).toBeTruthy();
    const body = await response.json().catch(() => null);
    const succeeded = !(body && body.type === 'warning');
    let toastText: string | undefined;
    if (succeeded && captureToast) {
      toastText = await captureToastAndScreenshot(this.page, captureToast.module, captureToast.actionName, toastBefore).catch(() => undefined);
    }
    // Confirmed live on a REJECTED update (warning body): the modal's own backdrop stays in the DOM
    // and keeps intercepting every subsequent click until explicitly dismissed via Cancel - the
    // already-persisted Save is not undone by this, it is a separate "the app never auto-closes this
    // dialog on rejection" behavior, not a cancellation. Newly confirmed live on a genuinely
    // SUCCESSFUL update (EIR Received): the app closes the modal AND refreshes the Job List row
    // itself with no Cancel needed - a real, distinct success-path behavior discovered via a live run
    // where the modal was already gone (and the row already showed the new status) by the time this
    // code reached the Cancel click, timing out. Checking visibility first makes this idempotent
    // across both real cases instead of assuming the rejection-path behavior always applies.
    const modalStillOpen = await modalHeading.isVisible().catch(() => false);
    if (modalStillOpen) {
      await this.page.getByRole('button', { name: 'Cancel', exact: true }).click({ timeout: 20_000 });
      await expect(modalHeading).not.toBeVisible({ timeout: 20_000 });
    }
    await this.navigateFromSidebar();
    return { succeeded, message: body?.message, toastText };
  }

  /** Row action present while Job Status is "Job Generated" (confirmed live - not present once the status has progressed further). */
  async initiateSB(sbNo: string) {
    await this.getRowBySbNo(sbNo).getByRole('button', { name: 'Initiate SB', exact: true }).click({ timeout: 15_000 });
  }

  /**
   * Row action present once Job Status reaches "EIR Received" (confirmed live - replaces "Initiate
   * SB" as the row's own second action once the job has progressed that far). Clicking it navigates
   * straight to the Draft Invoice LIST (`/cb/draftInvoice`) with the new record already created -
   * confirmed live there is no separate creation form, unlike Shipping Bill/Stuffing. Real success
   * toast: "Draft Invoice initiated successfully for tenant: {tenant}." - captured by the caller via
   * `captureToastAndScreenshot`, never assumed here.
   */
  async initiateDraftInvoice(sbNo: string) {
    await this.getRowBySbNo(sbNo).getByRole('button', { name: 'Initiate Draft Invoice', exact: true }).click({ timeout: 15_000 });
  }
}

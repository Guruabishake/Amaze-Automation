import { BugReport, FailureType, TransactionIdentifiers, ValidationResult, ValidationStatus, defaultSeverityFor } from './validationModel';

/**
 * Not every recorded bug represents an actual PRODUCT defect (explicit project requirement - "do
 * not automatically classify every failure as a product bug"). DATA_ISSUE ("required transaction
 * data was never created"), AUTOMATION_ISSUE ("the automation's own locator broke"), and
 * ENVIRONMENT_ISSUE (staging/infra/session problems unrelated to the feature) are all real,
 * worth-recording findings, but they are not evidence the APPLICATION is broken - only UI_ISSUE,
 * FILTER_ISSUE, VALIDATION_ISSUE, API_ISSUE, and PERFORMANCE_ISSUE are. `getProductDefects()`
 * below is what a caller should gate the overall test's pass/fail on, never `getBugs().length`
 * directly - that count is for the summary report, not the fail/pass decision.
 */
const PRODUCT_DEFECT_TYPES: readonly FailureType[] = ['UI_ISSUE', 'FILTER_ISSUE', 'VALIDATION_ISSUE', 'API_ISSUE', 'PERFORMANCE_ISSUE'];

/**
 * The "current test bug collection" - one instance per test run (instantiate it once at the top
 * of a test and pass it into every `validateAndRecord` call), not a module-level singleton, so
 * parallel test runs never share or corrupt each other's results.
 *
 * Bug IDs are generated dynamically (BUG-001, BUG-002, ...) in the order failures are recorded -
 * never hardcoded, never reused within one tracker's lifetime.
 */
export class DefectTracker {
  private readonly results: ValidationResult[] = [];
  private readonly bugs: BugReport[] = [];
  private bugCounter = 0;

  /** Reserves the next bug id without recording anything yet - lets a caller embed the real id into a screenshot filename before the bug object itself is finalized. */
  reserveBugId(): string {
    this.bugCounter += 1;
    return `BUG-${String(this.bugCounter).padStart(3, '0')}`;
  }

  recordPass(entry: Omit<ValidationResult, 'status' | 'failureType'>): ValidationResult {
    const result: ValidationResult = { ...entry, status: 'PASS' };
    this.results.push(result);
    return result;
  }

  /**
   * Records a failure as BOTH a `ValidationResult` (status FAIL, for the full execution log) and a
   * `BugReport` (for the structured defect summary) - `bugId` must already be reserved via
   * `reserveBugId()` so it can be reused as the screenshot filename before this call.
   */
  recordFail(
    bugId: string,
    entry: Omit<ValidationResult, 'status'> & {
      failureType: FailureType;
      errorMessage: string;
      severity?: BugReport['severity'];
      priority?: BugReport['priority'];
    }
  ): { result: ValidationResult; bug: BugReport } {
    const result: ValidationResult = { ...entry, status: 'FAIL' };
    this.results.push(result);

    const { severity, priority } = entry.severity && entry.priority ? { severity: entry.severity, priority: entry.priority } : defaultSeverityFor(entry.failureType);
    const bug: BugReport = {
      bugId,
      module: entry.module,
      feature: entry.feature,
      field: entry.field,
      inputValue: entry.inputValue,
      expected: entry.expected,
      actual: entry.actual,
      failureType: entry.failureType,
      severity,
      priority,
      customerName: entry.transaction.customerName,
      customerId: entry.transaction.customerId,
      enquiryNumber: entry.transaction.enquiryNumber,
      quoteNumber: entry.transaction.quoteNumber,
      combinedJobNumber: entry.transaction.combinedJobNumber,
      timestamp: entry.timestamp,
      url: entry.url,
      screenshot: entry.screenshot,
      video: entry.video,
      trace: entry.trace,
      apiEndpoint: entry.apiEndpoint,
      apiStatus: entry.apiStatus,
      errorMessage: entry.errorMessage,
    };
    this.bugs.push(bug);
    return { result, bug };
  }

  getResults(): readonly ValidationResult[] {
    return this.results;
  }

  getBugs(): readonly BugReport[] {
    return this.bugs;
  }

  /** The subset of recorded bugs that represent an actual product/application defect - see PRODUCT_DEFECT_TYPES above. This, not `getBugs().length`, is what should gate whether the overall test is failed. */
  getProductDefects(): readonly BugReport[] {
    return this.bugs.filter((bug) => PRODUCT_DEFECT_TYPES.includes(bug.failureType));
  }

  getSummary(): { total: number; passed: number; failed: number; skipped: number; bugs: readonly BugReport[]; productDefects: readonly BugReport[] } {
    const passed = this.results.filter((r) => r.status === 'PASS').length;
    const failed = this.results.filter((r) => r.status === 'FAIL').length;
    return { total: this.results.length, passed, failed, skipped: 0, bugs: this.bugs, productDefects: this.getProductDefects() };
  }

  /** Human-readable "Module Validation Summary" block - printed to console and attached to Allure. */
  formatExecutionSummary(title: string): string {
    const { total, passed, failed, productDefects } = this.getSummary();
    const lines = [
      title,
      '='.repeat(title.length),
      ...this.results.map((r) => `${r.field.padEnd(28)}${r.status}${r.status === 'FAIL' ? ` [${r.failureType}]` : ''}`),
      '',
      `Total Validations: ${total}`,
      `Passed: ${passed}`,
      `Failed: ${failed}`,
      `Bugs Found: ${this.bugs.length}`,
      `Product Defects: ${productDefects.length}`,
      `Execution: ${productDefects.length > 0 ? 'COMPLETED WITH DEFECTS' : failed > 0 ? 'COMPLETED WITH NON-PRODUCT FINDINGS' : 'PASSED'}`,
    ];
    return lines.join('\n');
  }

  /** Human-readable, per-bug summary block matching the required BUG-NNN report format - never invents fields it has no evidence for (omits optional ones that are genuinely unavailable, e.g. no API info observed). */
  formatBugSummary(): string {
    if (this.bugs.length === 0) {
      return 'Bug Summary\n===========\n(no defects found)';
    }
    const blocks = this.bugs.map((bug) => {
      const lines = [
        bug.bugId,
        `Module: ${bug.module}`,
        `Feature: ${bug.feature}`,
        `Field: ${bug.field}`,
        `Type: ${bug.failureType}`,
        `Severity: ${bug.severity} / Priority: ${bug.priority}`,
        `Input Value: ${bug.inputValue}`,
        `Expected: ${bug.expected}`,
        `Actual: ${bug.actual}`,
      ];
      if (bug.combinedJobNumber) lines.push(`Combined Job: ${bug.combinedJobNumber}`);
      if (bug.enquiryNumber) lines.push(`Enquiry: ${bug.enquiryNumber}`);
      if (bug.quoteNumber) lines.push(`Quote: ${bug.quoteNumber}`);
      if (bug.customerName) lines.push(`Customer: ${bug.customerName}`);
      if (bug.apiEndpoint) lines.push(`API: ${bug.apiEndpoint}`);
      if (bug.apiStatus !== undefined) lines.push(`HTTP Status: ${bug.apiStatus}`);
      lines.push(`URL: ${bug.url}`);
      lines.push(`Timestamp: ${bug.timestamp}`);
      lines.push(`Error: ${bug.errorMessage}`);
      if (bug.screenshot) lines.push(`Screenshot: ${bug.screenshot}`);
      if (bug.trace) lines.push(`Trace: ${bug.trace}`);
      if (bug.video) lines.push(`Video: ${bug.video}`);
      return lines.join('\n');
    });
    return ['Bug Summary', '==========='].concat(blocks.join('\n\n')).join('\n');
  }
}

export type { ValidationResult, BugReport, FailureType, TransactionIdentifiers, ValidationStatus };

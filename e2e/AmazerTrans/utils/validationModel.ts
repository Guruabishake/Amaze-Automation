/**
 * Reusable data models for the defect-detection framework. Kept as plain data + small factory
 * helpers (no framework dependency of its own) so any spec/page-object in this suite can produce
 * these without depending on Playwright test internals - `defectTracker.ts` and
 * `validateAndRecord.ts` are the pieces that actually wire this into Playwright/Allure.
 */

/**
 * Never auto-assume every failure is a product bug (explicit project requirement) - the caller
 * that best understands what it just attempted is the one that classifies the failure, using
 * these categories:
 * - UI_ISSUE: a screen/element didn't render or behave as the app itself specifies.
 * - FILTER_ISSUE: a search/filter ran but returned the wrong result set (none, wrong record).
 * - VALIDATION_ISSUE: the right record came back but a specific displayed value is wrong.
 * - API_ISSUE: the backend request itself failed or returned an error status.
 * - DATA_ISSUE: the transaction never had the data needed to run this validation at all.
 * - AUTOMATION_ISSUE: the automation's own locator/selector broke, not the application.
 * - ENVIRONMENT_ISSUE: staging/infra unavailable, session/auth problems, unrelated to the feature.
 * - PERFORMANCE_ISSUE: the app responded, correctly, but too slowly to be acceptable.
 * - UNKNOWN: none of the above could be determined from the observed evidence.
 */
export type FailureType =
  | 'UI_ISSUE'
  | 'FILTER_ISSUE'
  | 'VALIDATION_ISSUE'
  | 'API_ISSUE'
  | 'DATA_ISSUE'
  | 'AUTOMATION_ISSUE'
  | 'ENVIRONMENT_ISSUE'
  | 'PERFORMANCE_ISSUE'
  | 'UNKNOWN';

export type ValidationStatus = 'PASS' | 'FAIL';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/**
 * Identifiers for the ONE real transaction a run is validating - every field is optional because
 * not every module/feature has all of them yet (e.g. a Customer-only validation has no
 * combinedJobNumber), but whichever ones the caller has should always be the REAL runtime values
 * captured earlier in the same test, never hardcoded or borrowed from an unrelated record.
 */
export interface TransactionIdentifiers {
  customerName?: string;
  customerId?: string;
  enquiryNumber?: string;
  quoteNumber?: string;
  combinedJobNumber?: string;
  documentReferenceNumber?: string;
  linerNumber?: string;
  blAwbInvoice?: string;
  importExport?: string;
  combinedStatus?: string;
}

export interface ValidationResult {
  module: string;
  feature: string;
  field: string;
  inputValue: string;
  expected: string;
  actual: string;
  status: ValidationStatus;
  failureType?: FailureType;
  timestamp: string;
  url: string;
  screenshot?: string;
  video?: string;
  trace?: string;
  errorMessage?: string;
  apiEndpoint?: string;
  apiStatus?: number;
  transaction: TransactionIdentifiers;
}

export interface BugReport {
  bugId: string;
  module: string;
  feature: string;
  field: string;
  inputValue: string;
  expected: string;
  actual: string;
  failureType: FailureType;
  severity: Severity;
  priority: Priority;
  customerName?: string;
  customerId?: string;
  enquiryNumber?: string;
  quoteNumber?: string;
  combinedJobNumber?: string;
  timestamp: string;
  url: string;
  screenshot?: string;
  video?: string;
  trace?: string;
  apiEndpoint?: string;
  apiStatus?: number;
  errorMessage: string;
}

/**
 * Default severity/priority by failure type - a starting classification a caller can always
 * override per-call (e.g. a FILTER_ISSUE on the primary key field is worse than one on a cosmetic
 * field), never a substitute for the caller's own judgment.
 */
const DEFAULT_SEVERITY_BY_FAILURE_TYPE: Record<FailureType, { severity: Severity; priority: Priority }> = {
  UI_ISSUE: { severity: 'HIGH', priority: 'P2' },
  FILTER_ISSUE: { severity: 'HIGH', priority: 'P2' },
  VALIDATION_ISSUE: { severity: 'HIGH', priority: 'P2' },
  API_ISSUE: { severity: 'CRITICAL', priority: 'P1' },
  DATA_ISSUE: { severity: 'MEDIUM', priority: 'P3' },
  AUTOMATION_ISSUE: { severity: 'LOW', priority: 'P4' },
  ENVIRONMENT_ISSUE: { severity: 'MEDIUM', priority: 'P3' },
  PERFORMANCE_ISSUE: { severity: 'MEDIUM', priority: 'P3' },
  UNKNOWN: { severity: 'MEDIUM', priority: 'P3' },
};

export function defaultSeverityFor(failureType: FailureType): { severity: Severity; priority: Priority } {
  return DEFAULT_SEVERITY_BY_FAILURE_TYPE[failureType];
}

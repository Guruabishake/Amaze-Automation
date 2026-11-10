import { Page } from '@playwright/test';
import { ConfirmOrderPage } from '../pages/ConfirmOrderPage';
import { CombinedJobPage } from '../pages/CombinedJobPage';
import { createQuoteConfirmedRecord } from './quoteConfirmedSetup';
import { CBScenarioConfig } from './cbConfig';
import { generateCbHsnCode } from './testData';
import { captureScreenshot } from './screenshot';

export interface CBSourceRecord {
  enquiryNo: string;
  quoteNo: string;
  customerName: string;
  vendorName: string;
  combinedJobNumber: string;
  shipmentDirection: string;
  shipmentMode: string;
  packages: Array<{ noOfPackages: string; grossWeight: string; netWeight: string; cbm: string; uom: string }>;
  containers: Array<{ containerNo: string; size: string; type: string; kindOfPackages: string }>;
  cargo: Array<{ cargoName: string; hsnCode: string; commodity: string; isDg: string }>;
}

/**
 * Builds ONE real CRM Enquiry -> Quotation -> Pricing -> Quote Approval -> Confirm Quote -> Confirm
 * Master Job -> Combined Job chain for `scenario`'s own Direction/Mode, then reads that SAME
 * Combined Job's real Package/Container/Cargo data back via `getCombinedJobSourceData` - this is
 * the ONLY place CB test data is ever allowed to originate from (never independently generated).
 *
 * Freight-Forwarding is enabled alongside Customs Broker for every scenario (never CB alone):
 * confirmed live via ConfirmOrderPage's own real behavior that a CB-only record's "Jobs to be
 * Created" does not include a Booking/Combined Job at all (no Combined Job List entry is ever
 * created for it), which would leave CB with no Combined Job to source data from. FF+CB together is
 * a real, already-proven-valid Service combination (ENQUIRY_SCENARIOS[0]) that reaches a genuine
 * Combined Job.
 *
 * The source Combined Job's own Cargo record, as carried straight over from the Enquiry, has no
 * real HS Code (confirmed live it shows "--" until edited) and - for Sea scenarios only - no real
 * Container Number (also "--" until a container is actually added via "+Add Container"). Both are
 * enriched here via the SAME real Combined Job Update-form actions (`addContainer`/`editCargo`)
 * this suite already uses elsewhere, so the record CB copies from is genuinely complete, not
 * fabricated by CB's own automation.
 *
 * `containerCount` (Sea scenarios only, default 1): how many real, unique Container Numbers to add
 * to the source Combined Job - CB Export Sea's own downstream flow (Job List -> Shipping Bill ->
 * Stuffing) needs 10 real containers that stay IDENTICAL end-to-end, so its own caller passes 10
 * here rather than this function inventing a different count independently at each stage.
 *
 * `includeTransportManagementSystem` (default false, preserving this function's existing FF+CB
 * callers unchanged): the CB Export Sea downstream (Job List -> Shipping Bill -> Stuffing) spec's
 * own requirement is a CB+FF+TMS Enquiry, not just FF+CB - passing true enables it here rather than
 * duplicating this whole setup chain for one extra service flag.
 */
export async function buildCBSourceRecord(
  page: Page,
  seed: number,
  scenario: CBScenarioConfig,
  containerCount = 1,
  includeTransportManagementSystem = false
): Promise<CBSourceRecord> {
  const record = await createQuoteConfirmedRecord(page, seed, `cb-${scenario.key}`, undefined, {
    shipmentDirection: scenario.shipmentDirection,
    shipmentMode: scenario.shipmentMode,
    services: { freightForwarding: true, customsBroker: true, transportManagementSystem: includeTransportManagementSystem },
  });

  const confirmOrder = new ConfirmOrderPage(page);
  await confirmOrder.navigateFromSidebar();
  await confirmOrder.openFilter();
  await confirmOrder.filterByEnquiryNumber(record.enquiryNo);
  await confirmOrder.clickConfirmMasterJob(record.enquiryNo);
  await confirmOrder.confirmMasterJob(`REF-${seed}`);
  await confirmOrder.expectApprovalStatus(record.enquiryNo, 'Order Confirmed');
  await captureScreenshot(page, 'cb', 'source-order-confirmed', record.enquiryNo);

  const combinedJob = new CombinedJobPage(page);
  await combinedJob.navigateFromSidebar();
  await combinedJob.openFilter();
  await combinedJob.filterByEnquiryNumber(record.enquiryNo);
  const combinedJobNo = await combinedJob.readCombinedJobNumber(record.enquiryNo);

  await combinedJob.openFilter();
  await combinedJob.filterByEnquiryNumber(record.enquiryNo);
  await combinedJob.openCombinedJob(record.enquiryNo);
  if (scenario.shipmentMode === 'Sea') {
    const containerNumbers = combinedJob.generateUniqueContainerNumber(containerCount);
    for (const containerNo of containerNumbers) {
      await combinedJob.addContainer(containerNo, { size: '20', type: 'GP', kindOfPackages: 'Boxes' });
    }
    combinedJob.recordContainers(combinedJobNo, containerNumbers);
  }
  await combinedJob.editCargo({
    cargoName: `QA CB Cargo ${seed}`,
    hsnCode: generateCbHsnCode(seed),
    commodity: 'General Cargo',
    isDg: 'No',
  });
  await combinedJob.saveCombinedJob();
  await captureScreenshot(page, 'cb', 'source-combined-job-enriched', combinedJobNo);

  const sourceData = await combinedJob.getCombinedJobSourceData(record.enquiryNo);

  return {
    enquiryNo: record.enquiryNo,
    quoteNo: record.quoteNo,
    customerName: record.customerName,
    vendorName: record.vendorName,
    combinedJobNumber: sourceData.combinedJobNumber,
    shipmentDirection: sourceData.shipmentDirection,
    shipmentMode: sourceData.shipmentMode,
    packages: sourceData.packages,
    containers: sourceData.containers,
    cargo: sourceData.cargo,
  };
}

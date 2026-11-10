import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { CBPage } from '../pages/CBPage';
import { buildCBSourceRecord, CBSourceRecord } from '../utils/cbSourceSetup';
import { CBScenarioConfig, resolveCBScenario, resolvePortLogic, resolveConfiguredScenarios } from '../utils/cbConfig';
import { loginData, generateMawbNumber, generateHawbNumber, generateCbInvoiceNumber } from '../utils/testData';
import { captureScreenshot } from '../utils/screenshot';
import { env } from '../utils/env';

/**
 * CB (Customs Broker) - Create CB Job, built entirely from the REAL CRM Enquiry -> Quotation ->
 * Pricing -> Quote Approval -> Confirm Quote -> Confirm Master Job -> Combined Job chain (see
 * utils/cbSourceSetup.ts's own header comment) - never independently generated test data. Direction
 * + Shipment Mode, read off that SAME real Combined Job, determine the entire CB workflow (document
 * type, Port Logic, MAWB/HAWB fill behavior) via utils/cbConfig.ts's `resolveCBScenario` - never
 * manually forced.
 *
 * `CB_SCENARIOS` (.env) selects WHICH of the 4 scenarios (importSea/importAir/exportSea/exportAir)
 * this run actually exercises - it changes nothing about HOW each one runs. Every scenario goes
 * through the exact same `runCBScenario` workflow, the one place this whole chain is implemented.
 *
 * AmazerTrans's real Single Active Session per User rule means every configured scenario runs
 * serially inside ONE login/session, same convention as every other multi-step spec in this suite.
 */
test.describe.configure({ mode: 'serial' });

interface CBScenarioResult {
  scenario: CBScenarioConfig;
  customerName: string;
  enquiryNo: string;
  combinedJobNumber: string;
  cbJobResult: 'Created' | 'Failed';
  packageCount: number;
  containerCount: number;
  cargoCount: number;
  failureDetail?: string;
}

/**
 * The ONE common workflow every CB scenario runs through - no per-scenario duplicated
 * implementation. `scenario` (utils/cbConfig.ts) decides document type/which Port gets HARYANA;
 * `buildCBSourceRecord` supplies every real business value (Customer/Enquiry/Package/Container/
 * Cargo) off the real CRM chain. Throws with full traceability context on any failure - the caller
 * captures a screenshot and records it, never swallowed.
 */
async function runCBScenario(page: Page, seed: number, scenario: CBScenarioConfig): Promise<CBScenarioResult> {
  const source: CBSourceRecord = await buildCBSourceRecord(page, seed, scenario);

  // ---------- Configuration-vs-actual-data validation - fail clearly, never silently convert ----------
  const resolvedKey = resolveCBScenario(source.shipmentDirection, source.shipmentMode);
  if (resolvedKey !== scenario.key) {
    throw new Error(
      `CB scenario mismatch for "${scenario.key}": configured Direction/Mode "${scenario.shipmentDirection}/${scenario.shipmentMode}" does not match ` +
        `the REAL source Combined Job's own Direction/Mode "${source.shipmentDirection}/${source.shipmentMode}" (resolves to "${resolvedKey}"). ` +
        `Combined Job: ${source.combinedJobNumber}, Enquiry: ${source.enquiryNo}.`
    );
  }
  expect(source.packages.length, `Combined Job ${source.combinedJobNumber} should have at least one Package to copy into CB`).toBeGreaterThan(0);
  if (scenario.shipmentMode === 'Sea') {
    expect(
      source.containers.length,
      `Sea scenario "${scenario.key}": Combined Job ${source.combinedJobNumber} should have at least one Container to copy into CB`
    ).toBeGreaterThan(0);
  }
  expect(source.cargo.length, `Combined Job ${source.combinedJobNumber} should have at least one Cargo record to copy into CB`).toBeGreaterThan(0);

  const cb = new CBPage(page);
  const ports = resolvePortLogic(scenario.shipmentDirection, env.cbExportSeaPortOfLoading);
  const mawb = generateMawbNumber(seed);
  const hawb = generateHawbNumber(seed);
  const invoiceNo = generateCbInvoiceNumber(seed);
  const today = new Date().toISOString().slice(0, 10);

  await cb.openCBModule();
  await cb.openCreateCBJob();

  if (scenario.documentType === 'Bill of Entry (BE)') {
    await cb.selectBillOfEntry();
    await cb.fillGeneralInformationBE({
      importer: source.customerName,
      beNo: `BE-${seed}`,
      beDate: today,
      portOfLoading: ports.portOfLoading,
      portOfDischarge: ports.portOfDischarge,
      portCode: `PC${seed}`,
      modeOfTransport: scenario.shipmentMode,
    });
    await cb.fillMawb('Bill of Entry (BE)', mawb);
    await cb.fillHawb('Bill of Entry (BE)', hawb);
  } else {
    await cb.selectShippingBill();
    await cb.fillGeneralInformationSB({
      exporter: source.customerName,
      sbNo: `SB-${seed}`,
      sbDate: today,
      portOfLoading: ports.portOfLoading,
      portOfDischarge: ports.portOfDischarge,
    });
    // Confirmed live (root-caused via a real hung/failing run): filling MAWB No on the SB form
    // makes the ENTIRE Container Information section (heading, "+Add Container", table) disappear
    // from the Cargo Information tab - the app reads a filled MAWB No as "this is actually an air
    // shipment" (SB, unlike BE, has no explicit Mode of Transport field of its own to signal that
    // instead). Filling it for an Export+Sea scenario would silently make container data
    // impossible to enter, so MAWB/HAWB are only filled here for Export+Air - not because the app
    // requires it, but because filling it for Sea actively breaks the form.
    if (scenario.shipmentMode === 'Air') {
      await cb.fillMawb('Shipping Bill (SB)', mawb);
      await cb.fillHawb('Shipping Bill (SB)', hawb);
    }
  }
  await captureScreenshot(page, 'cb', 'general-information-filled', `${scenario.key}-${source.enquiryNo}`);

  await cb.fillInvoiceInformation(invoiceNo);
  await captureScreenshot(page, 'cb', 'invoice-information-filled', `${scenario.key}-${source.enquiryNo}`);

  // ---------- Package / Container / Cargo - copied EXACTLY from the real source Combined Job ----------
  await cb.openCargoInformationTab();
  for (const pkg of source.packages) {
    await cb.addPackage({ noOfPackages: pkg.noOfPackages, grossWeight: pkg.grossWeight, netWeight: pkg.netWeight, uom: pkg.uom });
  }
  if (scenario.shipmentMode === 'Sea') {
    for (const c of source.containers) {
      await cb.addContainer({ containerNo: c.containerNo, size: c.size as '20' | '40' | '45', type: c.type });
    }
  }
  for (const cg of source.cargo) {
    await cb.addCargo({ cargoName: cg.cargoName, hsCode: cg.hsnCode, commodity: cg.commodity });
  }
  await captureScreenshot(page, 'cb', 'cargo-information-filled', `${scenario.key}-${source.enquiryNo}`);

  await cb.clickCreateJob();
  await captureScreenshot(page, 'cb', 'after-create-job', `${scenario.key}-${source.enquiryNo}`);

  return {
    scenario,
    customerName: source.customerName,
    enquiryNo: source.enquiryNo,
    combinedJobNumber: source.combinedJobNumber,
    cbJobResult: 'Created',
    packageCount: source.packages.length,
    containerCount: source.containers.length,
    cargoCount: source.cargo.length,
  };
}

test.describe('CB (Customs Broker) - Create CB Job from real CRM Enquiry -> Combined Job chain', () => {
  test('Import Sea / Import Air / Export Sea / Export Air - configured via CB_SCENARIOS', async ({ page }) => {
    const scenarios = resolveConfiguredScenarios(env.cbScenarios);
    // Each scenario runs the full Customer -> Enquiry -> Quotation -> Pricing -> Quote Approval ->
    // Confirm Quote -> Confirm Master Job -> Combined Job (enrich + read back) -> CB Job chain -
    // confirmed live via a real timed run to take close to 9 minutes even without any retries.
    test.setTimeout(scenarios.length * 700_000 + 60_000);

    const login = new LoginPage(page);
    await login.goto(loginData.url);
    await login.login(loginData.username, loginData.password, loginData.branch);
    await login.verifyLoginSuccess();

    const results: CBScenarioResult[] = [];
    const seedBase = Date.now() % 100000;

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      const seed = seedBase + i * 1000;
      try {
        const result = await runCBScenario(page, seed, scenario);
        results.push(result);
        console.log(
          `CB scenario ${scenario.key} PASSED\n` +
            `Direction: ${scenario.shipmentDirection}, Shipment Mode: ${scenario.shipmentMode}, Document Type: ${scenario.documentType}\n` +
            `Customer: ${result.customerName}, Enquiry Number: ${result.enquiryNo}, Combined Job Number: ${result.combinedJobNumber}\n` +
            `Package Count: ${result.packageCount}, Container Count: ${result.containerCount}, Cargo Count: ${result.cargoCount}`
        );
      } catch (error) {
        await captureScreenshot(page, 'cb', 'scenario-failure', scenario.key);
        results.push({
          scenario,
          customerName: '(not reached)',
          enquiryNo: '(not reached)',
          combinedJobNumber: '(not reached)',
          cbJobResult: 'Failed',
          packageCount: 0,
          containerCount: 0,
          cargoCount: 0,
          failureDetail: (error as Error).message,
        });
        console.error(
          `CB scenario ${scenario.key} FAILED\n` +
            `Direction: ${scenario.shipmentDirection}, Shipment Mode: ${scenario.shipmentMode}, Document Type: ${scenario.documentType}\n` +
            `Error: ${(error as Error).message}`
        );
      }
    }

    // ---------- Final report ----------
    const header =
      'Scenario | Direction | Shipment Mode | Document Type | Customer | Enquiry Number | Combined Job Number | CB Job Result | Package Count | Container Count | Cargo Count | Failure Details';
    const rows = results.map((r) =>
      [
        r.scenario.key,
        r.scenario.shipmentDirection,
        r.scenario.shipmentMode,
        r.scenario.documentType,
        r.customerName,
        r.enquiryNo,
        r.combinedJobNumber,
        r.cbJobResult,
        r.packageCount,
        r.containerCount,
        r.cargoCount,
        r.failureDetail ?? '',
      ].join(' | ')
    );
    console.log(`\nCB Automation Final Report\n${header}\n${rows.join('\n')}`);

    const failed = results.filter((r) => r.cbJobResult === 'Failed');
    expect(
      failed.length,
      `${failed.length} of ${results.length} CB scenario(s) failed:\n${failed.map((r) => `${r.scenario.key}: ${r.failureDetail}`).join('\n')}`
    ).toBe(0);
  });
});

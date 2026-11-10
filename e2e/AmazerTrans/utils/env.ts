import * as dotenv from 'dotenv';
import * as path from 'path';

// `dotenv.config()` with no `path` resolves ".env" against `process.cwd()` - confirmed live to
// break as soon as a command is run from any directory other than the repo root (e.g. a terminal
// sitting in e2e/AmazerTrans/tests), even though the config file itself resolves correctly.
// Anchoring to this file's own location removes that dependency on the caller's CWD entirely.
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

// Multi-user execution now goes through the generic, config-driven engine in e2e/shared/multiUser
// (see e2e/AmazerTrans/config/users.config.json + playwright.config.ts's use of
// buildUserProjects()) rather than a fixed set of per-user env vars declared here - any number of
// users, not just a hardcoded 4.

export const env = {
  baseUrl: process.env.AMAZERTRANS_URL || 'https://staging-fc.cargowayz.net/login/AMAZERTRANS',
  username: required('AMAZERTRANS_USERNAME'),
  password: required('AMAZERTRANS_PASSWORD'),
  branch: process.env.AMAZERTRANS_BRANCH || 'Bengaluru Tech Hub',
  customerCount: Number(process.env.CUSTOMER_COUNT) || 1,
  vendorCount: Number(process.env.VENDOR_COUNT) || 1,
  quotationOriginCount: Number(process.env.QUOTATION_ORIGIN_COUNT) || 5,
  quotationInternationalCount: Number(process.env.QUOTATION_INTERNATIONAL_COUNT) || 5,
  quotationDestinationCount: Number(process.env.QUOTATION_DESTINATION_COUNT) || 5,
  quotationUploadEnabled: process.env.QUOTATION_UPLOAD_ENABLED !== 'false',
  // Comma-separated filenames (resolved against e2e/new_folder/assets) or absolute paths.
  // Defaults to the two existing sample assets in testData.ts when unset.
  quotationUploadFiles: process.env.QUOTATION_UPLOAD_FILES || '',
  pricingMarginPercent: process.env.PRICING_MARGIN_PERCENT || '10',
  contractUploadEnabled: process.env.CONTRACT_UPLOAD_ENABLED !== 'false',
  // Comma-separated filenames (resolved against e2e/new_folder/assets) or absolute paths.
  // Defaults to the two existing sample assets in testData.ts when unset - same convention as
  // QUOTATION_UPLOAD_FILES above.
  contractUploadFiles: process.env.CONTRACT_UPLOAD_FILES || '',
  // Comma-separated subset of importSea,importAir,exportSea,exportAir - which CB scenarios
  // cb.spec.ts actually runs. Changes WHICH scenarios run, never their implementation (see
  // utils/cbConfig.ts). Defaults to all 4 when unset.
  cbScenarios: process.env.CB_SCENARIOS || 'importSea,importAir,exportSea,exportAir',
  // Export Sea's own real Port of Loading value (confirmed live: "HARYANA" is a real, valid option
  // in the app's own Port of Loading master list) - configurable so the user can change it without
  // touching any Page Object or test logic (see utils/cbConfig.ts's resolvePortLogic).
  cbExportSeaPortOfLoading: process.env.CB_EXPORT_SEA_PORT_OF_LOADING || 'HARYANA',
};

/**
 * CB (Customs Broker) scenario configuration - the single source of truth for how each of the 4
 * required Direction+Shipment Mode combinations maps onto the CB module's own real, live-confirmed
 * behavior. This is automation STRUCTURE only - the actual Enquiry/Combined Job values (Customer,
 * Enquiry No, Combined Job No, Packages/Containers/Cargo) always come from the real CRM chain via
 * `CombinedJobPage.getCombinedJobSourceData()`, never from here.
 *
 * Confirmed live via direct UI discovery (never assumed):
 * - Create CB Job's own document-type step offers exactly two buttons, "Bill of Entry (BE)" and
 *   "Shipping Bill (SB)" - Direction alone decides which one: Import -> Bill of Entry, Export ->
 *   Shipping Bill. There is no separate creation path per the sidebar's own "CB - Export Sea" /
 *   "CB - Export Air" / "CB - Import Sea" / "CB - Import Air" entries - those are dashboard filter
 *   views, not their own creation forms (confirmed live: only "Create CB Job" leads to a creation
 *   form, at route `/cb/createcbjobform`).
 * - Port of Loading and Port of Discharge share ONE combined master list of 42 real location
 *   options (confirmed live identical on both fields, both the BE and SB forms) - "HARYANA" is
 *   genuinely present in it. Confirmed live real DOM shape: same `div.relative.group` +
 *   `role="combobox"` custom-dropdown pattern already used everywhere else in this suite, so
 *   `selectCustomDropdown` works unmodified.
 * - BE's own tabs are General Information / IGMS Information / Invoice Information / Cargo
 *   Information, with MAWB/BL No. and HAWB/HBL No. living on the separate IGMS Information tab.
 *   SB's own tabs are General Information / Invoice Information / Cargo Information (no IGMS tab
 *   at all) - MAWB No/HAWB No are inline fields on SB's own General Information tab instead. This
 *   is a genuine, confirmed UI difference between the two document types, not a guess - `CBPage.ts`
 *   branches on `documentType` to know which tab/label to use, but does not itself decide which
 *   document type applies (that decision is made here, from the real Enquiry/Combined Job Direction,
 *   before CBPage is ever called).
 */

export type CBScenarioKey = 'CBImportSea' | 'CBImportAir' | 'CBExportSea' | 'CBExportAir';

export type CBEnvScenarioKey = 'importSea' | 'importAir' | 'exportSea' | 'exportAir';

export interface CBScenarioConfig {
  key: CBScenarioKey;
  envKey: CBEnvScenarioKey;
  shipmentDirection: 'Import' | 'Export';
  shipmentMode: 'Sea' | 'Air';
  documentType: 'Bill of Entry (BE)' | 'Shipping Bill (SB)';
}

export const CB_CONFIG: Record<CBScenarioKey, CBScenarioConfig> = {
  CBImportSea: { key: 'CBImportSea', envKey: 'importSea', shipmentDirection: 'Import', shipmentMode: 'Sea', documentType: 'Bill of Entry (BE)' },
  CBImportAir: { key: 'CBImportAir', envKey: 'importAir', shipmentDirection: 'Import', shipmentMode: 'Air', documentType: 'Bill of Entry (BE)' },
  CBExportSea: { key: 'CBExportSea', envKey: 'exportSea', shipmentDirection: 'Export', shipmentMode: 'Sea', documentType: 'Shipping Bill (SB)' },
  CBExportAir: { key: 'CBExportAir', envKey: 'exportAir', shipmentDirection: 'Export', shipmentMode: 'Air', documentType: 'Shipping Bill (SB)' },
};

/**
 * Resolves the real Direction+Mode pair (read from the actual source Combined Job, never assumed)
 * to the one matching CB scenario - fails loudly instead of guessing when the source data doesn't
 * correspond to any of the 4 configured combinations (e.g. a "CROSS TRADE" direction, out of scope
 * for CB automation).
 */
export function resolveCBScenario(shipmentDirection: string, shipmentMode: string): CBScenarioKey {
  const found = Object.values(CB_CONFIG).find(
    (c) => c.shipmentDirection === shipmentDirection && c.shipmentMode === shipmentMode
  );
  if (!found) {
    throw new Error(
      `No CB scenario configured for Direction="${shipmentDirection}" Shipment Mode="${shipmentMode}" - ` +
        `CB automation only covers Import/Sea, Import/Air, Export/Sea, Export/Air.`
    );
  }
  return found.key;
}

/**
 * A real, confirmed-live option from the SAME 42-option master list Port of Loading/Port of
 * Discharge both use - deliberately distinct from "HARYANA" so the two fields never collide.
 */
const PORT_NON_HARYANA_OPTION = 'Chennai SEA';

/**
 * Port Logic rule (confirmed live requirement, HARYANA's real existence verified in both dropdowns
 * before ever being used here - never typed as an assumed value): Import -> Port of Discharge =
 * HARYANA, Port of Loading = any other real option. Export -> Port of Loading = the configured
 * `cbExportSeaPortOfLoading` value (default "HARYANA", see .env's CB_EXPORT_SEA_PORT_OF_LOADING) -
 * the user can change this without touching any Page Object or test logic - Port of Discharge = any
 * other real option.
 */
export function resolvePortLogic(
  shipmentDirection: 'Import' | 'Export',
  exportPortOfLoading: string
): { portOfLoading: string; portOfDischarge: string } {
  return shipmentDirection === 'Import'
    ? { portOfLoading: PORT_NON_HARYANA_OPTION, portOfDischarge: 'HARYANA' }
    : { portOfLoading: exportPortOfLoading, portOfDischarge: PORT_NON_HARYANA_OPTION };
}

/**
 * Parses CB_SCENARIOS (.env, e.g. "importSea,importAir") into the CBScenarioConfig entries to
 * actually run - defaults to all 4 when unset/blank. Fails loudly on an unrecognized token rather
 * than silently ignoring it.
 */
export function resolveConfiguredScenarios(cbScenariosEnv: string): CBScenarioConfig[] {
  const tokens = cbScenariosEnv
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const all = Object.values(CB_CONFIG);
  if (tokens.length === 0) {
    return all;
  }
  return tokens.map((token) => {
    const match = all.find((c) => c.envKey === token);
    if (!match) {
      throw new Error(`CB_SCENARIOS contains unrecognized scenario "${token}" - valid values: importSea, importAir, exportSea, exportAir.`);
    }
    return match;
  });
}

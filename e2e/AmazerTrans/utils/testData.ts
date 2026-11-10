import * as path from 'path';
import { env } from './env';

// Anchored to this file's own location, not process.cwd() - confirmed live that a command run
// from any directory other than the repo root (e.g. e2e/AmazerTrans/tests) resolves cwd-relative
// paths against the WRONG base and throws ENOENT.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const loginData = {
  url: env.baseUrl,
  username: env.username,
  password: env.password,
  branch: env.branch,
};

/**
 * How many Customer / Vendor records the bulk-creation loops create.
 * Controlled entirely via CUSTOMER_COUNT / VENDOR_COUNT in .env - change
 * 5 -> 10 -> 20 -> 50 there, no test code changes required.
 */
export const CUSTOMER_COUNT = env.customerCount;
export const VENDOR_COUNT = env.vendorCount;

/**
 * Configurable Enquiry "Upload File" test assets. Change these three paths to point at different
 * files without touching EnquiryPage.ts or enquiry.spec.ts - both only ever read from here.
 * `primary`/`replacement` are real accepted files (confirmed live: the app accepts .png); `unsupported`
 * is a deliberately non-document extension for the negative file-type test.
 */
export const ENQUIRY_UPLOAD_FILES = {
  primary: path.resolve(REPO_ROOT, 'e2e', 'new_folder', 'assets', 'sample.png'),
  replacement: path.resolve(REPO_ROOT, 'e2e', 'new_folder', 'assets', 'sample2.png'),
  unsupported: path.resolve(REPO_ROOT, 'e2e', 'new_folder', 'assets', 'unsupported.txt'),
};

function uniqueDigits(prefixDigit: string, seed: number): string {
  const n = (Date.now() + seed * 97) % 1_000_000_000;
  return prefixDigit + n.toString().padStart(9, '0');
}

/** Timestamp-driven, never reused between Combined Jobs or across runs - same uniqueness convention as `uniqueDigits` above, just a shorter 6-digit suffix to match this field's real "LBR-000001"-style format. */
export function generateLinerBookingNo(seed: number): string {
  const n = (Date.now() + seed * 13) % 1_000_000;
  return `LBR-${String(n).padStart(6, '0')}`;
}

/** Timestamp-driven, never reused between Combined Jobs or across runs - same uniqueness convention as `uniqueDigits` above. */
export function generateDocumentReferenceNumber(seed: number): string {
  const n = (Date.now() + seed * 17) % 1_000_000;
  return `DOC-${String(n).padStart(6, '0')}`;
}

export interface CombinedJobCargoEntry {
  cargoName: string;
  hsnCode: string;
  commodity: string;
}

/**
 * One unique Cargo Name/HSN Code/Commodity set for a Combined Job "Add Cargo" entry - `index`
 * drives uniqueness within a single Combined Job's own 10-cargo batch. Confirmed live: "Cargo
 * Name" is a plain free-text field (its `list="datalist-cargo_name"` attribute is an empty,
 * dynamically-populated autocomplete hint, not a fixed set of real options to pick from), same
 * convention as Commodity - not a constrained dropdown.
 */
export function generateCombinedJobCargoEntry(seed: number, index: number): CombinedJobCargoEntry {
  const n = (Date.now() + (seed + index) * 31) % 100_000_000;
  return {
    cargoName: `QA Automation Cargo ${seed}-${index}`,
    hsnCode: String(n).padStart(8, '0'),
    commodity: `QA Automation Commodity ${seed}-${index}`,
  };
}

function generatePan(seed: number): string {
  // PAN field enforces exactly 10 characters (minlength = maxlength = 10 on the live form) and
  // is unique per customer/vendor ("A customer with this PAN number already exists." - confirmed
  // on the live app). The original 4-digit scheme (1 part in 10,000) collided in practice after
  // enough repeated runs accumulated against this shared, persistent staging database - widened
  // to 7 digits (1 part in 10,000,000) so a real collision is no longer realistically reachable.
  const digits = (Date.now() * 1000 + seed) % 10_000_000;
  return `QA${String(digits).padStart(7, '0')}X`;
}

export interface CustomerData {
  customerName: string;
  customerType: 'Domestic' | 'Foreign';
  subType: 'Regular' | 'SEZ';
  gstApplicable: 'Yes' | 'No';
  address1: string;
  address2?: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  pan: string;
}

export interface CustomerContact {
  firstName: string;
  lastName: string;
  designation: string;
  phone: string;
  email: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountType: string;
  ifsc: string;
  branchName: string;
}

export interface GstDetails {
  state: string;
  gstNo: string;
  branchName: string;
  branchAddress: string;
  pincode: string;
}

/** Generates a unique Customer record for bulk/data-driven creation. Iteration index drives uniqueness. */
export function generateCustomerData(seed: number): CustomerData {
  return {
    customerName: `QA Automation Customer ${seed}-${Date.now().toString().slice(-5)}`,
    customerType: 'Domestic',
    subType: 'Regular',
    gstApplicable: 'Yes',
    address1: `${100 + seed} South Street`,
    address2: `Block ${seed}`,
    city: 'Tirunelveli',
    state: 'Tamil Nadu',
    phone: uniqueDigits('9', seed),
    email: `qa.customer.${seed}.${Date.now()}@example.com`,
    pan: generatePan(seed),
  };
}

export function generateCustomerContact(seed: number): CustomerContact {
  return {
    firstName: `Contact${seed}`,
    lastName: 'Automation',
    designation: 'Manager',
    phone: uniqueDigits('7', seed),
    email: `qa.contact.${seed}.${Date.now()}@example.com`,
  };
}

export function generateBankDetails(seed: number): BankDetails {
  return {
    bankName: 'IOB',
    accountNumber: `${9000000000 + seed}`,
    accountType: 'Savings Account',
    ifsc: `IFSC0${String(seed).padStart(4, '0')}`,
    branchName: 'Mumbai',
  };
}

export function generateGstDetails(seed: number): GstDetails {
  return {
    state: 'Tamil Nadu',
    gstNo: `33GSTAUTO${seed}Z`,
    branchName: 'Mumbai',
    branchAddress: 'Mumbai HQ',
    pincode: '600001',
  };
}

export interface VendorData {
  vendorName: string;
  vendorType: 'Domestic' | 'Foreign';
  categoryType: 'Liner' | 'CFS' | 'Transport' | 'Others';
  subType: 'Regular' | 'SEZ';
  address1: string;
  address2?: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  pan: string;
}

/** Generates a unique Vendor record for bulk/data-driven creation. Iteration index drives uniqueness. */
export function generateVendorData(seed: number): VendorData {
  return {
    vendorName: `QA Automation Vendor ${seed}-${Date.now().toString().slice(-5)}`,
    vendorType: 'Domestic',
    categoryType: 'Transport',
    subType: 'Regular',
    address1: `${200 + seed} North Bypass`,
    address2: `Block ${seed}`,
    city: 'Madurai',
    state: 'Tamil Nadu',
    phone: uniqueDigits('8', seed),
    email: `qa.vendor.${seed}.${Date.now()}@example.com`,
    pan: generatePan(seed + 5000),
  };
}

export interface CargoItemData {
  noOfPackages: string;
  cargoName: string;
  grossWt: string;
  netWt: string;
  uom: string;
  commodity: string;
  kindOfPackages: string;
  dgNonDg: 'DG' | 'Non DG';
  /**
   * Confirmed live: the Cargo popup's field set is driven by Shipment Mode, not Direction as
   * first assumed - Air renders a single "Volume In MT" field instead of any container fields;
   * every other mode (Sea/Road/Rail) renders No of Containers/Size Of Container/Type Of
   * Container/CBM instead. Set exactly one side for a given EnquiryData.shipmentMode:
   * `volumeInMt` for Air, the four container fields otherwise.
   */
  volumeInMt?: string;
  noOfContainers?: string;
  containerSize?: '20' | '40' | '45';
  containerType?: 'FR' | 'GP' | 'OT' | 'RF' | 'TK';
  cbm?: string;
  /**
   * Confirmed live: selecting DG on DG/Non-DG reveals 5 additional plain-text fields (IMO No, IM
   * DG No, IMO Class, UN No, Technical Name) - absent entirely for Non DG. Only meaningful when
   * `dgNonDg === 'DG'`.
   */
  imoNo?: string;
  imDgNo?: string;
  imoClass?: string;
  unNo?: string;
  technicalName?: string;
}

export interface EnquiryData {
  sourceOfEnquiry: string;
  shipmentMode: 'Air' | 'Sea';
  shipmentDirection: 'Export' | 'Import' | 'CROSS TRADE';
  businessType: 'Generated' | 'Nominated';
  destinationClearanceBy: 'AMAZERTRANS' | 'Vendor' | 'Customer';
  destinationClearanceLocation: string;
  /** Confirmed live: required for Sea (at least) - "Shipment Type is required." - unlike Air, where it's optional. */
  shipmentType?: 'FCL' | 'LCL' | 'Bulk';
  cargo: CargoItemData;
}

export type EnquiryServiceCombination = 'FF_CB' | 'CB_TMS' | 'FF_TMS' | 'FF_CB_TMS';

export interface EnquiryServiceSelection {
  freightForwarding: boolean;
  customsBroker: boolean;
  transportManagementSystem: boolean;
}

export interface EnquiryScenario {
  name: string;
  combination: EnquiryServiceCombination;
  services: EnquiryServiceSelection;
  shipmentDirection: 'Export' | 'Import' | 'CROSS TRADE';
  shipmentMode: 'Air' | 'Sea';
}

/**
 * The exactly-4 required Service combinations for Enquiry - no single-service Enquiry and no
 * other combination is created anywhere in this spec. Air and Sea are the only Shipment Modes
 * exercised (Road/Rail are out of scope). Each combination also gets its own Shipment
 * Direction/Mode pairing so every scenario exercises genuinely different data, not just a
 * different service list.
 */
export const ENQUIRY_SCENARIOS: EnquiryScenario[] = [
  {
    name: 'FF + CB',
    combination: 'FF_CB',
    services: { freightForwarding: true, customsBroker: true, transportManagementSystem: false },
    shipmentDirection: 'Export',
    shipmentMode: 'Sea',
  },
  {
    name: 'CB + TMS',
    combination: 'CB_TMS',
    services: { freightForwarding: false, customsBroker: true, transportManagementSystem: true },
    shipmentDirection: 'Import',
    shipmentMode: 'Air',
  },
  {
    name: 'FF + TMS',
    combination: 'FF_TMS',
    services: { freightForwarding: true, customsBroker: false, transportManagementSystem: true },
    shipmentDirection: 'Export',
    shipmentMode: 'Air',
  },
  {
    name: 'FF + CB + TMS',
    combination: 'FF_CB_TMS',
    services: { freightForwarding: true, customsBroker: true, transportManagementSystem: true },
    shipmentDirection: 'Import',
    shipmentMode: 'Sea',
  },
];

/**
 * Generates a unique Enquiry for one `EnquiryScenario` - the combination-driven counterpart to
 * `generateEnquiryData`. Confirmed live: Shipment Type is required for every mode except Air, and
 * Cargo's field set is driven by Shipment Mode alone (Air -> Volume In MT, Sea -> container
 * fields + CBM) - the same real rules already confirmed for the plain generator below.
 */
export function generateEnquiryScenarioData(seed: number, scenario: Pick<EnquiryScenario, 'shipmentDirection' | 'shipmentMode'>): EnquiryData {
  const isAir = scenario.shipmentMode === 'Air';
  return {
    sourceOfEnquiry: 'Mail',
    shipmentMode: scenario.shipmentMode,
    shipmentDirection: scenario.shipmentDirection,
    businessType: 'Generated',
    destinationClearanceBy: 'AMAZERTRANS',
    destinationClearanceLocation: `Chennai Port ${seed}`,
    shipmentType: isAir ? undefined : 'FCL',
    cargo: {
      noOfPackages: '10',
      cargoName: `QA Automation Cargo ${seed}`,
      grossWt: '100',
      netWt: '90',
      uom: 'KGS',
      commodity: 'General Cargo',
      kindOfPackages: 'Boxes',
      dgNonDg: 'Non DG',
      ...(isAir
        ? { volumeInMt: '2.5' }
        : { noOfContainers: '1', containerSize: '20' as const, containerType: 'GP' as const, cbm: '10' }),
    },
  };
}

export interface TransportGoodsLegData {
  location: string;
  address: string;
  date: string;
}

/**
 * Generates the Pickup and Delivery leg data for Transport Management System's auto-seeded
 * Transport-Goods rows (see EnquiryPage.fillTransportGoodsRows). `date` is in the native
 * YYYY-MM-DD format the Est Date input requires. Confirmed live: "Transport Goods Pickup" and
 * "Transport Goods Delivery" are checked by default whenever TMS is selected, for every Shipment
 * Mode - so this data is always needed when TMS is enabled, regardless of mode.
 */
export function generateTransportGoodsData(seed: number): { pickup: TransportGoodsLegData; delivery: TransportGoodsLegData } {
  return {
    pickup: {
      location: `Chennai Warehouse ${seed}`,
      address: `Plot ${seed}, Industrial Estate, Chennai`,
      date: '2026-09-20',
    },
    delivery: {
      location: `Mumbai Port ${seed}`,
      address: `Dock ${seed}, Mumbai Port Trust`,
      date: '2026-09-22',
    },
  };
}

export interface TransportContainerPickupData {
  location: string;
  address: string;
  stuffing: 'Factory' | 'CFS' | 'ICD' | 'SEZ';
  stuffingLocation: string;
  date: string;
}

export interface TransportContainerDeliveryData {
  location: string;
  address: string;
  date: string;
}

/**
 * Generates the Pickup and Delivery leg data for Transport Management System's auto-seeded
 * Transport-Container rows (see EnquiryPage.fillTransportContainerRows). Confirmed live:
 * "Transport Container Pickup"/"Transport Container Delivery" are checked by default only for
 * Sea/Road/Rail (never Air) - the same real Shipment-Mode-driven rule already confirmed for
 * Cargo's own container fields, so this is only needed when `shipmentMode !== 'Air'`.
 */
export function generateTransportContainerData(seed: number): { pickup: TransportContainerPickupData; delivery: TransportContainerDeliveryData } {
  return {
    pickup: {
      location: `Chennai Factory ${seed}`,
      address: `Plot ${seed}, SIPCOT, Chennai`,
      stuffing: 'Factory',
      stuffingLocation: `Chennai CFS Yard ${seed}`,
      date: '2026-09-21',
    },
    delivery: {
      location: `Mumbai Port Terminal ${seed}`,
      address: `Berth ${seed}, JNPT, Mumbai`,
      date: '2026-09-23',
    },
  };
}

/**
 * Generates a unique Enquiry (Freight-Forwarding service only - the one scope automated so far;
 * Customs Broker/Transport Management System have their own distinct required-field sets,
 * confirmed live but not yet automated). No uniqueness constraint was found on any of these
 * fields on the live app, so the seed is only used for traceability, not collision avoidance.
 */
export function generateEnquiryData(seed: number): EnquiryData {
  return {
    sourceOfEnquiry: 'Mail',
    shipmentMode: 'Air',
    shipmentDirection: 'Export',
    businessType: 'Generated',
    destinationClearanceBy: 'AMAZERTRANS',
    destinationClearanceLocation: `Chennai Port ${seed}`,
    cargo: {
      noOfPackages: '10',
      cargoName: `QA Automation Cargo ${seed}`,
      grossWt: '100',
      netWt: '90',
      uom: 'KGS',
      commodity: 'General Cargo',
      kindOfPackages: 'Boxes',
      dgNonDg: 'Non DG',
      // Confirmed live: Shipment Mode 'Air' renders "Volume In MT" instead of any container field.
      volumeInMt: '2.5',
    },
  };
}

export interface QuotationChargeData {
  chargeDescription: string;
  quantity: string;
  buyRate: string;
  buyCurrency: string;
}

/**
 * Charge Description options confirmed live (via the real master list rendered in the Add
 * Origin/International/Destination popup) to be tagged "(CB,FF,TMS)" - i.e. valid regardless of
 * which of the 4 required Service combinations (FF+CB, CB+TMS, FF+TMS, FF+CB+TMS) the Quotation's
 * originating Enquiry used. Six distinct entries, one more than the default 5-per-section count,
 * so `generateBuyRateEntries` never has to repeat a Charge Description within one section.
 */
const SAFE_CHARGE_DESCRIPTIONS = [
  'Base Charge - Direct Expenses (CB,FF,TMS)',
  'BL FEE - Direct Expenses (CB,FF,TMS)',
  'Container Freight Security Surcharge - Direct Expenses (CB,FF,TMS)',
  'Customs Clearance & Documentation Fee - Direct Expenses (CB,TMS,FF)',
  'branchwise2 - Direct Expenses (CRM,CB,FF,TMS,WMS,Finance Accounts,Others)',
  'branchwise charge - Direct Expenses (CRM,CB,FF,TMS,Finance Accounts,WMS,Others)',
];

/**
 * Generates `count` distinct Buy Rate charge rows for one Quotation section (Origin/International/
 * Destination). Confirmed live: selecting `chargeDescription` auto-fills HS Code and Charge Based
 * On, and Value In INR = Buy Rate x Quantity x Exchange Rate (Exchange Rate itself auto-filled once
 * `buyCurrency` is chosen) - none of those three are set here, only the fields the popup actually
 * requires input for. Every entry deliberately shares one `buyCurrency` (defaults to the confirmed
 * real option "Pound") so the Summary tab's per-currency aggregation collapses to a single, exactly
 * verifiable total instead of needing to track several currencies/exchange rates at once.
 * `startIndex` (default 0) offsets which `SAFE_CHARGE_DESCRIPTIONS` entries are used - Pricing's
 * own extra Buy entry (added on top of the 5 Quotation already created per section) passes 5 here
 * so it never repeats one of those 5 Charge Descriptions.
 */
export function generateBuyRateEntries(seed: number, count: number, buyCurrency: string = 'Pound', startIndex: number = 0): QuotationChargeData[] {
  return Array.from({ length: count }, (_, i) => ({
    chargeDescription: SAFE_CHARGE_DESCRIPTIONS[(startIndex + i) % SAFE_CHARGE_DESCRIPTIONS.length],
    quantity: String(2 + ((seed + i) % 5)),
    buyRate: String(50 + seed + i * 7),
    buyCurrency,
  }));
}

/**
 * Configurable Quotation "Upload File" assets - QUOTATION_UPLOAD_FILES in .env accepts a
 * comma-separated list of 2-3 filenames (resolved against the existing e2e/new_folder/assets
 * directory, same as ENQUIRY_UPLOAD_FILES) or absolute paths, with no test-code change required.
 * Defaults to the two existing real sample assets when unset.
 */
export const QUOTATION_UPLOAD_ENABLED = env.quotationUploadEnabled;
export const QUOTATION_UPLOAD_FILES: string[] = (
  env.quotationUploadFiles
    ? env.quotationUploadFiles.split(',').map((f) => f.trim()).filter((f) => f.length > 0)
    : ['sample.png', 'sample2.png']
).map((f) => (path.isAbsolute(f) ? f : path.resolve(REPO_ROOT, 'e2e', 'new_folder', 'assets', f)));

/**
 * How many entries the Quotation test creates per section via the real Add Origin/International/
 * Destination popup - QUOTATION_ORIGIN_COUNT/QUOTATION_INTERNATIONAL_COUNT/QUOTATION_DESTINATION_COUNT
 * in .env, defaulting to 5 each.
 */
export const QUOTATION_ORIGIN_COUNT = env.quotationOriginCount;
export const QUOTATION_INTERNATIONAL_COUNT = env.quotationInternationalCount;
export const QUOTATION_DESTINATION_COUNT = env.quotationDestinationCount;

export interface QuotationData {
  origin: QuotationChargeData[];
  international: QuotationChargeData[];
  destination: QuotationChargeData[];
  uploadFiles: string[];
}

/**
 * Generates the complete Buy Rate data set for one Quotation - Origin/International/Destination
 * entries (counts configurable via .env, default 5 each) plus the configured upload files. Distinct
 * offsets per section (seed/seed+1000/seed+2000) keep Origin, International and Destination from
 * ever generating identical rows for the same base seed.
 */
export function generateQuotationData(seed: number): QuotationData {
  return {
    origin: generateBuyRateEntries(seed, QUOTATION_ORIGIN_COUNT),
    international: generateBuyRateEntries(seed + 1000, QUOTATION_INTERNATIONAL_COUNT),
    destination: generateBuyRateEntries(seed + 2000, QUOTATION_DESTINATION_COUNT),
    uploadFiles: QUOTATION_UPLOAD_FILES,
  };
}

/**
 * Configurable Contract/Sub Contract "Upload File" assets - CONTRACT_UPLOAD_FILES in .env, same
 * comma-separated-list convention as QUOTATION_UPLOAD_FILES above. Used by BOTH the Subcontract's
 * top-level Upload File tab and Contract Price's own nested one (confirmed live: two genuinely
 * separate upload sections on the same form, not a naming variant of one).
 */
export const CONTRACT_UPLOAD_ENABLED = env.contractUploadEnabled;
export const CONTRACT_UPLOAD_FILES: string[] = (
  env.contractUploadFiles
    ? env.contractUploadFiles.split(',').map((f) => f.trim()).filter((f) => f.length > 0)
    : ['sample.png', 'sample2.png']
).map((f) => (path.isAbsolute(f) ? f : path.resolve(REPO_ROOT, 'e2e', 'new_folder', 'assets', f)));

/** One unique Contract - only the Customer Name is needed, Contract ID/Date/Status are all app-generated or default to "Active". */
export interface ContractData {
  customerName: string;
}
export function generateContractData(customerName: string): ContractData {
  return { customerName };
}

export interface SubcontractData {
  startDate: string;
  endDate: string;
}

/** Start Date = today, End Date = +1 year - a realistic, always-valid Active contract period. `seed` only offsets the day slightly so back-to-back generated Subcontracts don't share the exact same dates. */
export function generateSubcontractData(seed: number): SubcontractData {
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date();
  start.setDate(start.getDate() + (seed % 3));
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return { startDate: toIso(start), endDate: toIso(end) };
}

/**
 * CB (Customs Broker) Create Job unique identifiers - `MAWB-{seq}` / `HAWB-{seq}` / `CB-INV-{seq}`,
 * same timestamp+seed uniqueness convention as `generateLinerBookingNo`/`generateDocumentReferenceNumber`
 * above (never reused between CB Jobs or across runs).
 */
export function generateMawbNumber(seed: number): string {
  const n = (Date.now() + seed * 41) % 1_000_000;
  return `MAWB-${String(n).padStart(6, '0')}`;
}
export function generateHawbNumber(seed: number): string {
  const n = (Date.now() + seed * 43) % 1_000_000;
  return `HAWB-${String(n).padStart(6, '0')}`;
}
export function generateCbInvoiceNumber(seed: number): string {
  const n = (Date.now() + seed * 47) % 1_000_000;
  return `CB-INV-${String(n).padStart(6, '0')}`;
}

/** A real HS Code value used to enrich the source Combined Job's own Cargo record before CB copies it (the Enquiry-carried-over Cargo row has no HS Code of its own - confirmed live it shows "--" until edited). */
export function generateCbHsnCode(seed: number): string {
  const n = (Date.now() + seed * 53) % 100_000_000;
  return String(n).padStart(8, '0');
}

export interface CBContainerSealTestEntry {
  customsSealNo: string;
  shipperSealNo: string;
  linerSealNo: string;
}

/** Optional Customs/Shipper/Liner seal numbers for CB Job's own "Add Container" popup - `index` keeps them unique per container within the same job. */
export function generateCBContainerSeals(seed: number, index: number): CBContainerSealTestEntry {
  return {
    customsSealNo: `CS-${seed}-${index}`,
    shipperSealNo: `SS-${seed}-${index}`,
    linerSealNo: `LS-${seed}-${index}`,
  };
}

export interface CBShippingBillTestData {
  portOfFinalDestination: string;
  consigneeName: string;
  cinNo: string;
  cinSiteId: string;
  leoNo: string;
}

/**
 * The fields genuinely empty on CB's own "Create Shipping Bill" (Initiate SB) form - confirmed live
 * that SB No./SB Date/PKG/Gross Wt/Net Weight/Port of Loading/Port of Discharge/Exporter Name/
 * Invoice No all arrive already pre-filled, carried over from the CB Job itself, so this generator
 * only covers what actually needs filling.
 */
export function generateCBShippingBillData(seed: number): CBShippingBillTestData {
  return {
    portOfFinalDestination: 'Chennai SEA',
    consigneeName: `QA Automation Consignee ${seed}`,
    cinNo: `CIN-${seed}`,
    cinSiteId: `SITE-${seed}`,
    leoNo: `LEO-${seed}`,
  };
}

export interface CBStuffingTestData {
  combinedJobNo: string;
  referenceNo: string;
  productType: string;
}

/** Booking Reference tab fields genuinely empty on CB's own "Stuffing-Create" form - Job No/Mode/Shipper/Consignee all arrive pre-filled, carried over from the Shipping Bill itself. `combinedJobNo` is filled in explicitly for traceability even though the app leaves it blank by default. */
export function generateCBStuffingData(seed: number, combinedJobNo: string): CBStuffingTestData {
  return {
    combinedJobNo,
    referenceNo: `REF-${seed}`,
    productType: 'FCL',
  };
}

/**
 * Margin % applied to every applicable Sell Rate row on the Pricing screen - PRICING_MARGIN_PERCENT
 * in .env, defaulting to "10". Confirmed live: Sell Rate = Buy Rate x (1 + Margin/100), recalculated
 * live by the app the moment the Margin % cell is edited.
 */
export const PRICING_MARGIN_PERCENT = env.pricingMarginPercent;

/**
 * Confirmed live in the Charge Description master list: a "Direct Incomes" counterpart to the Buy
 * side's "Direct Expenses" entries exists for use on Sell-only rows (added via Pricing's own
 * "+Add <Section> Charge" button, which has no Buy-side counterpart and therefore no Margin %).
 */
export const PRICING_SELL_ONLY_CHARGE_DESCRIPTION = 'Base Charge - Direct Incomes (CB,FF,TMS)';

/**
 * One extra Buy-side entry for Pricing's own "+Add <Section>" button - confirmed live this mirrors
 * automatically into a new Sell Rate row too. `startIndex: 5` (the 6th and last of
 * SAFE_CHARGE_DESCRIPTIONS) guarantees this never repeats one of the 5 Charge Descriptions the
 * Quotation phase already used in that same section.
 */
export function generatePricingExtraBuyEntry(seed: number): QuotationChargeData {
  return generateBuyRateEntries(seed, 1, 'Pound', 5)[0];
}

/**
 * One Sell-only entry for Pricing's own "+Add <Section> Charge" button - confirmed live this does
 * NOT create a Buy-side counterpart (and so never gets a Margin % - "-" is shown instead).
 */
export function generatePricingExtraSellEntry(seed: number): QuotationChargeData {
  return {
    chargeDescription: PRICING_SELL_ONLY_CHARGE_DESCRIPTION,
    quantity: String(2 + (seed % 5)),
    buyRate: String(40 + seed),
    buyCurrency: 'Pound',
  };
}

export interface DraftInvoiceGeneralInfoData {
  noOfInvoiceCopies: string;
  consigneeAddress1: string;
  consigneeAddress2: string;
  consigneeAddress3: string;
}

export function generateDraftInvoiceGeneralInfo(seed: number): DraftInvoiceGeneralInfoData {
  return {
    noOfInvoiceCopies: '3',
    consigneeAddress1: `QA Consignee Address Line 1 - ${seed}`,
    consigneeAddress2: `QA Consignee Address Line 2 - ${seed}`,
    consigneeAddress3: `QA Consignee Address Line 3 - ${seed}`,
  };
}

export interface DraftInvoiceItemData {
  description: string;
  qty: string;
  rate: string;
  currency: string;
}

/**
 * Confirmed live via the real "+Add New" Invoice Item popup on the Draft Invoice - Edit screen
 * (a full dump of its own Description option list, 44 real entries): this popup's own master list
 * uses a DIFFERENT real format from Pricing's own Charge Description list (no space around the
 * dash, and tagged plain "(CB)" rather than "(CB,FF,TMS)") - e.g. "Base Charge-Direct Incomes
 * (CB)", not "Base Charge - Direct Incomes (CB,FF,TMS)". `PRICING_SELL_ONLY_CHARGE_DESCRIPTION`
 * (Pricing's own format) does not exist in this list and was root-caused live as the reason the
 * dropdown search found zero matches.
 *
 * Also confirmed live via a real rejection ("This Charge description has already been added in the
 * table."): the popup enforces a real uniqueness rule against the Draft Invoice's own already-
 * populated table, which arrives pre-filled with one row per real Buy/Sell charge from upstream
 * Quotation/Pricing - i.e. `SAFE_CHARGE_DESCRIPTIONS`' own 6 bases (Base Charge/BL FEE/Container
 * Freight Security Surcharge/Customs Clearance & Documentation Fee/branchwise2/branchwise charge),
 * mirrored here under the "Direct Incomes" tag. The two entries below are deliberately chosen OUTSIDE
 * that set of 6 (confirmed present in the same live 44-entry dump) so they never collide with the
 * pre-populated table regardless of which of the 6 bases a given seed's own upstream Quotation used.
 */
const DRAFT_INVOICE_ITEM_DESCRIPTIONS = ['Documentation Charges-Direct Incomes (CB)', 'Seal Charges-Direct Incomes (CB)'];

/**
 * Two distinct extra Invoice Items added on top of the Draft Invoice's own already-populated
 * table (confirmed live: it arrives pre-filled from the upstream Quotation/Pricing Buy/Sell
 * charges) - kept as two genuinely separate rows (different Description/Qty/Rate), never merged
 * into one, per the real task requirement. Currency reuses "Pound" - the one Currency value
 * already confirmed live and used throughout this entire suite's own Buy/Sell rate entries
 * (`generateBuyRateEntries` etc.) - rather than guessing at a second, unconfirmed option.
 */
export function generateDraftInvoiceItems(seed: number): [DraftInvoiceItemData, DraftInvoiceItemData] {
  return [
    {
      description: DRAFT_INVOICE_ITEM_DESCRIPTIONS[0],
      qty: String(1 + (seed % 3)),
      rate: String(100 + seed),
      currency: 'Pound',
    },
    {
      description: DRAFT_INVOICE_ITEM_DESCRIPTIONS[1],
      qty: String(2 + (seed % 4)),
      rate: String(200 + seed),
      currency: 'Pound',
    },
  ];
}

export interface VendorBillLineItemData {
  description: string;
  qty: string;
  rate: string;
  currency: string;
}

/**
/** FF Export Sea Vendor Bill number - distinct from CB's own `TEST-VB-<seed>` (same run, same seed) so the two can never collide. */
export function generateFFVendorBillNo(seed: number): string {
  return `FF-VB-${seed}`;
}

 * Confirmed live via the real "+Add New" line-item popup on the Vendor Bill Create/Edit form (a
 * full dump of its own Description option list, 36 real entries): this popup's own master list
 * uses a THIRD distinct real format from both Draft Invoice's ("<Charge>-Direct Incomes (CB)") and
 * Pricing's ("<Charge> - Direct Expenses (CB,FF,TMS)") - e.g. "Additional Charges-Indirect
 * Expenses-CB", "Amendment Charge-Direct Expenses-CB". Two confirmed-real entries below.
 */
const VENDOR_BILL_ITEM_DESCRIPTIONS = ['Amendment Charge-Direct Expenses-CB', 'Auditor Fee-Indirect Expenses-CB'];

export function generateVendorBillNo(seed: number): string {
  return `TEST-VB-${seed}`;
}

/**
 * One line item for the Vendor Bill Create flow (the real task only requires one). Currency reuses
 * "Pound" - the one Currency value already confirmed live throughout this suite. `HS Code`/`Charge
 * Based On`/`Exchange Rate`/etc are deliberately not generated here - confirmed live the popup
 * either auto-fills them (Charge Based On) or leaves them genuinely blank (HS Code, unlike Draft
 * Invoice's own popup) once Description is selected.
 */
export function generateVendorBillLineItem(seed: number): VendorBillLineItemData {
  return {
    description: VENDOR_BILL_ITEM_DESCRIPTIONS[seed % VENDOR_BILL_ITEM_DESCRIPTIONS.length],
    qty: String(1 + (seed % 3)),
    rate: String(100 + seed),
    currency: 'Pound',
  };
}

export interface FFTransportPlanData {
  from: string;
  to: string;
  transhipmentPort: string;
  mode: string;
  vesselName: string;
  voyageNo: string;
  etd: string;
  eta: string;
}

/**
 * Confirmed live via the real "From"/"To" searchable dropdown on the CRO Edit -> Intended
 * Transport Plan "+Add New" popup (a full dump of its own option list, 41 real entries, of which
 * 15 were captured): this is the same real location master list used elsewhere on this form
 * (Source/Destination also draw from it). 8 distinct confirmed-real entries below, enough to cycle
 * through 10 generated records without ever pairing a location with itself.
 */
const FF_TRANSPORT_LOCATIONS = [
  'Adalaj',
  'ADANI',
  'Agra ICD',
  'Bangalore',
  'Bangalore Air Cargo',
  'Bombay SEA',
  'Chennai Air',
  'Colombo',
];

/**
 * 10 distinct Intended Transport Plan records for the CRO Edit flow - confirmed live via a real
 * end-to-end Add attempt that "Mode" is a plain fillable textbox (not a picklist, despite the app
 * enforcing "Sea"/"Air" elsewhere) and ETD/ETA are native `type=date` inputs (`YYYY-MM-DD`).
 * `seed` offsets which `FF_TRANSPORT_LOCATIONS` pair is used per record so From/To are never the
 * same real location within one record.
 */
export function generateFFTransportPlans(seed: number): FFTransportPlanData[] {
  return Array.from({ length: 10 }, (_, i) => {
    const fromIndex = (seed + i) % FF_TRANSPORT_LOCATIONS.length;
    const toIndex = (seed + i + 1) % FF_TRANSPORT_LOCATIONS.length;
    return {
      from: FF_TRANSPORT_LOCATIONS[fromIndex],
      to: FF_TRANSPORT_LOCATIONS[toIndex],
      transhipmentPort: 'Singapore',
      mode: 'Sea',
      vesselName: `QA Test Vessel ${i + 1}`,
      // Zero-padded suffix - confirmed live an unpadded "-1" is a real substring of "-10",
      // causing a genuine false-positive row match in code that looks up a record by its own
      // Voyage No (e.g. a retry's "did this already register" check).
      voyageNo: `VOY-${seed}-${String(i + 1).padStart(2, '0')}`,
      etd: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      eta: `2026-10-${String(2 + (i % 27)).padStart(2, '0')}`,
    };
  });
}

export interface FFStuffingBookingReferenceData {
  mblNo: string;
  hblNo: string;
}

export function generateFFStuffingBookingReference(seed: number): FFStuffingBookingReferenceData {
  return {
    mblNo: `MBL-${seed}`,
    hblNo: `HBL-${seed}`,
  };
}

export interface FFStuffingScheduleData {
  carrier: string;
  scac: string;
  haulage: string;
  originOffice: string;
  carrierBkg: string;
}

export function generateFFStuffingSchedule(seed: number): FFStuffingScheduleData {
  return {
    carrier: `QA Carrier ${seed}`,
    scac: `SC${seed % 1000}`,
    haulage: 'Merchant Haulage',
    originOffice: 'Chennai Office',
    carrierBkg: `CBKG-${seed}`,
  };
}

export interface FFStuffingVesselData {
  vessel: string;
  voyageMode: string;
  voyageNo: string;
  from: string;
  to: string;
  siCutOff: string;
  vgmCutOff: string;
  gateIn: string;
  amsCutOff: string;
  imoNo: string;
  etd: string;
  eta: string;
}

/**
 * 5 distinct Vessel Information records for the FF Stuffing Edit flow - confirmed live via a real
 * end-to-end popup fill that From/To are real `role=combobox` pickers over the SAME real location
 * master list already confirmed for CRO's own Intended Transport Plan, while SI Cut Off/VGM Cut
 * Off/Gate In/AMS Cut Off/ETD/ETA are all native `type=date` inputs. `voyageMode` is a genuinely
 * DIFFERENT concept from CB/CRO's own "Mode" ("Sea"/"Air") - confirmed live its own real, only two
 * options are "Direct"/"Transhipment" (a real attempt with "Sea" found zero matches).
 */
export function generateFFStuffingVessels(seed: number, count = 5): FFStuffingVesselData[] {
  return Array.from({ length: count }, (_, i) => {
    const fromIndex = (seed + i + 2) % FF_TRANSPORT_LOCATIONS.length;
    const toIndex = (seed + i + 3) % FF_TRANSPORT_LOCATIONS.length;
    return {
      vessel: `QA Stuffing Vessel ${i + 1}`,
      voyageMode: i % 2 === 0 ? 'Direct' : 'Transhipment',
      // Zero-padded suffix (same real substring-collision fix as generateFFTransportPlans, e.g.
      // "-1" is a substring of "-10") so a Voyage No lookup can never falsely match a different record.
      voyageNo: `SVOY-${seed}-${String(i + 1).padStart(2, '0')}`,
      from: FF_TRANSPORT_LOCATIONS[fromIndex],
      to: FF_TRANSPORT_LOCATIONS[toIndex],
      siCutOff: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      vgmCutOff: `2026-10-${String(2 + (i % 27)).padStart(2, '0')}`,
      gateIn: `2026-10-${String(3 + (i % 26)).padStart(2, '0')}`,
      amsCutOff: `2026-10-${String(4 + (i % 25)).padStart(2, '0')}`,
      // Confirmed live: "IMO No" silently strips non-digit characters (an "IMO" prefix never
      // sticks, even via real keystrokes, not just `.fill()`) - kept purely numeric so the
      // expected and actual values always match.
      imoNo: `${seed}${i}`,
      etd: `2026-10-${String(5 + (i % 24)).padStart(2, '0')}`,
      eta: `2026-10-${String(6 + (i % 23)).padStart(2, '0')}`,
    };
  });
}

export interface FFStuffingPackageData {
  noOfPkgs: string;
  grossWeight: string;
  netWeight: string;
  uom: string;
}

/** `grossWeight` is made unique per record (a distinct 3-digit-derived value) so each row can be reliably targeted later for Edit/Delete without a natural unique key. */
export function generateFFStuffingPackages(seed: number, count = 5): FFStuffingPackageData[] {
  return Array.from({ length: count }, (_, i) => ({
    noOfPkgs: String(5 + i),
    grossWeight: String(500 + seed % 100 + i),
    netWeight: String(450 + seed % 100 + i),
    uom: 'KGS',
  }));
}

export interface FFStuffingContainerData {
  containerNo: string;
  size: string;
  type: string;
  customsSeal: string;
  shipperSeal: string;
  linerSeal: string;
}

/** A single new Container record (confirmed live the real task only Adds/Edits/Deletes ONE, sequentially, unlike Vessel/Package/Cargo). A fresh, valid-format (4 letters + 7 digits) container number distinct from the source Combined Job's own real containers. */
export function generateFFStuffingContainer(seed: number): FFStuffingContainerData {
  return {
    containerNo: `TSTU${String(1000000 + (seed % 900000)).padStart(7, '0')}`,
    size: '20',
    type: 'GP',
    customsSeal: `CS-STUFF-${seed}`,
    shipperSeal: `SS-STUFF-${seed}`,
    linerSeal: `LS-STUFF-${seed}`,
  };
}

export interface FFStuffingCargoData {
  cargoName: string;
  hsCode: string;
  commodity: string;
}

/** `cargoName` is unique per record (confirmed live this field is free text, not a master-list picker) so each row can be reliably targeted for Edit/Delete - zero-padded so no suffix is ever a substring of another (e.g. "-1" of "-10"). */
export function generateFFStuffingCargos(seed: number, count = 5): FFStuffingCargoData[] {
  return Array.from({ length: count }, (_, i) => ({
    cargoName: `QA Stuffing Cargo ${seed}-${String(i + 1).padStart(2, '0')}`,
    hsCode: `HS${seed}${i}`,
    commodity: 'General Cargo',
  }));
}

export interface FFStuffingHblGroupData {
  sbNo: string;
  sbDate: string;
  hblGrouping: string;
  hblBkgForm: string;
  noOfPackages: string;
  kindOfPkgs: string;
  grossWeight: string;
  netWeight: string;
  cbm: string;
}

/** `sbNo` is unique per record so each row can be reliably targeted for Edit/Delete (POL/POD are real comboboxes pre-filled from the source Combined Job and are left as-is, not overridden) - zero-padded so no suffix is ever a substring of another (e.g. "-1" of "-10"). */
export function generateFFStuffingHblGroups(seed: number, count = 5): FFStuffingHblGroupData[] {
  return Array.from({ length: count }, (_, i) => ({
    sbNo: `HBLSB-${seed}-${String(i + 1).padStart(2, '0')}`,
    sbDate: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
    hblGrouping: `Group-${i + 1}`,
    hblBkgForm: `Form-${i + 1}`,
    noOfPackages: String(2 + i),
    kindOfPkgs: 'Boxes',
    grossWeight: String(100 + i),
    netWeight: String(90 + i),
    cbm: String(5 + i),
  }));
}

export interface FFDraftInvoiceHeaderData {
  noOfInvoiceCopies: string;
  blAwbNo: string;
  consigneeAddress1: string;
}

/** FF Export Sea's own Draft Invoice Edit header - a genuinely different field set than CB's own Draft Invoice (BL/AWB No here, no Consignee Address 2/3 required by this continuation). */
export function generateFFDraftInvoiceHeader(seed: number): FFDraftInvoiceHeaderData {
  return {
    noOfInvoiceCopies: '3',
    blAwbNo: `BLAWB-${seed}`,
    consigneeAddress1: `QA FF Consignee Address - ${seed}`,
  };
}

/**
 * Qty/Rate only - the real Description/Currency master lists for FF's own Draft Invoice "Add New"
 * item popup were never confirmed live (a genuinely different module/screen than CB's own Draft
 * Invoice, whose own 2-entry `DRAFT_INVOICE_ITEM_DESCRIPTIONS` list is CB-tagged and not assumed
 * valid here), so `FFDraftInvoicePage` discovers real, live-rendered Description options itself
 * (never a guessed value) rather than this generator supplying one.
 */
export interface FFDraftInvoiceItemInput {
  qty: string;
  rate: string;
}

export function generateFFDraftInvoiceItems(seed: number, count = 5): FFDraftInvoiceItemInput[] {
  return Array.from({ length: count }, (_, i) => ({
    qty: String(1 + ((seed + i) % 5)),
    rate: String(100 + seed + i * 10),
  }));
}

/** Confirmed live real field set for HBL Generation's own Shipper/Consignee/Notify Party/Forwarder Agent accordion sections - all four share the same 7 fields (Company Name/Address 1/2/3/Mobile No/Land Line No/Email), though Company Name is pre-filled (read-only) for Shipper/Consignee and this continuation only needs a subset per section. */
export interface FFHblPartyData {
  companyName: string;
  address1: string;
  address2: string;
  address3: string;
  mobileNo: string;
  landLineNo: string;
  email: string;
}

export function generateFFHblNotifyParty(seed: number): FFHblPartyData {
  return {
    companyName: `QA HBL Notify Party ${seed}`,
    address1: `QA Notify Address 1 - ${seed}`,
    address2: `QA Notify Address 2 - ${seed}`,
    address3: `QA Notify Address 3 - ${seed}`,
    mobileNo: `9${String(seed).padStart(9, '0').slice(-9)}`,
    landLineNo: `044${String(seed).padStart(7, '0').slice(-7)}`,
    email: `qa.hbl.notify.${seed}@example.com`,
  };
}

export function generateFFHblForwarderAgent(seed: number): FFHblPartyData {
  return {
    companyName: `QA HBL Forwarder Agent ${seed}`,
    address1: `QA Forwarder Address 1 - ${seed}`,
    address2: `QA Forwarder Address 2 - ${seed}`,
    address3: `QA Forwarder Address 3 - ${seed}`,
    mobileNo: `8${String(seed).padStart(9, '0').slice(-9)}`,
    landLineNo: `044${String(seed + 1).padStart(7, '0').slice(-7)}`,
    email: `qa.hbl.forwarder.${seed}@example.com`,
  };
}

/** Confirmed live real field set for HBL Generation's own "General Information" accordion - Export Reference/Export Instruction/Pre Carriage By/Place of Receipt By Pre-carrier/Port of Delivery/Loading Pier/Terminal/No Of Originals/Point & Country of Origin of Goods/Freight Payable at are plain textboxes (Port of Delivery is NOT a combobox despite sitting beside the real Port of Loading/Port of Discharge comboboxes); Type of Move is the one real combobox here (Port of Loading/Port of Discharge arrive pre-filled from the upstream chain and are left as-is). */
export interface FFHblGeneralInfoData {
  exportReference: string;
  exportInstruction: string;
  preCarriageBy: string;
  placeOfReceiptByPreCarrier: string;
  portOfDelivery: string;
  loadingPierTerminal: string;
  noOfOriginals: string;
  pointCountryOriginOfGoods: string;
  freightPayableAt: string;
  /** Confirmed live: lives below the Upload Document section (outside the accordion) and is required - Create is blocked by native "Please fill out this field." without it. */
  placeAndDateOfIssue: string;
  shippingLineName: string;
  /** Confirmed live: the app pre-fills this by joining every upstream vessel/voyage (329 chars for 10 plans) and the backend then rejects Create with "value too long for type character varying(255)" - it has to be shortened by hand. */
  vesselVoyageNo: string;
}

export function generateFFHblGeneralInfo(seed: number): FFHblGeneralInfoData {
  return {
    exportReference: `QA Export Ref ${seed}`,
    exportInstruction: `QA Export Instruction ${seed}`,
    preCarriageBy: 'Road',
    placeOfReceiptByPreCarrier: `QA Place of Receipt ${seed}`,
    portOfDelivery: `QA Port of Delivery ${seed}`,
    loadingPierTerminal: `QA Loading Pier ${seed}`,
    noOfOriginals: '3',
    pointCountryOriginOfGoods: 'India',
    freightPayableAt: `QA Freight Payable At ${seed}`,
    placeAndDateOfIssue: `Chennai, ${new Date().toISOString().slice(0, 10)}`,
    shippingLineName: `QA Shipping Line ${seed}`,
    vesselVoyageNo: `QA Vessel / VOY-${seed}`,
  };
}

/** Confirmed live real field set for the HBL Container table's own row Edit popup - Container No. itself is pre-filled/read-only, not part of this input. */
export interface FFHblContainerEditData {
  markAndNumbers: string;
  containerSealNo: string;
  numberOfPackages: string;
  descriptionOfCommodities: string;
  grossWeight: string;
  measurementCbm: string;
  shippingOnBoard: string;
}

export function generateFFHblContainerEdit(seed: number, index: number): FFHblContainerEditData {
  return {
    markAndNumbers: `AS PER PACKING LIST ${seed}-${index + 1}`,
    containerSealNo: `SEAL-${seed}-${String(index + 1).padStart(2, '0')}`,
    numberOfPackages: String(10 + index),
    descriptionOfCommodities: `QA HBL Commodity ${seed}-${index + 1}`,
    grossWeight: String(1000 + seed + index * 10),
    measurementCbm: String(10 + index),
    shippingOnBoard: `2026-10-${String(1 + (index % 28)).padStart(2, '0')}`,
  };
}

/** Confirmed live real field set for the HBL "Freight Rates, Weight and/Or Measurement" table's own row Edit popup. */
export interface FFHblFreightRateEditData {
  subjectCorrection: string;
  prepaid: string;
  collect: string;
}

export function generateFFHblFreightRateEdit(seed: number): FFHblFreightRateEditData {
  return {
    subjectCorrection: `QA Freight Correction ${seed}`,
    prepaid: String(1000 + seed),
    collect: '0',
  };
}

/** Shipper only needs Address 3/Land Line No per this continuation's own task (Company Name is pre-filled/read-only there). */
export function generateFFHblShipperEdit(seed: number): { address3: string; landLineNo: string } {
  return {
    address3: `QA HBL Shipper Address 3 - ${seed}`,
    landLineNo: `044${String(seed).padStart(7, '0').slice(-7)}`,
  };
}

/** Consignee only needs Address 1/Mobile No/Land Line No/Email per this continuation's own task. */
export function generateFFHblConsigneeEdit(seed: number): { address1: string; mobileNo: string; landLineNo: string; email: string } {
  return {
    address1: `QA HBL Consignee Address 1 - ${seed}`,
    mobileNo: `7${String(seed).padStart(9, '0').slice(-9)}`,
    landLineNo: `044${String(seed + 1).padStart(7, '0').slice(-7)}`,
    email: `qa.hbl.consignee.${seed}@example.com`,
  };
}

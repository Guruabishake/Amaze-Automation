import * as path from 'path';
import { env } from './env';

export const loginData = {
  url: env.baseUrl,
  username: env.username,
  password: env.password,
  branch: env.branch,
};

/** Short per-run suffix so names/phones/container numbers never collide with earlier runs. */
const RUN_SUFFIX = Date.now().toString().slice(-6);

function letters(n: number): string {
  // Customer/Vendor Name and City strip digits on input in this app family, so names use letters only.
  return n
    .toString()
    .split('')
    .map((d) => String.fromCharCode(65 + Number(d)))
    .join('');
}

export interface CustomerData {
  customerName: string;
  customerType: 'Domestic' | 'Foreign';
  /** Appears (and is required) once Customer Type = Domestic - "Sub Type is required for Domestic customers." */
  subType: 'Regular' | 'SEZ';
  /** Appears once Sub Type = Regular - "Gst is required for Regular customers." 'No' avoids mandatory GST KYC data. */
  gstApplicable: 'Yes' | 'No';
  address1: string;
  address2: string;
  address3: string;
  country: string;
  state: string;
  city: string;
  phone: string;
  email: string;
}

export interface VendorData {
  vendorName: string;
  vendorType: 'Domestic' | 'Foreign';
  subType: 'Regular' | 'SEZ';
  categoryType: 'Liner' | 'CFS' | 'Transport' | 'Others';
  address1: string;
  address2: string;
  address3: string;
  country: string;
  state: string;
  city: string;
  phone: string;
  email: string;
}

export function generateCustomerData(): CustomerData {
  return {
    customerName: `QA DivyaImpex Customer ${letters(Number(RUN_SUFFIX))}`,
    customerType: 'Domestic',
    subType: 'Regular',
    gstApplicable: 'No',
    address1: `${RUN_SUFFIX.slice(-3)} Harbour Road`,
    address2: 'Export Logistics Park',
    address3: 'Near Container Freight Station',
    country: 'India',
    state: 'Tamil Nadu',
    city: 'Chennai',
    phone: `9${RUN_SUFFIX}${RUN_SUFFIX.slice(0, 3)}`,
    email: `qa.divya.customer.${RUN_SUFFIX}@example.com`,
  };
}

export function generateVendorData(): VendorData {
  return {
    vendorName: `QA DivyaImpex Transport ${letters(Number(RUN_SUFFIX))}`,
    vendorType: 'Domestic',
    subType: 'Regular',
    categoryType: 'Transport',
    address1: `${RUN_SUFFIX.slice(-3)} Truck Terminal Road`,
    address2: 'Transport Nagar',
    address3: 'Ring Road',
    country: 'India',
    state: 'Tamil Nadu',
    city: 'Chennai',
    phone: `8${RUN_SUFFIX}${RUN_SUFFIX.slice(0, 3)}`,
    email: `qa.divya.vendor.${RUN_SUFFIX}@example.com`,
  };
}

export const enquiryCargoSettings = {
  shipmentMode: 'Sea',
  shipmentDirection: 'Export',
  shipmentType: 'FCL',
} as const;

export interface CargoData {
  containerNo: string;
  containerSize: '20' | '40' | '45';
  containerType: string;
  cargoName: string;
  noOfPackages: string;
  grossWt: string;
  netWt: string;
  uom: string;
}

/** ISO 6346 check digit, so every generated container number is a genuinely valid one. */
function iso6346(ownerAndSerial: string): string {
  const values: Record<string, number> = {};
  let v = 10;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (v % 11 === 0) v++;
    values[ch] = v++;
  }
  const sum = ownerAndSerial
    .split('')
    .reduce((acc, ch, i) => acc + (/\d/.test(ch) ? Number(ch) : values[ch]) * Math.pow(2, i), 0);
  return ownerAndSerial + ((sum % 11) % 10).toString();
}

/** A valid ISO 6346 container number under its own owner code (QASU), unique per run and index - never one of the Enquiry's DIVU containers. */
export function uniqueContainerNo(index: number): string {
  const serial = String((Number(RUN_SUFFIX) % 90000) * 7 + 100000 + index * 13).slice(-6).padStart(6, '0');
  return iso6346(`QASU${serial}`);
}

const CARGO_NAMES = [
  'Cotton Garments', 'Granite Slabs', 'Tea Chests', 'Leather Footwear', 'Auto Spare Parts',
  'Spices Cartons', 'Rice Bags', 'Ceramic Tiles', 'Machinery Parts', 'Coir Products',
];

/**
 * `count` (default DIVYAIMPEX_CARGO_COUNT or 10) distinct FCL cargo rows. Size/Type values are the
 * real options of the Add Cargo popup (Size: 20/40/45; Type for 20': GP/OT). Gross Wt is always >= Net Wt.
 */
export function generateCargoData(count = env.cargoCount): CargoData[] {
  return Array.from({ length: count }, (_, i) => {
    const serial = `${RUN_SUFFIX}${i}`.slice(-6).padStart(6, '0');
    const packages = 50 + i * 10;
    const net = 1000 + i * 250;
    return {
      containerNo: iso6346(`DIVU${serial}`),
      containerSize: '20',
      containerType: i % 2 === 0 ? 'GP' : 'OT',
      cargoName: CARGO_NAMES[i % CARGO_NAMES.length],
      noOfPackages: String(packages),
      grossWt: String(net + 75),
      netWt: String(net),
      uom: 'KG',
    };
  });
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

export const transportData = {
  goodsPickup: { from: 'Shipper Factory Ambattur', address: 'Plot 12, Ambattur Industrial Estate, Chennai', date: isoDate(3) },
  goodsDelivery: { to: 'Chennai CFS', address: 'CFS Gate 2, Ennore High Road, Chennai', date: isoDate(5) },
  containerPickup: {
    from: 'Empty Yard Madhavaram',
    address: 'Container Yard, Madhavaram, Chennai',
    stuffing: 'Factory',
    stuffingLocation: 'Ambattur Factory Dock',
    date: isoDate(4),
  },
  containerDelivery: { to: 'Chennai Port Terminal', address: 'Gate 1, Chennai Port Trust', date: isoDate(6) },
};

export const uploadData = {
  documentType: 'Commercial Invoice',
  filePath: path.resolve(__dirname, '..', 'test-data', 'sample-commercial-invoice.pdf'),
};

/** Deliberate, identifiable change used to prove Edit -> Update persists. */
export const enquiryUpdate = {
  goodsPickupAddress: `${transportData.goodsPickup.address} (Updated ${RUN_SUFFIX})`,
};

// ---------------- Scenario 2: Quote Generation -> Master Job ----------------

/**
 * Handoff written by Scenario 1 on success and read by Scenario 2, so Scenario 2 always works on the
 * enquiry/quote created by the latest successful Scenario 1 run - never an unrelated quote.
 */
export const SCENARIO1_STATE_FILE = path.resolve(__dirname, '..', 'reports', 'state', 'scenario1-latest.json');

export interface Scenario1State {
  enquiryNo: string;
  customerName: string;
  customerEmail: string;
  vendorName: string;
  cargoCount: number;
  /** The Enquiry's cargo rows exactly as entered in Scenario 1 (container no, size/type, cargo name, packages, weights). */
  cargo: CargoData[];
  completedAt: string;
}

/** Handoff written by Scenario 2 after the Master Job is created; read by Scenario 3. */
export const SCENARIO2_STATE_FILE = path.resolve(__dirname, '..', 'reports', 'state', 'scenario2-latest.json');

export interface Scenario2State extends Scenario1State {
  quoteNo: string;
  referenceInvoiceNo: string;
  quoteType: string;
  jobCreatedAt: string;
}

export const quoteSettings = {
  /** Real Quote Type options: Break Bulk, CFS Destuffing 20/40, Export 20/40, Factory Destuffing 20/40. */
  quoteType: 'Export 20',
};

/**
 * Rate rows for the Add Rate popup. Charge Description and Currency are real dropdown options;
 * HS Code, Charge Based On, Exchange Rate and Value In INR are auto-filled by the app (read and
 * verified, never typed). `sparePool` is used when the app rejects a description (e.g. duplicate).
 */
export interface RateData {
  chargeDescription: string;
  quantity: string;
  rate: string;
  currency: string;
}

export const rateData: RateData[] = [
  { chargeDescription: 'BL Fee - Direct Incomes (CB)', quantity: '2', rate: '150', currency: 'USD' },
  { chargeDescription: 'Documentation Charges - Direct Incomes (CB)', quantity: '1', rate: '2500', currency: 'INR' },
  { chargeDescription: 'Seal Charges - Direct Incomes (CB)', quantity: '10', rate: '350', currency: 'INR' },
  { chargeDescription: 'Ocean Freight Charges - Indirect Incomes (CB,TMS)', quantity: '10', rate: '400', currency: 'USD' },
  { chargeDescription: 'Transportations - Direct Incomes (CB,TMS)', quantity: '10', rate: '75', currency: 'EUR' },
];

export const rateSparePool: RateData[] = [
  { chargeDescription: 'Weighment Charges - Direct Incomes (CB)', quantity: '10', rate: '200', currency: 'INR' },
  { chargeDescription: 'Service Charges - Direct Incomes (CB)', quantity: '1', rate: '5000', currency: 'INR' },
  { chargeDescription: 'Terminal Handling Charges-Origin - Direct Incomes (CB)', quantity: '10', rate: '120', currency: 'USD' },
  { chargeDescription: 'MUC Charges - Direct Incomes (CB)', quantity: '1', rate: '1500', currency: 'INR' },
  { chargeDescription: 'Clearance Charges(DE &DI) - Direct Incomes (CB)', quantity: '1', rate: '3500', currency: 'INR' },
  { chargeDescription: 'Destination Charges - Direct Incomes (CB)', quantity: '1', rate: '90', currency: 'USD' },
  { chargeDescription: 'Container handling services - Direct Incomes (TMS,CB)', quantity: '10', rate: '650', currency: 'INR' },
  { chargeDescription: 'Storage and warehousing services - Direct Incomes (CB)', quantity: '5', rate: '800', currency: 'INR' },
  { chargeDescription: 'Customs Clearance & Documentation Fee - Indirect Incomes (CB,TMS)', quantity: '1', rate: '60', currency: 'EUR' },
];

/** Deliberate, identifiable edits applied to the 2nd and 3rd rate rows added by this execution. */
export const rateEdits: Array<{ nth: number; quantity?: string; rate?: string }> = [
  { nth: 1, quantity: '3', rate: '2750' },
  { nth: 2, rate: '365' },
];

/**
 * Reference Invoice No typed into Generate Job -> "Confirm Master Job" (the app does not auto-generate it).
 * Verified live: plain required text input, maxLength 100, no pattern; existing jobs use free alphanumeric
 * references (INV10, MBL010, HBL010, BL0001). A unique per-run value avoids reusing an existing reference.
 */
export const referenceInvoiceNo = env.referenceInvoiceNo || `QAINV${RUN_SUFFIX}`;

// ---------------- Scenario 3: Booking Job Master -> CB Export Sea -> Shipping Bill -> Initiate Stuffing ----------------

export const SCENARIO3_STATE_FILE = path.resolve(__dirname, '..', 'reports', 'state', 'scenario3-latest.json');

function dateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Scenario 3 data. Identifiers and cargo come from the Scenario 2 handoff (never hard-coded); the
 * remaining values are real options seen in the app's own dropdowns on 2026-10-22 (ports, vessels,
 * liners, agents, consignees, document types) or unique per-run references.
 */
export function scenario3Data(s2: Scenario2State) {
  const sfx = RUN_SUFFIX;
  const first = s2.cargo[0];
  const sum = (k: 'noOfPackages' | 'grossWt' | 'netWt') => String(s2.cargo.reduce((a, c) => a + Number(c[k]), 0));
  return {
    vessel: {
      pol: 'Metro Freight Terminal',
      pod: 'Singapore Port',
      voyageMode: 'Transit',
      destination: 'Nhava Sheva',
      feederVessel: 'Berlin Express',
      feederVoyageNo: `FV${sfx}`,
      transhipmentEtd: [dateFromToday(5), dateFromToday(9), dateFromToday(13)] as [string, string, string],
      motherVessel: ['MSC Irina', 'Ever Ace'] as [string, string],
      voyageNo: [`MV1${sfx}`, `MV2${sfx}`] as [string, string],
      podEta: dateFromToday(20),
      liner: 'Mediterranean Shipping Company',
      agent: 'Meridian Shipping',
    },
    updateJob: {
      consigneeName: 'Indo Chemical',
      marks: `QA MARKS ${sfx}`,
      linerBookingNo: `LBN${sfx}`,
      documentReferenceNumber: `DOC${sfx}`,
      blNo: `BL${sfx}`,
      portOfDischarge: 'Singapore Port',
      polDate: dateFromToday(5),
      totalNoOfContainers: String(s2.cargo.length),
      cfsName: 'Chennai CFS',
      cargoType: 'General Cargo',
      requiredDocument: 'Commercial Invoice',
      trackingDocumentType: 'Commercial Invoice',
      uploadDocumentType: 'Commercial Invoice',
      filePath: uploadData.filePath,
    },
    sbGeneral: {
      childJobDate: dateFromToday(0),
      exporter: s2.customerName,
      exporterAddress: 'Export Logistics Park, Chennai',
      sbNo: `QASB${sfx}`,
      sbDate: dateFromToday(0),
      consigneeName: 'Indo Chemical',
      consigneeAddress: ['12 Marina Bay Road', 'Central Business District', 'Singapore 018989'] as [string, string, string],
      portOfLoading: 'Metro Freight Terminal',
      portOfDischarge: 'Singapore Port',
      portOfFinalDestination: 'Singapore',
      // Master > Port Master: Metro Freight Terminal -> Port Code CWZ-HD01 (Responsibility Center Metro Freight Terminal).
      // The SB job derives its branch from this code ("Unable to determine branch_id" for an unknown code).
      portCode: 'CWZ-HD01',
    },
    invoiceDate: dateFromToday(0),
    cbPackage: { noOfPackages: sum('noOfPackages'), grossWeight: sum('grossWt'), netWeight: sum('netWt'), uom: first.uom },
    cbContainer: {
      containerNo: first.containerNo,
      size: first.containerSize,
      type: first.containerType,
      customsSealNo: `CS${sfx}`,
      shipperSealNo: `SS${sfx}`,
      linerSealNo: `LS${sfx}`,
    },
    cbCargo: { cargoName: first.cargoName, hsCode: '61091000', commodity: 'Cotton knitted garments' },
    initiateSB: [
      { label: 'Invoice Date', value: dateFromToday(0) },
      { label: 'CIN No.', value: `CIN${sfx}` },
      { label: 'CIN Dt', value: dateFromToday(0) },
      { label: 'CIN SITE ID', value: 'SITE01' },
      { label: 'Customs Examination', value: 'No' },
      { label: 'PQ', value: 'No' },
      { label: 'FSSAI', value: 'No' },
      { label: 'Fumigation', value: 'No' },
      { label: 'LEO No.', value: `LEO${sfx}` },
      { label: 'LEO Date', value: dateFromToday(1) },
    ],
  };
}

export interface Scenario3State extends Scenario2State {
  bookingJobNo: string;
  childJobNo: string;
  sbNo: string;
  documentReferenceNumber: string;
  leoNo: string;
}

// ---------------- Scenario 4: Stuffing -> Draft Invoice -> Job Completed -> Vendor Bill ----------------

export const SCENARIO4_STATE_FILE = path.resolve(__dirname, '..', 'reports', 'state', 'scenario4-latest.json');

export interface Scenario4State {
  childJobNo: string;
  bookingJobNo: string;
  referenceInvoiceNo: string;
  startedAt: string;
  /** Stages THIS automation completed for the Child Job (resume points) - never inferred from records created elsewhere. */
  stages: Record<string, { at: string; detail?: Record<string, unknown> }>;
  stuffingNo?: string;
  draftInvoiceNo?: string;
  vendorName?: string;
  vendorBillNo?: string;
  newContainers?: string[];
}

export interface StuffingRowData {
  sbNo?: string;
  sbDate?: string;
  containerNo?: string;
  size?: string;
  type?: string;
  customsSeal?: string;
  shipperSeal?: string;
  linerSeal?: string;
  noOfPkgs?: string;
  grossWeight?: string;
  netWeight?: string;
  cbm?: string;
  hsCode?: string;
  commodity?: string;
}

/**
 * Scenario 4 data, built from the Scenario 3 handoff: the Reference No is the Scenario 2/3 Reference Invoice No,
 * new container rows get new valid ISO 6346 numbers (QASU owner code) under the
 * same Shipping Bill (SB No. / SB Date), and every other value is a per-run unique reference.
 */
export function scenario4Data(s3: Scenario3State, newRowCount = 5) {
  const sfx = RUN_SUFFIX;
  const first = s3.cargo[0];
  return {
    referenceNo: s3.referenceInvoiceNo,
    originalRowEdit: {
      customsSeal: `CSE${sfx}`,
      shipperSeal: `SSE${sfx}`,
      linerSeal: `LSE${sfx}`,
      cbm: '28.5',
      hsCode: '61091000',
      commodity: 'Cotton knitted garments (stuffing edit)',
      type: first.containerType,
    } as StuffingRowData,
    /** At least five NEW rows with brand-new valid container numbers (the Master Job section already lists the Enquiry's own containers). */
    newRows: s3.cargo.slice(1, 1 + newRowCount).map((c, i): StuffingRowData => ({
      containerNo: uniqueContainerNo(i),
      size: c.containerSize,
      type: c.containerType,
      customsSeal: `CS${i + 1}${sfx}`,
      shipperSeal: `SS${i + 1}${sfx}`,
      linerSeal: `LS${i + 1}${sfx}`,
      noOfPkgs: c.noOfPackages,
      grossWeight: c.grossWt,
      netWeight: c.netWt,
      cbm: String(10 + i),
      hsCode: '6109' + String(1000 + i * 10),
      commodity: `${c.cargoName} (stuffing row ${i + 1})`,
    })),
    document: { documentType: 'Commercial Invoice', filePath: uploadData.filePath },
    draftInvoice: {
      copies: '3',
      line: { descriptionPreference: ['Documentation Charges', 'Seal Charges', 'Service Charges', 'Weighment Charges'], uomPreference: ['Per Container', 'Per BE', 'Per SB'], qty: '2', rate: '500', currency: 'INR' },
    },
    vendorBill: { billNo: `VB${sfx}`, billDate: dateFromToday(0) },
  };
}

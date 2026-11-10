import { Page, Locator, expect } from '@playwright/test';
import { selectCustomDropdown, clickUploadAndAwaitResponse } from '../utils/commonActions';
import { EnquiryData, CargoItemData, TransportContainerPickupData, TransportContainerDeliveryData } from '../utils/testData';

const CREATE_ENQUIRY_API = '/middleware/api/v1/enquiry/createEnquiry';
// Exact Update/Initiate-Quote endpoint paths are unconfirmed (not yet observed on the network tab
// this phase) - matched by the shared '/enquiry/' segment plus a non-GET method instead, which is
// still specific enough to avoid matching the list/view GET calls.
const ENQUIRY_API_SEGMENT = '/middleware/api/v1/enquiry/';

/**
 * Enquiry (CRM -> Sales Management -> Enquiry) is a multi-tab, multi-service form - far more
 * complex than Customer/Vendor. Only the Freight-Forwarding service path is automated so far
 * (confirmed live to be the majority of real existing records); Customs Broker and Transport
 * Management System each reveal their own distinct required-field sets in Product Information
 * and are intentionally out of scope for this phase.
 */
export class EnquiryPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly createButton: Locator;
  readonly filterButton: Locator;
  readonly createFormHeading: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;
  readonly updateFormHeading: Locator;
  readonly updateButton: Locator;
  readonly viewFormHeading: Locator;
  readonly backButton: Locator;
  readonly filterSearchButton: Locator;
  readonly filterResetButton: Locator;
  readonly paginationContainer: Locator;
  readonly previousPageButton: Locator;
  readonly nextPageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.getByRole('heading', { name: 'Enquiry', exact: true });
    // Rendered as two adjacent spans ("+" / "Create") with no separating whitespace, same as
    // Customer/Vendor - exact "+ Create" role-name match is unreliable, so match loosely.
    this.createButton = page.getByRole('button', { name: /create/i }).first();
    this.filterButton = page.getByRole('button', { name: 'Filter', exact: true });
    this.createFormHeading = page.getByRole('heading', { name: 'Create Enquiry', exact: true });
    this.submitButton = page.getByRole('button', { name: 'Create', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.updateFormHeading = page.getByRole('heading', { name: 'Update Enquiry', exact: true });
    this.updateButton = page.getByRole('button', { name: 'Update', exact: true });
    this.viewFormHeading = page.getByRole('heading', { name: 'View Enquiry', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
    // Confirmed live: identical structure to Customer/Vendor's Filter panel and pagination -
    // Search/Reset only exist inside the filter popup, and pagination is a <ul> of <li><button>
    // with icon-only Prev/Next (first/last in that list) plus real numbered pages.
    this.filterSearchButton = page.getByRole('button', { name: 'Search', exact: true });
    this.filterResetButton = page.getByRole('button', { name: 'Reset', exact: true });
    this.paginationContainer = page.locator('ul').filter({ has: page.locator('li > button') }).first();
    this.previousPageButton = this.paginationContainer.locator('li > button').first();
    this.nextPageButton = this.paginationContainer.locator('li > button').last();
  }

  /**
   * Real app navigation: sidebar CRM -> Sales Management -> Enquiry (no direct URL navigation).
   * Confirmed live: "Sales Management" is a real toggle, not a one-way expand - calling this a
   * second time in the same session (e.g. Create then Edit within one lifecycle test) would
   * collapse its already-open submenu and hang waiting for "Enquiry". Only click it when the
   * submenu isn't already open, so this method is safe to call any number of times per session.
   */
  async navigateFromSidebar() {
    await this.page.getByRole('button', { name: 'CRM', exact: true }).click();
    const enquiryLink = this.page.getByRole('button', { name: 'Enquiry', exact: true });
    if (!(await enquiryLink.isVisible())) {
      await this.page.getByRole('button', { name: 'Sales Management', exact: true }).click();
    }
    await enquiryLink.click();
    await expect(this.pageHeading).toBeVisible();
  }

  async verifyListingPageElements() {
    await expect(this.pageHeading).toBeVisible();
    await expect(this.createButton).toBeVisible();
    await expect(this.filterButton).toBeVisible();
    await expect(this.page.getByText('Enquiry No', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Customer Name', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Enquiry Status', { exact: true })).toBeVisible();
  }

  async openCreateForm() {
    await this.createButton.click();
    await expect(this.createFormHeading).toBeVisible();
  }

  /** Confirmed live: at least one Service checkbox must be checked - this gates which Product Information fields become required. */
  async selectServices(services: Array<'Freight-Forwarding' | 'Customs Broker' | 'Transport Management System'>) {
    for (const service of services) {
      await this.page.getByRole('checkbox', { name: service, exact: true }).check();
    }
  }

  private async openTab(tabName: 'Customer Information' | 'Product Information' | 'Cargo Information' | 'Upload File') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }

  /**
   * Fills the Customer Information tab. Customer Id is the same searchable custom-combobox
   * widget used on Customer/Vendor - confirmed live it is wired to real Customer Management
   * records (via the customers dropdown API) and auto-fills/disables Customer Name, Address 1
   * and Address 2 once a record is selected, so those three are deliberately not set here.
   */
  async fillCustomerInformation(customerSearchText: string, sourceOfEnquiry: string) {
    await this.openTab('Customer Information');
    // Confirmed live: each option renders as "<name> [CUST-ID]", so an exact match on the name
    // alone never matches - use 'contains' (the one confirmed exception to the shared helper's
    // default exact match, see commonActions.ts).
    await selectCustomDropdown(this.page, 'Customer Id', customerSearchText, 'contains');
    await this.page.getByRole('textbox', { name: 'Source of Enquiry' }).fill(sourceOfEnquiry);
  }

  /**
   * Fills the required Product Information fields. Confirmed live via a real Create attempt: the
   * Customs Clearance requirement (at least one of the Origin or Destination Clearance By/
   * Location pairs, "Please enter either Origin or Destination Clearance By/Location") is enforced
   * for Customs Broker exactly as for Freight-Forwarding, not Freight-Forwarding-specific as
   * static inspection first suggested - so this one method is shared by both services. Inco Term,
   * Service, POL and POD remain confirmed NOT required for Air (no validation error appears for
   * them) and are intentionally left unfilled since their real dropdown option values were not
   * confirmed this phase. Confirmed live: Shipment Type becomes required for Sea (absent from
   * Air's required set) - "Shipment Type is required." - so it is filled only when provided.
   */
  async fillFreightForwardingProductInfo(data: EnquiryData) {
    await this.openTab('Product Information');
    await selectCustomDropdown(this.page, 'Shipment Mode', data.shipmentMode);
    await selectCustomDropdown(this.page, 'Shipment Direction', data.shipmentDirection);
    if (data.shipmentType !== undefined) {
      await selectCustomDropdown(this.page, 'Shipment Type', data.shipmentType);
    }
    await selectCustomDropdown(this.page, 'Business Type', data.businessType);
    await selectCustomDropdown(this.page, 'Destination Clearance By', data.destinationClearanceBy);
    await this.page.getByRole('textbox', { name: 'Destination Clearance Location' }).fill(data.destinationClearanceLocation);
  }

  /**
   * Configuration-driven entry point: selects exactly the services enabled in `config.services`
   * (independently, any combination) and fills the fields Product Information actually renders
   * for them. Confirmed live that the required Product Information set (Shipment Mode/Direction/
   * Business Type + the Customs Clearance Origin-or-Destination requirement) is identical across
   * Freight-Forwarding, Customs Broker and Transport Management System, so `fillFreightForwarding
   * ProductInfo` already covers every enabled combination - no per-service duplicate method is
   * needed. When Transport Management System is enabled, this also confirms its "Transport" tab
   * actually renders. The Transport-Goods Pickup/Delivery ROWS themselves cannot be filled here -
   * confirmed live they only exist once at least one Cargo item has been added (see
   * `fillTransportGoodsRows`, called after `addCargoItem`).
   */
  async fillVisibleServiceFields(
    config: { services: { freightForwarding: boolean; customsBroker: boolean; transportManagementSystem: boolean } },
    data: EnquiryData
  ) {
    const services: Array<'Freight-Forwarding' | 'Customs Broker' | 'Transport Management System'> = [];
    if (config.services.freightForwarding) services.push('Freight-Forwarding');
    if (config.services.customsBroker) services.push('Customs Broker');
    if (config.services.transportManagementSystem) services.push('Transport Management System');

    await this.selectServices(services);
    await this.fillFreightForwardingProductInfo(data);

    if (config.services.transportManagementSystem) {
      await this.page.getByRole('button', { name: 'Transport', exact: true }).click();
      await expect(this.page.getByText('Assigned To', { exact: true })).toBeVisible();
      await expect(this.page.getByText('Transport-Goods Pickup', { exact: true })).toBeVisible();
    }
  }

  /**
   * Adds one Cargo row via the "Add Cargo" popup and Saves it. Confirmed live: Create fails with
   * "At least one cargo item must be added." until this table has at least one row - it is not
   * optional once a service has been selected.
   *
   * Confirmed live: the popup's own field set is driven by the Enquiry's Shipment Mode, not a
   * static shape - Air renders a single "Volume In MT" text field, while every other mode
   * (Sea/Road/Rail) instead renders No of Containers/Size Of Container/Type Of Container/CBM.
   * `cargo.volumeInMt` and the four container fields are mutually exclusive in practice (set
   * whichever side matches the Enquiry's actual Shipment Mode) and are each only filled when
   * provided, so this one method serves both shapes without a mode parameter.
   *
   * Confirmed live: selecting DG on DG/Non-DG reveals 5 additional plain-text fields (IMO No, IM
   * DG No, IMO Class, UN No, Technical Name), absent entirely for Non DG - filled only when
   * `cargo.dgNonDg === 'DG'` and provided.
   */
  async addCargoItem(cargo: CargoItemData) {
    await this.openTab('Cargo Information');
    // Rendered as adjacent "+" / "Add Cargo" spans with no separating whitespace, same pattern
    // as the listing's "+ Create" button - an exact "Add Cargo" match is unreliable.
    await this.page.getByRole('button', { name: /add cargo/i }).click();
    if (cargo.noOfContainers !== undefined) {
      await this.page.getByRole('textbox', { name: 'No of Containers' }).fill(cargo.noOfContainers);
    }
    if (cargo.containerSize !== undefined) {
      await selectCustomDropdown(this.page, 'Size Of Container', cargo.containerSize);
    }
    if (cargo.containerType !== undefined) {
      await selectCustomDropdown(this.page, 'Type Of Container', cargo.containerType);
    }
    await this.page.getByRole('textbox', { name: 'No Of Packages' }).fill(cargo.noOfPackages);
    // Confirmed live: unlike every other field in this row, Cargo Name is exposed with
    // role="combobox" (an autocomplete-enabled input), not role="textbox" - still a plain
    // fill()-able input underneath, just a different accessible role.
    await this.page.getByRole('combobox', { name: 'Cargo Name' }).fill(cargo.cargoName);
    await this.page.getByRole('textbox', { name: 'Gross Wt' }).fill(cargo.grossWt);
    await this.page.getByRole('textbox', { name: 'Net Wt' }).fill(cargo.netWt);
    await selectCustomDropdown(this.page, 'UOM', cargo.uom);
    if (cargo.cbm !== undefined) {
      await this.page.getByRole('textbox', { name: 'CBM' }).fill(cargo.cbm);
    }
    if (cargo.volumeInMt !== undefined) {
      await this.page.getByRole('textbox', { name: 'Volume In MT' }).fill(cargo.volumeInMt);
    }
    await this.page.getByRole('textbox', { name: 'Commodity' }).fill(cargo.commodity);
    await this.page.getByRole('textbox', { name: 'Kind Of Packages' }).fill(cargo.kindOfPackages);
    await selectCustomDropdown(this.page, 'DG/Non-DG', cargo.dgNonDg);
    if (cargo.dgNonDg === 'DG') {
      if (cargo.imoNo !== undefined) await this.page.getByRole('textbox', { name: 'IMO No' }).fill(cargo.imoNo);
      if (cargo.imDgNo !== undefined) await this.page.getByRole('textbox', { name: 'IM DG No' }).fill(cargo.imDgNo);
      if (cargo.imoClass !== undefined) await this.page.getByRole('textbox', { name: 'IMO Class' }).fill(cargo.imoClass);
      if (cargo.unNo !== undefined) await this.page.getByRole('textbox', { name: 'UN No' }).fill(cargo.unNo);
      if (cargo.technicalName !== undefined) await this.page.getByRole('textbox', { name: 'Technical Name' }).fill(cargo.technicalName);
    }
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
  }

  /**
   * Fills the Transport-Goods Pickup and Transport-Goods Delivery rows required when Transport
   * Management System is selected. Confirmed live via direct investigation (not assumed): once at
   * least one Cargo item exists, the Transport tab auto-seeds ONE row per checked Transport-type
   * (Transport-Goods Pickup and Transport-Goods Delivery are checked by default whenever TMS is
   * selected) pre-filled only with No Of Packages (copied from the Cargo item) - Save is blocked
   * with "At least one Goods Pickup/Delivery row is required." until that row's own required
   * fields (Pickup/Delivery To, Address, Est Date) are filled. There is no separate "Add row"
   * button - the real mechanism is the row's own Edit icon, which opens an inline
   * fill-then-Update form. That icon has no accessible name (SVG-only), so it is scoped to the
   * single already-rendered row (matched by having numeric content, excluding the header row)
   * rather than a blind page-wide `.first()`/`.nth()`.
   *
   * Must be called AFTER `addCargoItem` (the row does not exist before that) and only when
   * `config.services.transportManagementSystem` is true.
   */
  async fillTransportGoodsRows(
    pickup: { location: string; address: string; date: string },
    delivery: { location: string; address: string; date: string }
  ) {
    await this.page.getByRole('button', { name: 'Transport', exact: true }).click();

    await this.page.getByRole('button', { name: 'Transport-Goods Pickup', exact: true }).click();
    const pickupRow = this.page.getByRole('row').filter({ hasNotText: 'PICKUP FROM' }).filter({ hasText: /\d/ }).first();
    await pickupRow.getByRole('button').first().click();
    await this.page.getByRole('textbox', { name: 'Pickup From' }).fill(pickup.location);
    await this.page.getByRole('textbox', { name: 'Pickup Address' }).fill(pickup.address);
    await this.page.locator('input[type="date"]').fill(pickup.date);
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();

    await this.page.getByRole('button', { name: 'Transport-Goods Delivery', exact: true }).click();
    const deliveryRow = this.page.getByRole('row').filter({ hasNotText: 'DELIVERY TO' }).filter({ hasText: /\d/ }).first();
    await deliveryRow.getByRole('button').first().click();
    await this.page.getByRole('textbox', { name: 'Delivery To' }).fill(delivery.location);
    await this.page.getByRole('textbox', { name: 'Delivery Address' }).fill(delivery.address);
    await this.page.locator('input[type="date"]').fill(delivery.date);
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();
  }

  /**
   * Fills the Transport-Container Pickup and Transport-Container Delivery rows. Confirmed live:
   * these two are checked by default (alongside the Goods rows) only when Shipment Mode is
   * Sea/Road/Rail - never Air, mirroring the same real Mode-driven rule already confirmed for
   * Cargo's own container fields - so only call this when the Enquiry's Shipment Mode is not Air.
   * Container Pickup's own row additionally has a real "Stuffing" dropdown (Factory/CFS/ICD/SEZ)
   * and "Stuffing Location" text field that Container Delivery does not have. This label has been
   * re-confirmed live to swing back and forth between "Stuffing" and "Destuffing" across different
   * environment updates (an earlier phase's notes assumed "Destuffing"; a later real screenshot,
   * taken after this exact wrong assumption caused a genuine multi-minute hang, confirmed "Stuffing"
   * is the current real label, matching the results table's own "STUFFING"/"STUFFING LOCATION"
   * column headers) - using the wrong one hangs indefinitely since this repo sets no actionTimeout,
   * so `selectCustomDropdown` retries its click forever against a combobox that never matches.
   * Always re-verify this specific label against a live screenshot before trusting either name.
   */
  async fillTransportContainerRows(pickup: TransportContainerPickupData, delivery: TransportContainerDeliveryData) {
    await this.page.getByRole('button', { name: 'Transport', exact: true }).click();

    await this.page.getByRole('button', { name: 'Transport-Container Pickup', exact: true }).click();
    const pickupRow = this.page.getByRole('row').filter({ hasNotText: 'PICKUP FROM' }).filter({ hasText: /\d/ }).first();
    await pickupRow.getByRole('button').first().click();
    await this.page.getByRole('textbox', { name: 'Pickup From' }).fill(pickup.location);
    await this.page.getByRole('textbox', { name: 'Pickup Address' }).fill(pickup.address);
    await selectCustomDropdown(this.page, 'Stuffing', pickup.stuffing);
    await this.page.getByRole('textbox', { name: 'Stuffing Location' }).fill(pickup.stuffingLocation);
    await this.page.locator('input[type="date"]').fill(pickup.date);
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();

    await this.page.getByRole('button', { name: 'Transport-Container Delivery', exact: true }).click();
    const deliveryContainerRow = this.page.getByRole('row').filter({ hasNotText: 'DELIVERY TO' }).filter({ hasText: /\d/ }).first();
    await deliveryContainerRow.getByRole('button').first().click();
    await this.page.getByRole('textbox', { name: 'Delivery To' }).fill(delivery.location);
    await this.page.getByRole('textbox', { name: 'Delivery Address' }).fill(delivery.address);
    await this.page.locator('input[type="date"]').fill(delivery.date);
    await this.page.getByRole('button', { name: 'Update', exact: true }).click();
  }

  /**
   * Uploads one document via the "Upload File" tab. Confirmed live: this is the same
   * Document-Type-then-file-then-Upload pattern already used by Vendor's KYC upload
   * (`VendorPage.uploadKycDocument`) - `documentType` is one of the real Document Type Master
   * values (e.g. "AIRWAY BILL"). Waits for the row to actually appear in the results table rather
   * than just the click, since Upload is an async call.
   */
  /**
   * Root-caused via a real trace of a failing Pricing run: this upload's own request was
   * previously never awaited before checking the row, so on a slow response it could still be in
   * flight when a LATER screen's own upload ran, and get mistaken for that screen's own response
   * (generic response-URL matching, not request-scoped). Waiting for this exact click's own
   * request/response first closes that race at the source.
   */
  async uploadDocument(documentType: string, filePath: string) {
    await this.openTab('Upload File');
    await selectCustomDropdown(this.page, 'Document Type', documentType);
    await this.page.locator('input[type="file"]').setInputFiles(filePath);
    const response = await clickUploadAndAwaitResponse(this.page, this.page.getByRole('button', { name: 'Upload', exact: true }));
    expect(response.ok(), `Document upload should succeed. Status ${response.status()}`).toBeTruthy();
    // A real file upload (network round-trip for the configured file, e.g. the default ~3MB
    // sample.png) can genuinely take longer than the 5s default expect timeout under any latency -
    // this is not a fixed/blind wait, still resolves as soon as the row actually appears.
    await expect(this.page.getByRole('cell', { name: documentType, exact: true }).first()).toBeVisible({ timeout: 20000 });
  }

  async submitAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(CREATE_ENQUIRY_API) && res.request().method() === 'POST'
    );
    await this.submitButton.click();
    const response = await responsePromise;
    expect(response.status(), `createEnquiry API should return 200. Body: ${await response.text()}`).toBe(200);
    await expect(this.pageHeading).toBeVisible();
  }

  /** Submits and asserts the specific inline validation message(s) shown, without leaving the form. */
  async submitAndExpectValidationErrors(...messages: string[]) {
    await this.submitButton.click();
    for (const message of messages) {
      await expect(this.page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    await expect(this.createFormHeading).toBeVisible();
  }

  /** Confirmed on the live app: Cancel discards the in-progress form and returns to the listing without calling the create API. */
  async cancelCreateForm() {
    await this.cancelButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * The listing has no semantic <table>/<tr> - each row is a plain div laid out with inline CSS
   * grid, same structural pattern confirmed for Customer/Vendor - so rows are scoped by that
   * structural marker plus the exact Customer Name they contain, never by position/.nth().
   * Enquiry No is server-generated and unknown ahead of creation, so Customer Name is the only
   * reliable unique key available to the caller at Create time.
   */
  getRowByCustomerName(customerName: string): Locator {
    return this.page
      .locator('div[style*="grid-template-columns"]')
      .filter({ has: this.page.getByText(customerName, { exact: true }) })
      .first();
  }

  async verifyEnquiryInListing(customerName: string, shipmentMode: string, status: string) {
    const row = this.getRowByCustomerName(customerName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(shipmentMode);
    await expect(row).toContainText(status);
  }

  /** Reads the listing's "Enquiry Status" column for the exact record by Customer Name. */
  async expectEnquiryStatus(customerName: string, status: 'Enquiry Created' | 'Quote Initiated') {
    await expect(this.getRowByCustomerName(customerName)).toContainText(status);
  }

  /** Opens the exact record's real Update screen by its unique Customer Name - never by row position. */
  async editEnquiryByCustomerName(customerName: string) {
    const row = this.getRowByCustomerName(customerName);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.updateFormHeading).toBeVisible();
  }

  /**
   * Confirmed live: unlike Create, the Update screen's Product Information tab always renders the
   * FULL field set (Customs Clearance/Origin/Destination section included) regardless of which
   * service(s) are checked - a real Create-vs-Update asymmetry, not an automation inconsistency.
   * Verifies the core pre-populated values that survive across every service.
   */
  async verifyUpdateFormPrefilled(customerSearchText: string, data: Pick<EnquiryData, 'shipmentMode' | 'shipmentDirection' | 'businessType'>) {
    await expect(this.updateFormHeading).toBeVisible();
    await this.openTab('Customer Information');
    await expect(this.page.getByText(customerSearchText, { exact: false })).toBeVisible();
    await this.openTab('Product Information');
    await expect(this.page.getByText(data.shipmentMode, { exact: true }).first()).toBeVisible();
    await expect(this.page.getByText(data.shipmentDirection, { exact: true }).first()).toBeVisible();
    await expect(this.page.getByText(data.businessType, { exact: true }).first()).toBeVisible();
  }

  async fillUpdateSourceOfEnquiry(sourceOfEnquiry: string) {
    await this.openTab('Customer Information');
    await this.page.getByRole('textbox', { name: 'Source of Enquiry' }).fill(sourceOfEnquiry);
  }

  async submitUpdateAndExpectSuccess() {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(ENQUIRY_API_SEGMENT) && res.request().method() !== 'GET'
    );
    await this.updateButton.click();
    const response = await responsePromise;
    expect(response.ok(), `Enquiry update request should succeed. Status ${response.status()}. Body: ${await response.text()}`).toBeTruthy();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Submits an Update and asserts the specific inline validation message(s) shown, without leaving the form. */
  async submitUpdateAndExpectValidationErrors(...messages: string[]) {
    await this.updateButton.click();
    for (const message of messages) {
      await expect(this.page.getByText(message, { exact: true }).first()).toBeVisible();
    }
    await expect(this.updateFormHeading).toBeVisible();
  }

  /** Confirmed on the live app: Cancel discards in-progress edits and returns to the listing without calling the update API. */
  async cancelUpdateForm() {
    await this.cancelButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /** Opens the exact record's read-only View screen by its unique Customer Name - never by row position. */
  async viewEnquiryByCustomerName(customerName: string) {
    const row = this.getRowByCustomerName(customerName);
    await row.getByRole('button', { name: 'View More', exact: true }).click();
    await expect(this.viewFormHeading).toBeVisible();
  }

  /**
   * Verifies the View screen: real data matches the record and the form is genuinely read-only.
   * Confirmed live: unlike Create/Update's searchable "<name> [CUST-ID]" combobox, Customer Id
   * renders as a plain disabled textbox on View holding the raw internal code (e.g. "CUST-00774"),
   * NOT the customer name - the same real pattern already seen on Customer/Vendor's View screens
   * for their own Type fields. The customer's name is instead read from the separate, also
   * auto-filled "Customer Name" field.
   */
  async verifyViewFormFields(customerName: string, sourceOfEnquiry: string) {
    await expect(this.viewFormHeading).toBeVisible();
    await this.openTab('Customer Information');
    const customerIdInput = this.page.getByRole('textbox', { name: 'Customer Id' });
    await expect(customerIdInput).toBeDisabled();
    await expect(customerIdInput).toHaveValue(/^CUST-\d+$/);
    const customerNameInput = this.page.getByRole('textbox', { name: 'Customer Name' });
    await expect(customerNameInput).toHaveValue(customerName);
    await expect(customerNameInput).toBeDisabled();
    await expect(this.page.getByRole('textbox', { name: 'Source of Enquiry' })).toHaveValue(sourceOfEnquiry);
    await expect(this.page.getByRole('textbox', { name: 'Source of Enquiry' })).toBeDisabled();

    // View has only a Back button - no Cancel/Create/Update, confirmed live.
    await expect(this.backButton).toBeVisible();
    await expect(this.cancelButton).not.toBeVisible();
    await expect(this.updateButton).not.toBeVisible();
  }

  /** Confirmed on the live app: Back on the View screen returns to the listing (only button available there). */
  async returnToListingFromView() {
    await this.backButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  /**
   * Confirmed live: Initiate Quote does NOT open a custom HTML dialog like Customer/Vendor's
   * Approve/Reject - it triggers a native browser `window.confirm("Do you want to initiate a
   * quote for Enquiry No: <id>?")`, which Playwright must handle via `page.once('dialog', ...)`
   * registered BEFORE the click (native dialogs block page JS until resolved, but Playwright's own
   * event loop still needs the listener armed first). Confirmed live: accepting does NOT patch the
   * Enquiry in place with an API call - it navigates the browser to the separate Quotation
   * Generation module (`/crm/quotationGeneration`), pre-populated for that Enquiry. Completing a
   * quotation there is a distinct module, out of scope for Enquiry Management, so this method only
   * verifies the real navigation. `accept: false` exercises the real Cancel path - confirmed live
   * to leave the record entirely unchanged and on the same page.
   */
  async initiateQuote(customerName: string, accept: boolean) {
    const row = this.getRowByCustomerName(customerName);
    const dialogPromise = new Promise<string>((resolve) => {
      this.page.once('dialog', async (dialog) => {
        resolve(dialog.message());
        if (accept) {
          await dialog.accept();
        } else {
          await dialog.dismiss();
        }
      });
    });

    await row.getByRole('button', { name: 'Initiate Quote', exact: true }).click();
    const message = await dialogPromise;
    expect(message).toContain('Do you want to initiate a quote for Enquiry No:');
    if (accept) {
      await expect(this.page).toHaveURL(/\/crm\/quotationGeneration/);
    } else {
      await expect(this.page).toHaveURL(/\/crm\/enquiry(\?|$)/);
    }
  }

  /** Confirmed live: once a quote is initiated the row's Edit action becomes a real disabled control - a terminal state, same asymmetric-lock pattern as Customer/Vendor's Approved. */
  async expectEditDisabled(customerName: string) {
    await expect(this.getRowByCustomerName(customerName).getByRole('button', { name: /Edit disabled/i })).toBeDisabled();
  }

  /**
   * Opens the Filter panel. Confirmed live: Enquiry No, Source of Enquiry, Customer Name,
   * Shipment Mode and Shipment Type are plain text inputs here (NOT the custom-combobox widget
   * used on Create/Update, despite Shipment Mode/Type being dropdowns there) - only
   * Import/Export and Enquiry Status are the searchable comboboxes.
   */
  async openFilterPanel() {
    await this.filterButton.click();
    await expect(this.page.getByRole('textbox', { name: 'Customer Name' })).toBeVisible();
  }

  /**
   * Fills whichever filter fields are provided and clicks Search. Reuses `selectCustomDropdown`
   * for Import/Export and Enquiry Status - no duplicate dropdown handling.
   */
  async applyFilter(criteria: {
    enquiryNo?: string;
    sourceOfEnquiry?: string;
    customerName?: string;
    shipmentMode?: string;
    shipmentType?: string;
    importExport?: 'Export' | 'Import' | 'CROSS TRADE';
    enquiryStatus?: 'Enquiry Created' | 'Quote Initiated';
  }) {
    if (criteria.enquiryNo !== undefined) {
      await this.page.getByRole('textbox', { name: 'Enquiry No', exact: true }).fill(criteria.enquiryNo);
    }
    if (criteria.sourceOfEnquiry !== undefined) {
      await this.page.getByRole('textbox', { name: 'Source of Enquiry', exact: true }).fill(criteria.sourceOfEnquiry);
    }
    if (criteria.customerName !== undefined) {
      await this.page.getByRole('textbox', { name: 'Customer Name', exact: true }).fill(criteria.customerName);
    }
    if (criteria.shipmentMode !== undefined) {
      await this.page.getByRole('textbox', { name: 'Shipment Mode', exact: true }).fill(criteria.shipmentMode);
    }
    if (criteria.shipmentType !== undefined) {
      await this.page.getByRole('textbox', { name: 'Shipment Type', exact: true }).fill(criteria.shipmentType);
    }
    if (criteria.importExport) {
      await selectCustomDropdown(this.page, 'Import/Export', criteria.importExport);
    }
    if (criteria.enquiryStatus) {
      await selectCustomDropdown(this.page, 'Enquiry Status', criteria.enquiryStatus);
    }
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(ENQUIRY_API_SEGMENT) && res.request().method() === 'GET'
    );
    await this.filterSearchButton.click();
    await responsePromise;
  }

  /** Asserts the filtered result count without hardcoding the ever-growing total record count. Confirmed live: identical "N of M records" pattern as Customer/Vendor. */
  async expectFilteredResultCount(count: number) {
    await expect(this.page.getByText(new RegExp(`^${count} of \\d+ records$`))).toBeVisible();
  }

  /** Confirmed live: reset immediately clears every field and re-fetches the full unfiltered list, closing the panel - no separate Search click needed afterwards. */
  async resetFilter() {
    await this.filterResetButton.click();
    await expect(this.pageHeading).toBeVisible();
  }

  pageNumberButton(pageNumber: number): Locator {
    return this.paginationContainer.getByRole('button', { name: String(pageNumber), exact: true });
  }

  /** The windowed page-number list always renders the true final page as its last numbered button - confirmed live, same pattern as Customer/Vendor. */
  async getLastPageNumber(): Promise<number> {
    const numberButtons = this.paginationContainer.locator('li > button').filter({ hasText: /^\d+$/ });
    const count = await numberButtons.count();
    const text = await numberButtons.nth(count - 1).innerText();
    return Number(text.trim());
  }

  /** Clicking a pagination control triggers a real list refetch - wait for it, not just the click. */
  private async waitForListReload(action: () => Promise<void>) {
    const responsePromise = this.page.waitForResponse(
      (res) => res.url().includes(ENQUIRY_API_SEGMENT) && res.request().method() === 'GET'
    );
    await action();
    await responsePromise;
  }

  async goToNextPage() {
    await this.waitForListReload(() => this.nextPageButton.click());
  }

  async goToPreviousPage() {
    await this.waitForListReload(() => this.previousPageButton.click());
  }

  async goToPage(pageNumber: number) {
    await this.waitForListReload(() => this.pageNumberButton(pageNumber).click());
  }

  async expectCurrentPage(pageNumber: number) {
    await expect(this.page).toHaveURL(new RegExp(`[?&]page=${pageNumber}(&|$)`));
  }
}

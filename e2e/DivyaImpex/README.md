# DivyaImpex – Playwright E2E

UI-only automation for DivyaImpex (`https://staging-fc.cargowayz.net/login/DIVYAIMPEX`, branch **Metro Freight Terminal**).
It is self-contained: it has its own config, `.env`, page objects and data, and imports nothing from `e2e/AmazerTrans`. The Customer and Vendor page objects were adapted from the AmazerTrans versions.

## Setup

```bash
cp e2e/DivyaImpex/.env.example e2e/DivyaImpex/.env   # then fill in username/password
```

Dependencies come from the repo root (`npm install` at the root).

## Run

```bash
npx playwright test --config=e2e/DivyaImpex/playwright.config.ts                       # everything (scenario1 -> negative -> scenario2)
npx playwright test --config=e2e/DivyaImpex/playwright.config.ts --project=scenario1   # Scenario 1 only
npx playwright test --config=e2e/DivyaImpex/playwright.config.ts --project=scenario2   # Scenario 1 then Scenario 2
npx playwright test --config=e2e/DivyaImpex/playwright.config.ts --project=negative    # validation tests only
npx playwright show-report e2e/DivyaImpex/reports/html

# Watch it in the installed Google Chrome instead of headless Chromium
HEADLESS=false BROWSER_CHANNEL=chrome npx playwright test --config=e2e/DivyaImpex/playwright.config.ts --project=scenario3
```

Set `HEADLESS=true` for headless runs. Always pass `--config`. The root config ignores this folder because the app allows only one active session per account.

## What it covers

`tests/export-sea-FCL.spec.ts` runs one session with no logout:
Login with branch check → create and approve a Customer → create a Vendor → Create Enquiry: pick the customer (Customer Name and Address 1–3 auto-fill) → Sea / Export / FCL → TMS **Select All** → 10 cargo rows (`DIVYAIMPEX_CARGO_COUNT`) → Transport: pick Assigned To, then edit and update **every row** of Goods Pickup, Goods Delivery, Container Pickup and Container Delivery → upload a Commercial Invoice → Create → Edit → Update (changes the Goods Pickup address) → View (checks customer, cargo, transport and document) → Back → Initiate Quote → OK → status is **Quote Initiated**.

`tests/export-sea-FCL-negative.spec.ts` has 14 validation tests: unknown user, missing branch, required fields on Customer and Vendor, Enquiry without a customer, shipment, cargo or transport rows, cargo input sanitising, upload without a document type or file, edit locked once a quote is initiated, and Initiate Quote → Cancel.

`tests/export-sea-FCL-quote-to-job.spec.ts` (Scenario 2) continues the quote from Scenario 1. The `scenario2` project depends on `scenario1`, which writes `reports/state/scenario1-latest.json` on success. Scenario 2 refuses any quote that isn't that run's quote or isn't still "Quote Initiated".
It runs: Edit quote → Cargo Information → Quote tab → Quote Type **Export 20** → Charge Descriptions **Select All** → CB and TMS Vendor = the Scenario 1 vendor → 5+ distinct rates (HS Code, Charge Based On and Exchange Rate are auto-filled; Value In INR is checked against Quantity × Rate × Exchange Rate) → a deliberate duplicate → edit 2 rates → delete 1 rate (the duplicate) → Update, and reopen to check persistence → View → Back → Print (new tab; the original tab is restored) → Approve → Email → Confirm Quote → Generate Job (manual Reference Invoice No) → check the Master Job.

`tests/export-sea-FCL-cb-stuffing.spec.ts` (Scenario 3, project `scenario3`, depends on `scenario2`) continues the Booking Job from `reports/state/scenario2-latest.json`:
Booking Job Master View/Back → Edit (vessel block) → Update Job (booking details, Document Tracking, File Uploads) → 14 Booking filters → Create CB Job (SB: general info, the Scenario 2 Reference Invoice No, package, the Enquiry's container, cargo) → Child Job View/Back/Edit (shipment check on the Cargo Information tab)/Update → 9 Child Job filters → Initiate SB (10 fields) → Shipping Bill View/Back/Edit/Update → 9 Shipping Bill filters → Initiate Stuffing (opens "Stuffing-Create"; **Create is not clicked**).
Each filter field is tested on its own (enter, Search, check the record, evidence, Reset, check cleared). A failed filter is repeated once: failing twice = FAIL, failing then passing = INTERMITTENT (low-severity defect entry, run not failed). Defects are written to `reports/evidence/<run>/defects.json` and `scenario3-summary.json`.
Re-running Scenario 3 on the same Booking Job is safe (it reuses the Child Job, skips Initiate SB when "SB Initiated", asserts exactly one Child Job per Reference Invoice No), but Scenario 3 itself needs the chain: `--project=scenario3` runs Scenarios 1 and 2 first.

## Evidence

- `reports/evidence/<run-id>/*.png`: milestone screenshots (`customer-created`, `cargo-records-added`, `transport-*-updated`, `enquiry-view`, `quote-initiated`, …) plus `run-summary.json`, which records the Enquiry No, Assigned To and per-task row counts.
- `reports/html`: HTML report, with the screenshots attached.
- `reports/test-results`: video of every test, and a trace on failure.

## Observed app behaviour (verified on 2026-10-14)

- The Enquiry **Customer Id** picker lists only **Approved** customers, so the test approves the new customer first.
- The **Assigned To** list (Customs Department – Mumbai, DGFT – Regional Office, Port Authority – JNPT, Raja) does **not** include Vendor Management vendors. The test picks the new vendor if it ever appears, otherwise the first option. Assigned To is **not required** for Create.
- Customer: once **Sub Type** is Regular, **Gst Applicable** becomes required. Domestic customers and vendors need a Sub Type.
- **Known defects**, written as `test.fail` tests: an empty Add Cargo popup saves a blank row, and Net Wt > Gross Wt is accepted.
- **Quote (verified 2026-10-15):**
  - The Quote tab sits next to Cargo Information, not inside it.
  - Charge Descriptions "Select All" adds a "CFS charges (At Actuals)" rate row by itself.
  - Rate rows are saved only in the form until the page-level Update.
  - A duplicate Charge Description is **not** rejected when added.
  - Several charge descriptions have **no HS Code** in the master data (Documentation, Seal, Weighment, Service, Terminal Handling-Origin, MUC); the test skips them as ineligible.
  - Print opens a blob/print tab that can't be read or screenshotted (it is held by the browser print flow). The evidence is the requests it triggers.
  - Email shows "Generating PDF and sending email..." and then "Email sent successfully.".
- **Generate Job → Confirm Master Job:** the **Reference Invoice No** is a required manual text field (maxLength 100, no format rule). It is not auto-generated. Scenario 2 first checks that an empty Confirm is blocked ("Please fill out this field."). It then types a unique `QAINV<run digits>` (override with `DIVYAIMPEX_REFERENCE_INVOICE_NO`) and clicks Confirm once ("Booking Job created successfully."). Finally it checks two places: the quote row shows **Job Generated** / **Order Confirmed**, and the reference appears in the BL/INVOICE column of **Booking Master Job List** next to the customer. The app shows no separate Master Job number. Duplicate-reference validation is not tested, because if the app doesn't enforce uniqueness the test would create a second real job.
- **Scenario 3 (verified 2026-10-23):**
  - **Booking Edit (application defects):** on a fresh Booking Job, Update Booking Master → Cargo Information has Mother Vessel, Liner and Agent dropdowns with no options ("No results found") although Update Job offers them. **Destination is not saved** by Update (it reopens blank).
  - **Initiate SB:** the form is pre-filled from the CB job and its labels render progressively. Customs Examination, PQ, FSSAI and Fumigation offer the single option "NO". Initiate SB fills Invoice Date, CIN No., CIN Dt, CIN SITE ID, the four dropdowns, LEO No. and LEO Date.
  - **Child Job View/Edit:** General Information shows Child Job No and the linked Booking Job No; Shipment Type/Direction/Mode are on the Cargo Information tab.
  - **Child Job List:** the Document Reference No. column is blank on a brand-new Child Job.
  - **Ports:** the CB job's Port Code must exist in Master > Port Master (Metro Freight Terminal = CWZ-HD01).
  - **Stuffing:** "Stuffing-Create" shows Child Job No, Booking Job No, Mode, Product Type, Shipper and Consignee, with the container and seals on the Container Information tab. Nothing is created until its Create is clicked.
  - **Session:** a session expired after about 19 minutes in one browser (the lists showed "Failed to load Job list"), so the waits are bounded, `globalTimeout` is 90 minutes, and every state-changing test checks the UI before acting.
- Every test run creates data: one customer, one vendor and one enquiry per main run, and one extra enquiry (left as "Enquiry Created") per negative run.

## Scenario 4 (2026-10-23): Stuffing → Draft Invoice → Job Completed → Vendor Bill

`tests/export-sea-FCL-stuffing-to-vendor-bill.spec.ts` (project `scenario4`, run after `scenario3`) continues the Child Job from `reports/state/scenario3-latest.json`:

Initiate Stuffing (Reference No = Scenario 2's Reference Invoice No) → Container Info - Master Job: edit the original container row, delete one other existing row, add 5 new rows with fresh ISO-6346 container numbers → upload a document → Create Stuffing → Edit → Update → 9 Stuffing filters → Child Job status EIR Received → EGM Filed → Initiate Draft Invoice → View → Edit (set copies, add one invoice line from a real charge) → Update → 8 Draft Invoice filters → Child Job status **Invoice Generated → Payment Received → Job Completed** (the app's real sequential workflow requires the first two before "Job Completed" is selectable, even though the task only named EIR/EGM/Job Completed) → Vendor Bill: select vendor + Child Job (Job Details auto-populates from the real quote charges), GST, Bill No/Date → Create.

Every stage is written to `reports/state/scenario4-latest.json` so a rerun on the same Child Job skips completed stages (and reuses an already-uploaded document / already-added invoice line instead of duplicating it).

**Run:**
```bash
npx playwright test --config=e2e/DivyaImpex/playwright.config.ts --project=scenario4   # runs scenario1 -> scenario2 -> scenario4 (scenario3 is its own project; scenario4 only reads its handoff)
```

**Found and fixed during development:**
- 43 orphaned Chrome processes had accumulated from earlier background runs and were very likely causing a duplicate-session logout mid-run; `assertStillLoggedIn` now fails fast with a clear message if any list navigation lands back on the login page.
- Several form fields on this app use a plain `<button>` with no `role="combobox"` attribute (confirmed on Vendor Bill's "Child Job No."), unlike most fields which use `role="combobox"` explicitly — `fieldWrapper`/`readField`/`VendorBillPage.options` now fall back to any button.
- `fieldWrapper`'s ancestor-climbing locator could land on an outer container shared by a sibling field if that field's own control had not finished mounting yet (confirmed on Vendor Bill); fixed to use a matched `<label>`'s direct parent first.

**Known application defect:** Draft Invoice's "No of Invoice Copies" does not keep the typed value — reopening the invoice shows the same number as "No of Packages" instead.

**Known test-data artifact:** iterating on this scenario before the fixes above left ~7 duplicate invoice lines on `DRAFT-INV-CB-000134` (from retried runs before the fix that reuses a matching line instead of re-adding it) and a small number of extra Booking/Child Job/Stuffing records on earlier container numbers. Harmless leftover data, not a defect.

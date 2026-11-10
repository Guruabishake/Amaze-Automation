import { Page, Locator, Response } from '@playwright/test';

function exactTextPattern(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/**
 * The Customer/Vendor forms use a home-grown "combobox" widget (a <div role="combobox">
 * that opens a searchable option list), not a native <select>. Its <label> is NOT
 * associated to the widget via for/id or aria-labelledby (verified on the live app),
 * so getByLabel() cannot find it. Each field is wrapped in a "div.relative.group"
 * container that holds both the combobox and its floating label - that wrapper is the
 * only reliable way to scope to the right field.
 *
 * `root` (optional) scopes the field lookup itself to a sub-section of the page - confirmed
 * live necessary for Pricing's Upload File tab, which renders two separate fields both
 * labeled exactly "Document Type" (Buy Documents / Sell Documents) - without it, the
 * page-wide `.first()` below would always resolve to the Buy one. The option popup itself
 * (Search box + <li> list) still resolves page-wide regardless of `root`: confirmed live it
 * renders via a portal outside the field's own DOM subtree, so scoping it would only break
 * the lookup. Every existing call site omits `root` and keeps its current page-wide behavior.
 *
 * The inner `has` check always uses `page.getByText` (not `root.getByText`), even when `root` is
 * scoped - confirmed live that scoping BOTH the outer search and the inner `has` check to the same
 * already-scoped `root` produces a genuine multi-minute hang, not just a slower resolution (the
 * inner locator ends up re-describing the entire outer scope chain a second time inside the `has`
 * check, which never converges). Since `root` already restricts the outer candidates, a page-wide
 * inner check stays unambiguous as long as the label only ever appears once per scoped section
 * (true for every confirmed use of `root` so far).
 */
export async function selectCustomDropdown(
  page: Page,
  label: string,
  optionText: string,
  matchMode: 'exact' | 'contains' = 'exact',
  root: Page | Locator = page,
  preferClick = false
) {
  const field = root.locator('div.relative.group', { has: page.getByText(label, { exact: true }) }).first();
  await field.getByRole('combobox').click();
  await selectFromOpenDropdownPanel(page, optionText, matchMode, preferClick);
}

/**
 * The part of `selectCustomDropdown` that runs once the option panel is already open - factored
 * out so a field whose OWN trigger isn't reachable via the standard `div.relative.group` + label
 * pattern (confirmed live: Contract's "Customer Name" picker is a plain `<button>` sitting in a
 * SEPARATE `div.relative.group` from its own label text, one level further up in a shared grid
 * container - a genuinely different DOM shape from every other field this suite has seen, not a
 * variant `selectCustomDropdown` can special-case via its own label lookup) can still reuse this
 * same panel-interaction logic instead of duplicating it, once ITS caller has clicked the
 * field-specific trigger itself.
 */
export async function selectFromOpenDropdownPanel(
  page: Page,
  optionText: string,
  matchMode: 'exact' | 'contains' = 'exact',
  preferClick = false
) {
  // The option list renders as plain <li> elements inside a custom listbox, which Chromium
  // does not always expose with an ARIA "listitem" role once the ancestor sets role="listbox" -
  // getByRole('listitem') is therefore unreliable here, so this targets the <li> tag directly.
  // The panel also closes on blur, so pressing Enter in the (still-focused) search box - rather
  // than clicking the option - avoids a blur-before-click race that made direct clicks hang, for
  // every dropdown confirmed to behave that way. Most dropdowns (Customer/Vendor Type, State,
  // etc.) render plain option text, so an exact match is the default and every existing call site
  // keeps that behavior unchanged. Enquiry's "Customer Id" widget is the one confirmed exception:
  // each <li> renders as "<name> [CUST-ID]" (the record's ID appended), so an anchored exact match
  // never matches and callers for that field pass matchMode: 'contains' instead.
  //
  // `preferClick`: confirmed live via a real hung/misbehaving run that Contract's "Customer Name"
  // picker does NOT select on Enter - instead the keypress falls through to the surrounding
  // `<form>` and triggers ITS OWN premature validation ("Please fill all the required fields
  // before submitting."), leaving the field genuinely unselected. A direct click on the option
  // works correctly there with no blur race, so callers with a confirmed field like this pass
  // `preferClick: true` rather than this helper guessing per-field behavior itself.
  const option = page
    .locator('li')
    .filter({ hasText: matchMode === 'exact' ? exactTextPattern(optionText) : optionText })
    .first();
  const searchBox = page.getByPlaceholder('Search...');
  await searchBox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
  const searchBoxVisible = await searchBox.isVisible().catch(() => false);
  if (searchBoxVisible) {
    await searchBox.fill(optionText);
  }
  await option.waitFor({ state: 'visible', timeout: 5000 });
  if (searchBoxVisible && !preferClick) {
    await searchBox.press('Enter');
  } else {
    await option.click();
  }
}

/**
 * Clicks a document "Upload" button and waits for THAT SPECIFIC click's own upload request to
 * receive its response - never some other, unrelated `/uploads/documents` request. Root-caused via
 * a real trace: correlating by the RESPONSE event alone (`page.waitForResponse(urlPattern)`, the
 * pattern every call site used before this) is unsafe once more than one upload can be in flight in
 * the same session - e.g. Customer/Vendor's own KYC upload (which never awaited its response) can
 * still be pending, unnoticed, when a much later screen (Quotation) uploads its own document. The
 * generic URL+method predicate then resolves on that unrelated straggler the moment IT finishes,
 * letting the caller wrongly believe its own upload succeeded, while the app - confirmed live to
 * never queue a second concurrent upload, only silently drop the click - never actually received
 * this one. Anchoring to the REQUEST event instead of the RESPONSE event closes this race
 * completely: a request already in flight before this call started already fired its own 'request'
 * event in the past and can never satisfy a listener registered just now, so only a request THIS
 * click causes can ever match.
 */
export async function clickUploadAndAwaitResponse(page: Page, uploadButton: Locator): Promise<Response> {
  const requestPromise = page.waitForRequest((req) => req.url().includes('/uploads/documents') && req.method() === 'POST');
  await uploadButton.click();
  const request = await requestPromise;
  const response = await request.response();
  if (!response) {
    throw new Error('Document upload request did not receive a response (request failed or was aborted).');
  }
  return response;
}

export async function expandSection(page: Page, sectionHeading: string) {
  const heading = page.getByRole('heading', { name: sectionHeading, exact: true });
  await heading.scrollIntoViewIfNeeded();
  await heading.click();
}

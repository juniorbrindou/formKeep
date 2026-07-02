# Quickstart & Validation Guide: formKeep Core

**Date**: 2026-07-02 | **Plan**: [plan.md](plan.md)

Manual validation guide (no automated test suite — explicit project decision). Each scenario
maps to the spec's user stories (US) and success criteria (SC).

## Prerequisites

- Google Chrome (stable) on desktop
- The repo checked out locally; no build step, no dependencies to install

## Setup

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` directory
4. Pin formKeep to the toolbar
5. Open the fixture pages from `tests/fixtures/` directly (`file://…/simple-form.html`) or via
   any local static server

## Validation scenarios

### V1 — Detection & stable IDs (US1, SC-002)

1. Open `tests/fixtures/multi-forms.html` (3+ forms, two identical)
2. Open the popup → every form is listed with a distinct label; identical forms are
   distinguishable (occurrence)
3. Click a form's *highlight* action → the matching form flashes on the page
4. Reload the page 10 times → **expected**: each form keeps the same ID in the popup every time

### V2 — Tagging (US1)

1. On `simple-form.html`, tag the form from the popup and rename it "Test form"
2. Reload → **expected**: the form is still tracked, still named "Test form"

### V3 — Capture on submit (US2, SC-003)

1. Fill every field of the tagged form (text, textarea, email, number, date, password, select,
   multi-select, checkboxes, radios), then submit it
2. **Expected**: page submits normally (no blocked navigation); the popup now shows one dataset
   with an auto-generated name containing exactly the submitted values (open dataset editor to
   verify each value, including checkbox states and selected options)
3. Submit again with different values → **expected**: the active dataset is updated, no
   duplicate dataset created
4. Submit an **untracked** form on `multi-forms.html` → **expected**: nothing saved

### V4 — One-click fill (US3, SC-001, SC-003)

1. Reload `simple-form.html` (empty form); toolbar badge shows a count
2. Open the popup, click **Fill** on the tracked form
3. **Expected**: all fields are restored exactly (text content, selected options, checked
   states) in ≤ 2 user actions and under 5 seconds; nothing was injected before the click

### V5 — Structure drift (US3 scenarios 3–4, FR-015)

1. Edit `simple-form.html`: remove one field, add one new field; reload
2. Fill from the popup → **expected**: matching fields filled, removed-field entry skipped
   silently, new field left empty, no error

### V6 — Dynamic & pseudo-forms (US1 scenario 3, Constitution V)

1. Open `tests/fixtures/dynamic-form.html`; the form appears 2 s after load via script
2. **Expected**: popup lists it without reloading; the div-based pseudo-form is also detected
3. Tag + submit + refill it → the full loop works as in V3/V4

### V7 — Dataset management in the popup (US4, SC-006)

Without opening any fixture page (from a neutral tab):

1. Popup → tracked form → dataset list shows names, dates, and the active one
2. **Create** a dataset manually, entering values for the known fields
3. **Rename** it, **edit** one field value, **select** it as active
4. **Delete** the other dataset → a confirmation is required
5. **Expected**: all operations complete entirely in the popup

### V8 — Export / import round-trip (US5, SC-005)

1. Popup → **Export** → a `formkeep-export-*.json` file downloads; inspect it against
   [contracts/export-format.md](contracts/export-format.md)
2. Remove the extension's data (or the extension itself, then reload it)
3. Popup → **Import** → choose the file → **Replace all**
4. **Expected**: every form, label, dataset, and active selection is back (compare with step 1)
5. Import a corrupted file (truncate the JSON) → **expected**: clear error, existing data intact

### V9 — Performance sanity (SC-004)

1. Open a page with 20+ forms (duplicate blocks in `multi-forms.html`)
2. **Expected**: no perceptible load slowdown; popup listing appears instantly; detection scan
   < 500 ms (check via DevTools performance timeline on the content script if in doubt)

## Sign-off checklist

- [ ] V1–V9 all pass
- [ ] No network request initiated by the extension (DevTools → Network, filter by extension)
- [ ] No console errors on fixture pages or in the popup

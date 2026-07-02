---

description: "Task list for formKeep Core implementation"
---

# Tasks: formKeep Core — Form Tagging, Capture, Auto-Fill & Dataset Management

**Input**: Design documents from `/specs/001-formkeep-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No automated test tasks — explicit project decision. Validation is manual via [quickstart.md](quickstart.md) scenarios (V1–V9), referenced at each story checkpoint.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

## Path Conventions

Single flat browser-extension layout per plan.md: `extension/` (loadable unpacked) + `tests/fixtures/` (manual validation pages) at repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project skeleton, manifest, and validation fixtures

- [X] T001 Create directory structure: `extension/{content,popup,shared,background,icons}` and `tests/fixtures/` per plan.md
- [X] T002 Create `extension/manifest.json` — MV3; `permissions: ["storage", "activeTab"]`; `content_scripts` on `<all_urls>` at `document_idle` loading `shared/fingerprint.js`, `shared/storage.js`, `content/content.js` (in that order); `action.default_popup: popup/popup.html`; `background.service_worker: background/service-worker.js` (research R1, R7, R10)
- [X] T003 [P] Add placeholder icons `extension/icons/icon-{16,32,48,128}.png` and reference them in `extension/manifest.json`
- [X] T004 [P] Create fixture `tests/fixtures/simple-form.html` — one form containing every supported field type of FR-014 (text, textarea, email, number, date, password, hidden, select, multi-select, single checkbox, checkbox group, radio group) plus one `file` input (must be ignored)
- [X] T005 [P] Create fixture `tests/fixtures/multi-forms.html` — 3 distinct forms + 2 identical forms (occurrence-index case) + a commented duplication block to reach 20+ forms for perf check V9
- [X] T006 [P] Create fixture `tests/fixtures/dynamic-form.html` — one form injected by script 2 s after load + one div-based pseudo-form (inputs + button, no `<form>` tag)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared libraries and the three runtime surfaces every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Implement `extension/shared/fingerprint.js` — `globalThis.FormKeep.fingerprint`: field-descriptor extraction (`key`/`type`/`label` per data-model.md FormField rules, `file` inputs excluded), short stable hash of `origin + pathname + ordered field descriptors`, occurrence-index disambiguation (research R2)
- [X] T008 [P] Implement `extension/shared/storage.js` — `globalThis.FormKeep.storage`: `meta` initialization (formatVersion 1), `getForm/getAllForms/saveForm/deleteForm` over `form:<id>` keys, active-dataset invariant helper (data-model.md, research R6)
- [X] T009 Implement detection engine in `extension/content/content.js` — initial scan at `document_idle` (forms + pseudo-forms), in-memory registry `{id → element, descriptor}`, debounced ~300 ms MutationObserver rescan (research R3), `chrome.storage.onChanged` listener to refresh the tracked-form set, message-router skeleton (`chrome.runtime.onMessage`)
- [X] T010 [P] Implement `extension/background/service-worker.js` — handle `PAGE_STATUS` messages and set per-tab `chrome.action` badge text (count, empty when 0) per contracts/messages.md and research R9
- [X] T011 [P] Create popup shell: `extension/popup/popup.html`, `extension/popup/popup.css`, `extension/popup/popup.js` — layout skeleton (form list area, dataset panel area, export/import bar), active-tab query helper, `chrome.tabs.sendMessage` wrapper, load shared scripts

**Checkpoint**: Extension loads unpacked without errors; badge/service worker alive; popup opens empty — user story implementation can now begin

---

## Phase 3: User Story 1 - Form Detection & Tagging (Priority: P1) 🎯 MVP

**Goal**: Every form on a page is detected with a stable ID; the user can tag, rename, and visually identify forms from the popup

**Independent Test**: quickstart.md V1 (detection & stable IDs across 10 reloads) and V2 (tag + rename persists)

### Implementation for User Story 1

- [X] T012 [US1] Implement `GET_FORMS` handler in `extension/content/content.js` — merge in-page registry with storage: `tracked`, `label` (stored) vs `generatedLabel` (heuristic: form name/id attribute, nearest heading, submit-button text, else "Form with N fields"), `fieldCount`, `hasDatasets`, `activeDatasetId`, `occurrence` (contracts/messages.md)
- [X] T013 [US1] Implement `GET_FORM_FIELDS` and `HIGHLIGHT_FORM` handlers in `extension/content/content.js` — return current FormField descriptors; temporary ~1.5 s outline flash on the form element, no persistent DOM change
- [X] T014 [US1] Implement form list UI in `extension/popup/popup.js` — list detected forms of the active tab with label, field count, tracked badge, active-dataset indicator, and a highlight button wired to `HIGHLIGHT_FORM`
- [X] T015 [US1] Implement tag/untag and rename in `extension/popup/popup.js` — tag creates the TrackedForm record (id, label, origin, path, occurrence, fields via `GET_FORM_FIELDS`, timestamps) in storage; untag deletes `form:<id>` after a confirmation dialog (FR-010 — datasets die with the form); inline label rename (FR-004)

**Checkpoint**: quickstart V1 + V2 pass — detection, stable IDs, tagging, renaming all functional

---

## Phase 4: User Story 2 - Capture on Submission (Priority: P1)

**Goal**: Submitting a tracked form saves the entered values as a local dataset without disturbing the site

**Independent Test**: quickstart.md V3 (all field types captured exactly; untracked forms ignored; navigation unblocked)

### Implementation for User Story 2

- [X] T016 [US2] Implement capture listeners in `extension/content/content.js` — document-level `submit` listener in capture phase for tracked `<form>` elements + click hook on the detected submit control of tracked pseudo-forms; synchronous value serialization per data-model.md FieldValue encoding (checkbox groups → `string[]`, radio → checked value, multi-select → `string[]`); never call `preventDefault()` (research R4)
- [X] T017 [US2] Implement capture persistence in `extension/content/content.js` — update the active dataset in place, or create the first dataset (auto-name "Capture YYYY-MM-DD HH:mm") and mark it active when none exists; refresh the stored `fields` descriptors and `lastSeenAt`; ignore untracked forms entirely

**Checkpoint**: quickstart V3 passes — the data-producing half of the core loop works

---

## Phase 5: User Story 3 - One-Click Fill on Return (Priority: P1)

**Goal**: Returning to a page, the user sees a badge signal and refills a tracked form in one click

**Independent Test**: quickstart.md V4 (exact one-click restore, nothing injected before the click), V5 (structure drift), V6 (dynamic/pseudo-forms full loop)

### Implementation for User Story 3

- [X] T018 [US3] Implement `FILL_FORM` handler in `extension/content/content.js` — read the dataset from storage by `datasetId`, match `values` keys to current DOM fields by `key`, set values per type (text/select/multi-select/checkbox/radio) and dispatch `input`/`change` events for framework reactivity, return `{ ok, filled, skipped }`; unmatched entries skipped silently (FR-015, contracts/messages.md)
- [X] T019 [US3] Implement fill controls in `extension/popup/popup.js` — "Fill" button per tracked form (uses active dataset) plus dataset picker when several datasets exist (FR-008); display filled/skipped result feedback
- [X] T020 [US3] Implement badge signalling in `extension/content/content.js` — send `PAGE_STATUS` with the count of tracked forms having datasets on initial scan, after each rescan, and on `storage.onChanged` (worker side already done in T010)

**Checkpoint**: quickstart V4 + V5 + V6 pass — the complete P1 loop (detect → tag → capture → refill) is functional; **this is the MVP**

---

## Phase 6: User Story 4 - Dataset Management UI (Priority: P2)

**Goal**: Full dataset control (view, create, edit, rename, delete, select active) from the popup, without visiting the form's page

**Independent Test**: quickstart.md V7 (all operations from a neutral tab)

### Implementation for User Story 4

- [X] T021 [US4] Implement dataset list view in `extension/popup/popup.js` — per tracked form (listed from storage even when not on the form's page): dataset names, created/updated dates, active indicator, "set active" action (updates `activeDatasetId`)
- [X] T022 [US4] Implement dataset editor in `extension/popup/popup.js` — open a dataset, view/edit each field value (input widget per field type from stored descriptors), rename dataset (unique-per-form names, auto-suffix " (2)")
- [X] T023 [US4] Implement dataset create/delete in `extension/popup/popup.js` — manual creation from the form's stored field descriptors with name + values entry; deletion with confirmation dialog and `activeDatasetId` invariant repair (fallback to another dataset or `null`) per data-model.md

**Checkpoint**: quickstart V7 passes — datasets fully manageable outside the form page

---

## Phase 7: User Story 5 - Data Export & Import (Priority: P3)

**Goal**: One-file JSON backup and restore of everything (Constitution III)

**Independent Test**: quickstart.md V8 (export → wipe → import restores 100%; corrupted file rejected harmlessly)

### Implementation for User Story 5

- [X] T024 [P] [US5] Implement bundle logic in `extension/shared/storage.js` — `buildExportBundle()` (formatVersion, exportedAt, all `form:*` values verbatim), `validateBundle()` (full structural validation before any write per contracts/export-format.md), `applyImport(bundle, mode)` with "replace all" and "merge (imported wins by id)" modes
- [X] T025 [US5] Implement export UI in `extension/popup/popup.js` — Export button building the bundle and downloading `formkeep-export-YYYY-MM-DD.json` via `Blob` + object URL + `<a download>` (research R8)
- [X] T026 [US5] Implement import UI in `extension/popup/popup.js` — `<input type="file">` + `FileReader`, validation with clear error on invalid/unsupported file (storage untouched), mode choice (replace all / merge) with confirmation dialog before applying (FR-012)

**Checkpoint**: quickstart V8 passes — all five user stories functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass across all stories

- [X] T027 [P] Final styling pass in `extension/popup/popup.css` — compact, readable popup (lists, editor, dialogs); no framework, no external fonts (Constitution I & IV)
- [X] T028 [P] Write `README.md` at repository root — install (load unpacked), daily usage (tag → submit → one-click fill), dataset management, export/import, fixture-based validation pointer to specs/001-formkeep-core/quickstart.md
- [ ] T029 Run the full quickstart.md validation (V1–V9) including the sign-off checklist (no network requests, no console errors) and fix any regressions found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: After Foundational — no story dependencies
- **US2 (Phase 4)**: After Foundational — uses tagging from US1 to be exercised end-to-end, but its code (T016–T017) only depends on T007–T009
- **US3 (Phase 5)**: After Foundational — needs US2's datasets to demonstrate value; T018–T020 code depends on T007–T010
- **US4 (Phase 6)**: After Foundational — independently testable with datasets from US2 (or manually created)
- **US5 (Phase 7)**: After Foundational — T024 only touches `shared/storage.js`
- **Polish (Phase 8)**: After all desired user stories

### User Story Dependencies

- **US1 (P1)**: Foundation only — the entry point of the loop
- **US2 (P1)**: Foundation; end-to-end demo requires a tagged form (US1)
- **US3 (P1)**: Foundation; end-to-end demo requires a saved dataset (US2)
- **US4 (P2)**: Foundation; richer with US2 data but creatable standalone (manual datasets)
- **US5 (P3)**: Foundation; exercises whatever data exists

### Within Each User Story

- Content-script handlers before their popup UI counterparts (T012–T013 before T014–T015; T018 before T019)
- Shared-library work (T024) before UI consuming it (T025–T026)

### Parallel Opportunities

- Setup: T003, T004, T005, T006 in parallel after T001–T002
- Foundational: T007, T008 in parallel; then T010, T011 in parallel with T009
- After Foundational: US1 and the code-only parts of US2/US5 (T016 groundwork, T024) can proceed in parallel — different files or independent functions
- Polish: T027, T028 in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T001–T002, launch together:
Task: "Implement extension/shared/fingerprint.js"       # T007
Task: "Implement extension/shared/storage.js"           # T008
# Then, alongside T009 (content.js):
Task: "Implement extension/background/service-worker.js" # T010
Task: "Create popup shell (popup.html/css/js)"           # T011
```

---

## Implementation Strategy

### MVP First (User Stories 1–3 = the core loop)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3 (US1) → validate quickstart V1–V2
4. Complete Phase 4 (US2) → validate V3
5. Complete Phase 5 (US3) → validate V4–V6 → **STOP: the daily-use loop works — deployable MVP**

### Incremental Delivery

1. MVP (US1+US2+US3) → daily use starts immediately
2. Add US4 (dataset management UI) → validate V7
3. Add US5 (export/import) → validate V8
4. Polish → full sign-off V1–V9

### Notes

- [P] tasks = different files or independent functions, no incomplete dependencies
- Each story checkpoint maps to specific quickstart.md scenarios — validate before moving on
- Constitution gates to keep in mind while implementing: fill only on click (II), confirmation on deletions (II/FR-010), no network calls ever (IV), no page DOM pollution beyond the temporary highlight (II)

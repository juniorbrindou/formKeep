# Feature Specification: formKeep Core — Form Tagging, Capture, Auto-Fill & Dataset Management

**Feature Branch**: `001-formkeep-core`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Form Detection & Identification — Détecter les formulaires sur la page, attribuer des IDs uniques. Form Data Capture — Intercepter la soumission et sauvegarder les données saisies localement. Auto-Fill with Dataset Management — Choisir et injecter automatiquement un jeu de données. Dataset Management UI — Gérer (créer/modifier/supprimer) les jeux de données dans la popup. Data Export/Import — Exporter et importer les données JSON."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Form Detection & Tagging (Priority: P1)

As a developer visiting a page I work on daily, I want the extension to detect every form on the page and assign each a stable unique ID, so I can tag the forms I care about and have them recognized every time I return.

**Why this priority**: Detection and stable identification is the foundation. Every other capability (capture, fill, management) depends on knowing which form is which.

**Independent Test**: Open a page containing 3 forms. The extension popup lists all 3 with distinct IDs and readable labels. Tag one form, reload the page 10 times: the tagged form keeps the same ID and tag every time.

**Acceptance Scenarios**:

1. **Given** a page with one or more `<form>` elements, **When** the page finishes loading, **Then** each form is detected and assigned a unique ID
2. **Given** a form previously assigned ID "X", **When** the page is reloaded or revisited in a later session, **Then** the same form is recognized with ID "X"
3. **Given** a form injected dynamically after page load (SPA navigation, modal), **When** it appears in the page, **Then** it is detected without requiring a page reload
4. **Given** a detected form, **When** the user tags it from the popup, **Then** the form becomes "tracked" and the user can rename its label
5. **Given** a form whose surface attributes change slightly (added class, reordered attributes), **When** the page is revisited, **Then** the form keeps its original ID as long as its field structure is recognizable

---

### User Story 2 - Capture on Submission (Priority: P1)

As a developer filling the same forms all day, I want the extension to intercept the submission of my tracked forms and save the values I typed as a local dataset, so I never have to retype them.

**Why this priority**: Capture is the data-producing half of the core loop (save → refill). Without it there is nothing to inject later.

**Independent Test**: Tag a form, fill its fields, submit it. Open the popup: a dataset containing exactly the submitted values exists for that form. The original submission reaches the site unchanged.

**Acceptance Scenarios**:

1. **Given** a tracked form, **When** the user submits it, **Then** all field values (text, textarea, select, checkbox, radio, email, number, date, password) are saved locally as a dataset for that form
2. **Given** a tracked form with an active dataset, **When** the user submits new values, **Then** the active dataset is updated with the new values
3. **Given** a tracked form with no dataset yet, **When** the user submits it, **Then** a new dataset is created with an automatic name the user can rename later
4. **Given** an untracked (non-tagged) form, **When** the user submits it, **Then** nothing is saved
5. **Given** a submission interception, **When** the data is saved, **Then** the form's normal submission behavior is not altered or blocked

---

### User Story 3 - Fill on Return (Priority: P1)

As a developer returning to a page with a tracked form, I want the extension to inject the selected dataset into the form, so the form is pre-filled with my saved values.

**Why this priority**: Filling is the payoff of the whole extension — it is the time-saving half of the core loop.

**Independent Test**: With a dataset saved for a tracked form, revisit the page: the form's fields receive the saved values. Verify each field type (text, select, checkbox, radio) is restored exactly.

**Acceptance Scenarios**:

1. **Given** a tracked form with an active dataset, **When** the user returns to the page, **Then** the extension signals that saved data is available and fills the form only when the user triggers the fill with a single click (no automatic injection on page load)
2. **Given** a tracked form with several datasets, **When** the user picks a different dataset from the popup, **Then** the form is filled with that dataset's values
3. **Given** a dataset containing fields that no longer exist in the form, **When** filling occurs, **Then** matching fields are filled and unmatched entries are skipped without error
4. **Given** a form with fields added since the dataset was saved, **When** filling occurs, **Then** the new fields are left untouched
5. **Given** any tracked form, **When** the user requests a manual fill from the popup, **Then** the selected dataset is injected on demand regardless of the automatic behavior
6. **Given** a tracked form with at least one dataset, **When** the page displays it, **Then** a discreet formKeep chip is anchored to the form allowing one-click fill in place (with a dataset menu when several exist); the chip appears only on tracked forms with data and never on untracked forms *(added 2026-07-02 after user feedback)*

---

### User Story 4 - Dataset Management UI (Priority: P2)

As a user with several datasets per form, I want to view, create, edit, rename, and delete datasets from the extension popup — without visiting the form's page — so I fully control my saved data.

**Why this priority**: Multiple datasets per form is a stated core need ("choisir le jeu de données à appliquer"), but the loop already works with a single dataset, so management UI comes after the P1 loop.

**Independent Test**: From the popup, open a tracked form's dataset list: create a dataset by typing field values manually, rename it, select it as active, then delete another dataset (with confirmation) — all without loading the form's page.

**Acceptance Scenarios**:

1. **Given** a tracked form, **When** the user opens it in the popup, **Then** all its datasets are listed with names and last-modified dates, and the active one is clearly indicated
2. **Given** a dataset list, **When** the user selects a dataset as active, **Then** that dataset becomes the one used for filling
3. **Given** a dataset, **When** the user edits it in the popup, **Then** individual field values can be viewed and modified without visiting the form's page
4. **Given** a dataset, **When** the user deletes it, **Then** a confirmation is required before removal
5. **Given** a tracked form, **When** the user creates a new dataset from the popup, **Then** they can name it and enter values for the form's known fields

---

### User Story 5 - Data Export & Import (Priority: P3)

As the owner of my data, I want to export everything (forms, tags, datasets) to a JSON file and import it back, so I can back up, audit, or migrate my data at any time.

**Why this priority**: Portability is a non-negotiable constitutional principle, but it is a safety/ownership feature rather than part of the daily loop.

**Independent Test**: Export all data to JSON, wipe the extension storage, import the file: every tracked form, label, dataset, and active-dataset selection is restored identically.

**Acceptance Scenarios**:

1. **Given** any amount of stored data, **When** the user triggers an export, **Then** a single JSON file containing all forms, tags, labels, and datasets is produced
2. **Given** a previously exported JSON file, **When** the user imports it, **Then** all data is restored, including active-dataset selections
3. **Given** an import into non-empty storage, **When** the user confirms, **Then** the user chooses between replacing all data or merging (imported entries win on conflict)
4. **Given** an invalid or corrupted JSON file, **When** the user attempts an import, **Then** the import is rejected with a clear message and existing data is untouched

---

### Edge Cases

- **Multiple identical forms on one page**: each instance receives a distinct ID based on position/order in the page
- **Form structure changed since capture**: fill matching fields by name/position, silently skip unmatched entries (see US3 scenarios 3–4)
- **File upload fields**: excluded from capture and fill (browsers forbid programmatic file selection); other fields of the same form work normally
- **Forms inside iframes**: out of scope for v1 — only forms in the main page context are detected
- **Custom pseudo-forms (div-based, no `<form>` tag)**: detected when they contain input elements and a submission mechanism; treated as regular forms
- **Forms without submit buttons / submitted via script**: capture also triggers on programmatic submission events when detectable
- **Very large pages (20+ forms)**: detection must not produce user-perceptible slowdown
- **Password fields**: captured and filled like any other field (explicit user decision — personal dev tool, no sensitive-data guardrails)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Extension MUST detect all forms (standard `<form>` elements and form-like structures) on a page, including forms injected after initial load
- **FR-002**: Extension MUST assign each form a deterministic unique ID that remains stable across page reloads and browser sessions
- **FR-003**: Users MUST be able to tag/untag a form; only tagged ("tracked") forms are captured and filled
- **FR-004**: Users MUST be able to rename the label of any tracked form
- **FR-005**: Extension MUST intercept submission of tracked forms and save all supported field values locally, without altering or blocking the site's normal submission
- **FR-006**: Extension MUST support multiple named datasets per tracked form, with exactly one marked as active at a time
- **FR-007**: Extension MUST fill a tracked form with its active dataset in a single click when the user returns to the page; filling is always user-initiated, never automatic on page load
- **FR-008**: Users MUST always be able to trigger a fill manually and to choose which dataset to apply
- **FR-009**: Users MUST be able to view, create, edit (field-by-field), rename, and delete datasets entirely from the extension UI, without visiting the form's page
- **FR-010**: Dataset and form deletions MUST require a confirmation step
- **FR-011**: Extension MUST export all stored data (forms, tags, labels, datasets, active selections) as a single JSON file on demand
- **FR-012**: Extension MUST import a previously exported JSON file, offering "replace all" or "merge" modes, and MUST reject invalid files without damaging existing data
- **FR-013**: All data MUST be stored locally on the user's machine; no form data ever leaves the browser
- **FR-014**: Extension MUST support standard field types: text, textarea, email, number, date, password, hidden, select (single/multiple), checkbox, radio
- **FR-015**: When a form's structure differs from a dataset, extension MUST fill matching fields and skip unmatched ones without error
- **FR-016**: Extension MUST display a discreet in-page fill control (chip) anchored to each tracked form having at least one dataset; the chip triggers filling only on user click and appears exclusively on user-tagged forms (the tag constitutes consent for this visual addition)

### Key Entities

- **TrackedForm**: A form the user has tagged. Attributes: unique ID, page URL pattern, user label (or generated label), field descriptors, structure fingerprint, created/last-seen timestamps
- **FormField**: Descriptor of one input inside a form: type, name/identifier, human label when available
- **Dataset**: A named set of values for one TrackedForm: name, map of field → value, active flag, created/updated timestamps. Belongs to exactly one TrackedForm
- **ExportBundle**: The complete portable snapshot: all TrackedForms with their Datasets and active-dataset selections, plus a format version for future compatibility

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Refilling a known form takes under 5 seconds and at most 2 user actions, versus minutes of manual typing
- **SC-002**: The same form receives the same ID across at least 10 consecutive reloads and across separate browser sessions
- **SC-003**: 100% of captured values for supported field types are restored exactly (text content, selected options, checked states)
- **SC-004**: Detection and fill cause no user-perceptible page slowdown, even on pages with 20+ forms
- **SC-005**: An export → wipe → import round-trip restores 100% of the data with zero loss
- **SC-006**: All dataset management operations (create, edit, rename, delete, select active) can be completed from the extension UI without opening the form's page

## Assumptions

- Single user, personal tool: no accounts, no authentication, no multi-profile support
- Password and other sensitive fields are saved and filled like any field — the user explicitly declined sensitive-data guardrails (personal dev environments)
- Forms inside iframes are out of scope for v1; only the main page context is scanned
- File inputs are excluded (programmatic filling is technically impossible); this is not counted against SC-003
- On submission, the active dataset is updated in place; a new dataset is created only when the form has none (creating "save as new dataset" variants is a management-UI action, not a submission-time prompt)
- Form identity is derived from a structure fingerprint (page URL + field composition), tolerant to minor DOM mutations, so IDs survive typical dev-site changes
- Import "merge" mode resolves conflicts in favor of the imported file
- Datasets belong to a single form; sharing datasets across forms is out of scope for v1
- Fill is always user-initiated (single click), per user decision on 2026-07-02 — fully compliant with Constitution Principle II ("click to fill"); the extension signals available data (toolbar badge + in-page chip anchored to tracked forms) but never injects on page load
- The in-page chip is not an "unexpected page modification" (Constitution, User Control): it appears only on forms the user explicitly tagged, and lives outside the page's layout flow

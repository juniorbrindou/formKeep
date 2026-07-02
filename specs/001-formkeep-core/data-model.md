# Data Model: formKeep Core

**Date**: 2026-07-02 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

## Storage layout (`chrome.storage.local`)

| Key | Value | Written by |
|-----|-------|-----------|
| `meta` | `{ formatVersion: 1 }` | popup (first run / import) |
| `form:<formId>` | `TrackedForm` object (below) | popup (tag/CRUD), content (capture, lastSeenAt) |

Untracked forms are never persisted — detection results live only in content-script memory
until the user tags a form (Constitution II).

## Entities

### TrackedForm

A form the user has tagged. One storage key per instance.

| Field | Type | Rules |
|-------|------|-------|
| `id` | `string` | Fingerprint hash (research R2). Immutable. Primary key (`form:<id>`) |
| `label` | `string` | Non-empty. Generated at tagging (e.g. "Login — 3 fields"), user-renamable (FR-004) |
| `origin` | `string` | URL origin of the page (e.g. `http://localhost:3000`) |
| `path` | `string` | URL pathname. `origin + path` scopes where the form is expected |
| `occurrence` | `number` | 0-based index among same-fingerprint forms on the page (duplicates edge case) |
| `fields` | `FormField[]` | Ordered field descriptors captured at tagging; refreshed at each capture |
| `activeDatasetId` | `string \| null` | Must reference an existing dataset id, or `null` when none |
| `datasets` | `Record<datasetId, Dataset>` | All datasets of this form. Dataset names unique per form (auto-suffix " (2)") |
| `createdAt` | `number` | Epoch ms, set at tagging |
| `lastSeenAt` | `number` | Epoch ms, updated when the form is re-detected |

### FormField

Descriptor of one input inside a form (embedded array, no own key).

| Field | Type | Rules |
|-------|------|-------|
| `key` | `string` | Match key for fill: `name` attribute when present, else `#<index>:<type>` |
| `type` | `string` | One of: `text`, `textarea`, `email`, `number`, `date`, `password`, `hidden`, `select`, `select-multiple`, `checkbox`, `radio` (FR-014). `file` fields are excluded at detection |
| `label` | `string \| null` | Human label when derivable (associated `<label>`, `placeholder`, `aria-label`) |

### Dataset

A named set of values for one TrackedForm (embedded in its parent — FR: a dataset belongs to
exactly one form).

| Field | Type | Rules |
|-------|------|-------|
| `id` | `string` | Random short id, unique within the form |
| `name` | `string` | Non-empty, unique per form. Auto-generated on capture ("Capture 2026-07-02 14:30"), renamable |
| `values` | `Record<fieldKey, FieldValue>` | See value encoding below |
| `createdAt` | `number` | Epoch ms |
| `updatedAt` | `number` | Epoch ms, bumped on every capture/edit |

**FieldValue encoding** (by field type):

| Field type | Encoding |
|------------|----------|
| text, textarea, email, number, date, password, hidden | `string` |
| select | `string` (selected option value) |
| select-multiple | `string[]` |
| checkbox (single) | `boolean` |
| checkbox (group sharing a `name`) | `string[]` (checked values) |
| radio (group) | `string` (checked value) |

### ExportBundle

The portable snapshot produced by export and consumed by import (full contract:
[contracts/export-format.md](contracts/export-format.md)).

| Field | Type | Rules |
|-------|------|-------|
| `formatVersion` | `number` | `1`. Import MUST reject unknown versions |
| `exportedAt` | `string` | ISO 8601 timestamp |
| `forms` | `TrackedForm[]` | Every `form:*` value, verbatim (includes datasets and active selections — SC-005) |

## Invariants & validation rules

- `activeDatasetId` is either `null` or a key of `datasets` — enforced on every dataset delete
  (deleting the active dataset sets `activeDatasetId` to another dataset or `null`).
- Deleting a TrackedForm removes its entire `form:<id>` key (datasets die with the form).
  Requires UI confirmation (FR-010); same for dataset deletion.
- Fill matches `Dataset.values` keys against current DOM fields by `key`; unmatched entries are
  skipped silently, unmatched DOM fields are left untouched (FR-015).
- Capture updates the active dataset in place; when `datasets` is empty, capture creates a new
  dataset and makes it active (spec assumption).
- Import validation happens entirely before the first write: structural check of every form and
  dataset against this model, then apply "replace all" (clear `form:*` keys, write bundle) or
  "merge" (imported form wins on `id` collision) (FR-012).

## State transitions

```text
Form (in-page):   detected ──tag──▶ tracked ──untag/delete──▶ removed from storage
                     ▲ (memory only)     │
                     └── re-detected ────┘  (lastSeenAt updated, fields refreshed)

Dataset:          (none) ──first capture──▶ active ◀──select──▶ inactive
                                              │  ▲                 │
                                    capture ──┘  └── edit ─────────┘
                                              └──delete──▶ gone (confirmation required)
```

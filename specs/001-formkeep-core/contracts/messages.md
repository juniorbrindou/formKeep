# Contract: Runtime Message Protocol

**Date**: 2026-07-02 | **Plan**: [../plan.md](../plan.md)

Storage (`chrome.storage.local`) is the single source of truth — all dataset/form CRUD is done
by the popup directly against storage, and the content script reacts via
`chrome.storage.onChanged`. Messages exist only where a live tab interaction is required.

Every message is `{ type: string, ...payload }`. Responses use the `sendResponse` callback.

## Popup → Content script (`chrome.tabs.sendMessage`, active tab)

### `GET_FORMS`

Ask the content script for all forms currently detected on the page.

- **Request**: `{ type: "GET_FORMS" }`
- **Response**:

```json
{
  "forms": [
    {
      "id": "a1b2c3d4",
      "tracked": true,
      "label": "Login — 3 fields",
      "generatedLabel": "Login — 3 fields",
      "fieldCount": 3,
      "hasDatasets": true,
      "activeDatasetId": "ds_9k2",
      "occurrence": 0
    }
  ]
}
```

`label` comes from storage for tracked forms, `generatedLabel` is the content script's
suggestion for untracked ones (US1/US3 popup listing).

### `FILL_FORM`

Inject a dataset into a form — always the result of a user click in the popup (Constitution II).

- **Request**: `{ type: "FILL_FORM", formId: "a1b2c3d4", datasetId: "ds_9k2" }`
- **Response**: `{ ok: true, filled: 5, skipped: 1 }` — `skipped` counts dataset entries with no
  matching DOM field (FR-015)
- **Errors**: `{ ok: false, error: "FORM_NOT_FOUND" | "DATASET_NOT_FOUND" }`

### `HIGHLIGHT_FORM`

Briefly outline a form on the page so the user can tell forms apart in the popup list.
Temporary visual outline only (removed after ~1.5 s); no persistent DOM change.

- **Request**: `{ type: "HIGHLIGHT_FORM", formId: "a1b2c3d4" }`
- **Response**: `{ ok: true }`

### `GET_FORM_FIELDS`

Return the current field descriptors of one detected form (used when tagging a form and when
creating a dataset manually in the popup).

- **Request**: `{ type: "GET_FORM_FIELDS", formId: "a1b2c3d4" }`
- **Response**: `{ ok: true, fields: [ { "key": "email", "type": "email", "label": "E-mail" } ] }`

## Content script → Service worker (`chrome.runtime.sendMessage`)

### `PAGE_STATUS`

Sent after each scan/storage change so the worker can update the toolbar badge (research R9).

- **Request**: `{ type: "PAGE_STATUS", trackedFormsWithData: 2 }`
- **Effect**: worker sets badge text (`"2"`, empty when `0`) for the sender's tab. No response.

## Notes

- No message carries dataset values from popup to content except `FILL_FORM` resolution:
  the content script reads the dataset itself from storage by `datasetId` (single reader path).
- Capture requires no messages: the content script writes the dataset to storage directly on
  submit; the popup refreshes via `chrome.storage.onChanged` if open.
- All types and rules for stored objects: see [../data-model.md](../data-model.md).

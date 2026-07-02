# Contract: ExportBundle JSON Format

**Date**: 2026-07-02 | **Plan**: [../plan.md](../plan.md) | **Model**: [../data-model.md](../data-model.md)

The single portable snapshot format for export and import (Constitution III, FR-011/FR-012).
File name suggestion: `formkeep-export-YYYY-MM-DD.json`.

## Structure

```json
{
  "formatVersion": 1,
  "exportedAt": "2026-07-02T14:30:00.000Z",
  "forms": [
    {
      "id": "a1b2c3d4",
      "label": "Login form (staging)",
      "origin": "http://localhost:3000",
      "path": "/login",
      "occurrence": 0,
      "fields": [
        { "key": "email",    "type": "email",    "label": "E-mail" },
        { "key": "password", "type": "password", "label": "Mot de passe" },
        { "key": "remember", "type": "checkbox", "label": "Se souvenir de moi" }
      ],
      "activeDatasetId": "ds_9k2",
      "datasets": {
        "ds_9k2": {
          "id": "ds_9k2",
          "name": "Compte admin",
          "values": { "email": "admin@test.dev", "password": "secret", "remember": true },
          "createdAt": 1782050000000,
          "updatedAt": 1782052000000
        }
      },
      "createdAt": 1782050000000,
      "lastSeenAt": 1782052000000
    }
  ]
}
```

## Validation rules (import — all checks BEFORE any write)

1. Root is an object with `formatVersion === 1` — otherwise reject with a clear message
   ("version non supportée" / "fichier invalide"), storage untouched (FR-012).
2. `forms` is an array; every element satisfies the `TrackedForm` shape of
   [data-model.md](../data-model.md): non-empty string `id` and `label`, string `origin`/`path`,
   array `fields`, object `datasets`, `activeDatasetId` null or present in `datasets`.
3. Every dataset satisfies the `Dataset` shape; `values` is an object whose values are
   `string | string[] | boolean`.
4. Unknown extra properties are preserved on import (forward tolerance within version 1).

## Import modes

| Mode | Behaviour |
|------|-----------|
| **Replace all** | Delete every `form:*` key, then write all imported forms |
| **Merge** | Upsert each imported form by `id`; on collision the imported form wins entirely (spec assumption — no per-dataset merging) |

Both modes finish by rewriting `meta.formatVersion` and require a user confirmation dialog
before applying (destructive operation — Constitution "User Control & Permissions").

## Round-trip guarantee

`export → wipe → import (replace all)` must restore byte-equivalent form and dataset data,
including `activeDatasetId` selections (SC-005 of the spec).

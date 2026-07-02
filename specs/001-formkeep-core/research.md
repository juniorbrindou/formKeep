# Research: formKeep Core

**Date**: 2026-07-02 | **Plan**: [plan.md](plan.md)

No NEEDS CLARIFICATION markers remained in the Technical Context; research below records the
technology decisions and the alternatives considered for each risky/ambiguous area.

## R1. Extension platform — Manifest V3

- **Decision**: Chrome Manifest V3, loaded unpacked for personal use.
- **Rationale**: MV2 is retired on current Chrome (extensions stop running); MV3 is the only
  supported target. Personal use avoids Web Store review constraints entirely.
- **Alternatives considered**: MV2 (rejected: deprecated/disabled); userscript via Tampermonkey
  (rejected: no popup UI, weaker storage and permission model).

## R2. Form identity — structure fingerprint

- **Decision**: Deterministic form ID = short hash of `origin + pathname` + the ordered list of
  field descriptors (`name|type` pairs) + a same-page occurrence index for otherwise identical
  forms. Query string and fragment are excluded. Attributes like `class`/`style` are ignored.
- **Rationale**: Survives reloads, sessions, and cosmetic DOM changes (FR-002, spec assumption);
  distinguishes duplicated forms via the occurrence index; no data written into the page DOM.
- **Alternatives considered**: XPath/CSS-selector paths (rejected: brittle on any layout change);
  random UUID persisted in DOM attributes (rejected: does not survive reload); URL-only keys
  (rejected: cannot separate multiple forms on one page).

## R3. Dynamic form detection — MutationObserver

- **Decision**: Initial scan at `document_idle`, then a single debounced (~300 ms)
  `MutationObserver` on `document.body` watching `childList` subtree changes; rescan only when
  added nodes contain form/input elements.
- **Rationale**: Catches SPA-injected forms and modals (Constitution V, FR-001) with negligible
  overhead; debounce keeps 20+ form pages under the perf budget (SC-004).
- **Alternatives considered**: Polling with `setInterval` (rejected: constant waste);
  load-time-only scan (rejected: misses SPA forms, violates Constitution V).

## R4. Submission capture — capture-phase `submit` listener + pseudo-form click hook

- **Decision**: One document-level `submit` listener in capture phase reads the tracked form's
  values synchronously before navigation, then writes to storage. For div-based pseudo-forms,
  hook the `click` on the detected submit control. Never call `preventDefault()`.
- **Rationale**: Synchronous value reading is safe even when the page immediately navigates;
  `chrome.storage.local.set` initiated before unload completes reliably. Site behavior is
  untouched (US2 scenario 5).
- **Alternatives considered**: `chrome.webRequest` (rejected: broad permissions, sees encoded
  payloads not DOM values, against Constitution I & IV spirit); `beforeunload` capture
  (rejected: unreliable, misses AJAX submits).

## R5. Component communication

- **Decision**: Popup → content script via `chrome.tabs.sendMessage` (query active tab);
  content → service worker via `chrome.runtime.sendMessage` for badge status only. Popup reads
  and writes `chrome.storage.local` directly for all dataset CRUD; content script listens to
  `chrome.storage.onChanged` to refresh its tracked-form set.
- **Rationale**: Storage as the single source of truth removes most message types (Constitution
  I); `onChanged` keeps content scripts in sync without a coordination layer.
- **Alternatives considered**: Routing all CRUD through the service worker (rejected:
  unnecessary indirection); long-lived ports (rejected: overkill for request/response needs).

## R6. Storage layout — per-form keys

- **Decision**: One `meta` key (`{ formatVersion: 1 }`) plus one `form:<formId>` key per tracked
  form containing its metadata and all its datasets (see data-model.md).
- **Rationale**: Partial reads/writes (a submit touches one key), trivial `get(null)` export,
  no index to keep consistent beyond key prefix scanning.
- **Alternatives considered**: Single monolithic key (rejected: every write rewrites all data);
  one key per dataset (rejected: more bookkeeping for no benefit at personal scale).

## R7. Code sharing without a build step

- **Decision**: `shared/fingerprint.js` and `shared/storage.js` are written as plain scripts
  attaching to a `globalThis.FormKeep` namespace, listed before `content.js` in the manifest's
  `content_scripts.js` array; popup and service worker load the same files via classic
  `<script>` / `importScripts`-compatible pattern.
- **Rationale**: Content scripts cannot be ES modules; a namespace object is the simplest
  no-build sharing mechanism that works in all three contexts (Constitution I).
- **Alternatives considered**: Bundler (esbuild/rollup — rejected: build step contradicts
  simplicity); duplicating code per context (rejected: divergence risk).

## R8. Export / import mechanics

- **Decision**: Export builds the `ExportBundle` (contracts/export-format.md) and downloads it
  via `Blob` + temporary object URL + `<a download>` from the popup. Import uses
  `<input type="file">` + `FileReader`, validates structure and `formatVersion` before any
  write, then applies "replace all" or "merge (imported wins)".
- **Rationale**: Zero permissions needed (no `downloads` API required for anchor download from
  the popup document); validation-before-write guarantees FR-012's no-damage rule.
- **Alternatives considered**: `chrome.downloads` API (rejected: extra permission for no gain);
  clipboard-based export (rejected: fragile for large data).

## R9. Badge signalling

- **Decision**: Content script sends the count of tracked forms with available data on the
  current page; service worker sets `chrome.action` badge text/color per tab. Empty badge when
  count is 0.
- **Rationale**: Satisfies US3 "extension signals that saved data is available" while remaining
  strictly non-intrusive — no page DOM modification, no injection (Constitution II).
- **Alternatives considered**: In-page floating button (rejected: modifies page appearance,
  against "never modify page content unexpectedly"); no signal (rejected: user cannot know data
  exists without opening the popup).

## R10. Permissions (manifest)

- **Decision**: `"permissions": ["storage", "activeTab"]`, `"content_scripts"` matched on
  `<all_urls>`, no `host_permissions` beyond that, no network-related permissions.
- **Rationale**: Minimal footprint; `<all_urls>` content script is required for the daily-use
  detection loop; `activeTab` covers popup→tab messaging.
- **Alternatives considered**: On-demand injection via `scripting` permission + user gesture
  (rejected: breaks passive detection and badge signalling that the spec requires).

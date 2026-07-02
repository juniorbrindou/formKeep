# Implementation Plan: formKeep Core — Form Tagging, Capture, Auto-Fill & Dataset Management

**Branch**: `001-formkeep-core` | **Date**: 2026-07-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-formkeep-core/spec.md`

## Summary

formKeep is a personal Chrome extension (Manifest V3, vanilla JavaScript, zero dependencies, no build step) that detects forms on visited pages, assigns them stable deterministic IDs via structure fingerprinting, lets the user tag forms to track, captures submitted values into named local datasets (`chrome.storage.local`), and refills forms in one click on return. A popup UI manages forms and datasets (CRUD, active-dataset selection) and provides full JSON export/import. A minimal background service worker updates the toolbar badge when saved data is available for the current page.

## Technical Context

**Language/Version**: JavaScript ES2022+ (vanilla, no TypeScript, no transpilation)

**Primary Dependencies**: None — plain browser + Chrome extension APIs only (Constitution I: no frameworks, no build toolchain)

**Storage**: `chrome.storage.local` exclusively (Constitution IV); per-form keys + meta key, format-versioned

**Testing**: Manual validation via local HTML fixture pages (`tests/fixtures/`) and the quickstart scenario guide — no automated test suite (explicit user decision)

**Target Platform**: Google Chrome desktop (stable channel), Manifest V3, loaded unpacked ("usage personnel", no Web Store publication required)

**Project Type**: Browser extension — content script + popup UI + minimal background service worker

**Performance Goals**: Form detection < 500ms on pages with 20+ forms; fill operation perceived as instant; zero user-perceptible page slowdown (SC-003, SC-004)

**Constraints**: Offline-first, strictly local data, no network calls of any kind, no data leaves the browser (Constitution IV); fill is always user-initiated (Constitution II)

**Scale/Scope**: Single user; order of dozens of tracked forms, hundreds of datasets; well under the 10 MB `chrome.storage.local` quota — `unlimitedStorage` permission not needed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Simplicity & Lightweight | Vanilla JS, no build step, no dependencies, 3 small runtime surfaces (content/popup/worker) | ✅ PASS |
| II. Explicit Consent (NON-NEGOTIABLE) | Fill only on user click (spec FR-007); capture only for user-tagged forms and only on the user's own submit action; badge signals, never injects | ✅ PASS |
| III. Data Portability (NON-NEGOTIABLE) | Export/import of full `ExportBundle` JSON from popup, format-versioned (FR-011/FR-012) | ✅ PASS |
| IV. Local Storage & Privacy | `chrome.storage.local` only; no host network permissions requested; no telemetry | ✅ PASS |
| V. Dynamic Form Compatibility | MutationObserver-based detection; fingerprint IDs survive reloads and minor DOM mutations (FR-001/FR-002) | ✅ PASS |

**Post-Phase-1 re-evaluation**: design artifacts introduce no additional projects, dependencies, or storage surfaces — all gates still ✅ PASS. Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-formkeep-core/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/
│   ├── messages.md      # Runtime message protocol (popup ↔ content ↔ worker)
│   └── export-format.md # ExportBundle JSON contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
extension/
├── manifest.json            # MV3 manifest: content script, action popup, service worker
├── content/
│   └── content.js           # Detection, fingerprinting, tagging hooks, capture, fill
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js             # Form list, dataset CRUD, export/import (ES module)
├── shared/
│   ├── fingerprint.js       # Deterministic form ID generation (loaded by content + popup)
│   └── storage.js           # Storage schema helpers, read/write, import/export logic
├── background/
│   └── service-worker.js    # Badge updates from content-script status messages
└── icons/
    └── icon-{16,32,48,128}.png

tests/
└── fixtures/
    ├── simple-form.html     # 1 standard form, all field types
    ├── multi-forms.html     # 3+ forms incl. two identical ones
    └── dynamic-form.html    # SPA-style late-injected form + pseudo-form (div-based)
```

**Structure Decision**: Single flat `extension/` directory loadable directly via `chrome://extensions` → "Load unpacked" — no build output directory. Shared logic (`shared/*.js`) is listed in the manifest's `content_scripts.js` array ahead of `content.js` (content scripts cannot use ES modules), and imported as ES modules by the popup and service worker. `tests/fixtures/` holds static HTML pages for manual validation per quickstart.md.

## Complexity Tracking

> No constitutional violations — table intentionally empty.

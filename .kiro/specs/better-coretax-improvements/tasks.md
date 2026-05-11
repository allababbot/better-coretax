# Implementation Plan: Better Coretax Improvements

## Overview

Implement 12 targeted improvements across five areas (reliability, UX, security, code quality, build hygiene) for the Better Coretax browser extension. Each task builds incrementally on the previous ones, wiring all changes together in the final integration step.

## Tasks

- [x] 1. Set up test infrastructure and ESLint configuration
  - Install Vitest and fast-check as dev dependencies: `npm install --save-dev vitest fast-check`
  - Add `"test": "vitest --run"` to `package.json` scripts
  - Add ESLint dev dependencies: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
  - Create `.eslintrc.json` at repo root with `@typescript-eslint/recommended` ruleset, `no-explicit-any: warn`, `ban-ts-comment: warn`
  - Add `"lint": "eslint 'src/**/*.ts'"` to `package.json` scripts
  - Pin `xlsx` to exact version `"0.18.5"` (remove `^` if present) in `package.json` dependencies
  - Create `src/tests/` directory with a `vitest.config.ts` or rely on default Vitest config
  - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 2. Refactor `downloader.ts` — ArrayBuffer-based `base64ToBlob` and `handlePdfDownload`
  - [x] 2.1 Rewrite `base64ToBlob` to use `Uint8Array.from(binary, c => c.charCodeAt(0))` instead of the intermediate `Array`
    - Add explicit empty-string guard that throws `Error("base64ToBlob: input is empty")`
    - Let `atob` propagate its native `DOMException` for invalid base64 inputs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Write property test for `base64ToBlob` round-trip (Property 1)
    - **Property 1: base64ToBlob round-trip**
    - Use `fc.base64String({ minLength: 1 })` as generator; convert to Blob, read ArrayBuffer, re-encode to base64, assert equality
    - Tag: `// Feature: better-coretax-improvements, Property 1: base64ToBlob round-trip`
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.3 Write property test for `base64ToBlob` invalid input rejection (Property 2)
    - **Property 2: base64ToBlob rejects invalid input**
    - Use `fc.string()` filtered to non-base64 strings plus `fc.constant("")`; assert `toThrow()`
    - Tag: `// Feature: better-coretax-improvements, Property 2: base64ToBlob rejects invalid input`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 2.4 Add `handlePdfDownload(base64, item, source)` exported function to `downloader.ts`
    - Calls `base64ToBlob`, selects filename generator based on `source`, calls `downloadBlob`
    - _Requirements: 11.2_

- [x] 3. Implement `applyFilters` in `filter.ts`
  - [x] 3.1 Implement the full `applyFilters` function body replacing the stub
    - Date range filter: exclude rows where `InvoiceDate` is missing/null/unparseable when any bound is set, or falls outside `[dateFrom, dateTo]` (inclusive)
    - Status filter: case-insensitive exact match on `Status` field; absent option passes all rows
    - Keyword filter: case-insensitive substring match across all string-typed field values; absent option passes all rows
    - _Requirements: 11.5 (a, b, c, d)_

  - [x] 3.2 Write property test for `applyFilters` date range exclusion (Property 3)
    - **Property 3: applyFilters date range exclusion**
    - Use `fc.array(rowArb)` and `fc.option(fc.date())` × 2; assert all returned rows have `InvoiceDate` within bounds and rows with missing/null date are excluded when bounds are set
    - Tag: `// Feature: better-coretax-improvements, Property 3: applyFilters date range exclusion`
    - **Validates: Requirements 11.5 (a, d)**

  - [x] 3.3 Write property test for `applyFilters` status match (Property 4)
    - **Property 4: applyFilters status match**
    - Use `fc.array(rowArb)` and `fc.string()`; assert all returned rows have `Status` matching option case-insensitively
    - Tag: `// Feature: better-coretax-improvements, Property 4: applyFilters status match`
    - **Validates: Requirements 11.5 (b)**

  - [x] 3.4 Write property test for `applyFilters` keyword match (Property 5)
    - **Property 5: applyFilters keyword match**
    - Use `fc.array(rowArb)` and `fc.string()`; assert all returned rows contain keyword in at least one string field
    - Tag: `// Feature: better-coretax-improvements, Property 5: applyFilters keyword match`
    - **Validates: Requirements 11.5 (c)**

  - [x] 3.5 Write property test for `applyFilters` empty options pass-through (Property 6)
    - **Property 6: applyFilters absent options pass all rows**
    - Use `fc.array(rowArb)` with empty `FilterOptions`; assert result equals input (same rows, same order)
    - Tag: `// Feature: better-coretax-improvements, Property 6: applyFilters absent options pass all rows`
    - **Validates: Requirements 11.5 (a, b, c)**

- [ ] 4. Refactor `exporter.ts` — flat `PREFIX_MAP` and `exportCSV`
  - [x] 4.1 Replace the nested ternary chain in `generateDynamicFilename` with a flat `PREFIX_MAP` record
    - Define `PREFIX_MAP: Record<ExportSource | "default", string>` covering all 11 `ExportSource` values plus `"default": "FPK-"`
    - Use `(source && source in PREFIX_MAP) ? PREFIX_MAP[source] : PREFIX_MAP["default"]` for prefix lookup
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 4.2 Write property test for `generateDynamicFilename` prefix consistency (Property 7)
    - **Property 7: generateDynamicFilename prefix consistency**
    - Use `fc.option(fc.constantFrom(...allExportSources, "UNKNOWN"))` and `fc.option(fc.string())`; assert refactored output equals original nested-ternary output for every combination
    - Tag: `// Feature: better-coretax-improvements, Property 7: generateDynamicFilename prefix consistency`
    - **Validates: Requirements 12.2, 12.3**

  - [x] 4.3 Implement `exportCSV` function in `exporter.ts`
    - Reuse `processData` and `generateDynamicFilename`; produce UTF-8 BOM-prefixed CSV
    - Apply `escapeCSV` to all values (wrap in double-quotes if value contains comma, double-quote, or newline; escape internal double-quotes by doubling)
    - Serialize `null`, `undefined`, and empty string as empty unquoted fields
    - Use `.csv` extension; filename logic identical to XLSX
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_

  - [-] 4.4 Write property test for CSV escaping round-trip (Property 8)
    - **Property 8: CSV escaping round-trip**
    - Use `fc.string()` and `fc.fullUnicodeString()` including strings with commas, double-quotes, and newlines; apply `escapeCSV`, parse result as RFC 4180 CSV field, assert recovery of original string
    - Tag: `// Feature: better-coretax-improvements, Property 8: CSV escaping round-trip`
    - **Validates: Requirements 6.5, 6.6**

- [x] 5. Checkpoint — Ensure all tests pass
  - Run `npm test` and verify all property and unit tests pass; ask the user if questions arise.

- [x] 6. Implement `shortcuts.ts` — keyboard shortcut registration
  - [x] 6.1 Implement `registerShortcuts(isRunning: () => boolean): void` in `shortcuts.ts`
    - Attach `keydown` listener; check `(e.ctrlKey || e.metaKey) && e.shiftKey`
    - `Ctrl/Cmd+Shift+E`: if `isSupportedExportPage()` and `!isRunning()`, dispatch `ch:scrape-toggle`; otherwise no-op
    - `Ctrl/Cmd+Shift+S`: if `isSupportedExportPage()` and `isRunning()`, send `STOP_SCRAPE` via `window.postMessage` with `window.location.origin`; otherwise no-op
    - Call `e.preventDefault()` only when action is taken
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 11.6_

- [ ] 7. Update `scraper.ts` — flag reset, PDF suppression, bulk progress, and origin hardening
  - [-] 7.1 Add `setProcessingFlag()` / `clearProcessingFlag()` helpers with 5-second safety timeout
    - `setProcessingFlag`: sets flag to `true`, clears any existing timer, schedules 5s reset with `console.warn`
    - `clearProcessingFlag`: sets flag to `false`, clears the timer
    - Replace all direct `isProcessingBetterDownload = true/false` assignments with these helpers
    - Call `clearProcessingFlag()` in every `catch` block and synchronously after each successful `window.postMessage` dispatch
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 7.2 Replace `Object.defineProperty` XHR sabotage with Fetch-only PDF suppression
    - Remove the `readystatechange` handler block that calls `Object.defineProperty` on `responseText`, `response`, `status`, `statusText`
    - Ensure the Fetch interceptor is the sole mechanism for `DownloadInvoice/download-invoice-document`
    - Fetch interceptor: call `setProcessingFlag()`, clone response, parse JSON, extract `pdfData`, dispatch `DOWNLOAD_PDF_ITEM` via `window.postMessage(…, window.location.origin)`, call `clearProcessingFlag()`, return synthetic `Response({ IsSuccessful: true, Content: "" }, 200)`
    - On parse failure: log error, call `clearProcessingFlag()`, return original response
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.3 Extend bulk download loop with `failureCount` and richer progress messages
    - Track `failureCount` variable initialised to `0` before the loop
    - Each iteration: send `SCRAPE_PROGRESS` with `currentIndex`, `totalCount`, `failureCount` fields
    - On `xhrDownloadPdf` failure: increment `failureCount`, log error, continue loop (do not abort)
    - Final `SCRAPE_COMPLETE` message: include `failureCount`
    - Progress bar fill: `(currentIndex / totalCount) * 100`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 7.4 Harden all `window.postMessage` calls in `scraper.ts` to use `window.location.origin`
    - Replace every `window.postMessage({ … }, "*")` with `window.postMessage({ … }, window.location.origin)`
    - Add `event.origin === window.location.origin` guard to both `message` event listeners in `scraper.ts`
    - _Requirements: 7.2, 7.4, 7.5_

- [ ] 8. Update `ui.ts` — dismissible bar, CSV button, and bulk download label
  - [-] 8.1 Add dismiss button and `showPanel()` to the floating bar
    - Add `#ch-dismiss-btn` (`×`) inside `#ch-floating-stats`, after the progress container
    - Wire dismiss button `click` → `statsEl.classList.add("ch-hidden")`
    - Wire badge `click` → remove `ch-hidden` from `statsEl` only if it currently has `ch-hidden` (no-op if already visible)
    - Export `showPanel(): void` that removes `ch-hidden` from `statsEl`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [-] 8.2 Replace single export button with XLSX + CSV buttons on non-withholding pages
    - On non-withholding pages, render two buttons: `ch-export-xlsx-btn` ("Export XLSX") and `ch-export-csv-btn` ("Export CSV")
    - Each button dispatches its own custom event: `ch:export-xlsx` and `ch:export-csv`
    - Withholding page retains single "Bulk Download PDF" button dispatching `ch:scrape-toggle`
    - Update `isInjected` / `isButtonPlacedCorrectly` / `removeExportButton` logic to handle two-button layout
    - _Requirements: 6.1_

  - [x] 8.3 Update bulk download button label during operation
    - In `updatePanelProgress`: when `isWithholdingPage()`, set export button label to "STOP Download"
    - In `updatePanelComplete` / `updatePanelError`: restore label to "Bulk Download PDF" on withholding page
    - _Requirements: 3.5, 3.6_

- [x] 9. Update `main.ts` — modular refactor, origin hardening, and new event wiring
  - [x] 9.1 Delegate `DOWNLOAD_PDF_ITEM` handling to `handlePdfDownload` from `downloader.ts`
    - Remove direct calls to `base64ToBlob`, `generateWithholdingFilename`, `generateOutputTaxFilename` from `main.ts`
    - Replace the `DOWNLOAD_PDF_ITEM` branch in the `window.addEventListener("message", …)` handler with a single call to `handlePdfDownload(base64, item, source)`
    - _Requirements: 11.1, 11.2_

  - [x] 9.2 Replace `ch:scrape-toggle` listener with `ch:export-xlsx` and `ch:export-csv` listeners
    - Remove the `ch:scrape-toggle` DOM event listener that called `exportXLSX`
    - Add `ch:export-xlsx` listener → call `exportXLSX(exportData)` with last scraped data
    - Add `ch:export-csv` listener → call `exportCSV(exportData)` with last scraped data
    - Retain `ch:scrape-toggle` listener only for the scrape start/stop toggle logic (not export)
    - _Requirements: 6.1, 11.1_

  - [x] 9.3 Call `registerShortcuts` during `init()` and harden `postMessage` origin
    - Import `registerShortcuts` from `shortcuts.ts` and call `registerShortcuts(() => isRunning)` inside `init()`
    - Replace every `window.postMessage({ … }, "*")` in `main.ts` with `window.postMessage({ … }, window.location.origin)`
    - Add `event.origin === window.location.origin` guard to the `window.addEventListener("message", …)` handler in `main.ts`
    - Call `showPanel()` from `ui.ts` at the start of `startScrape()` to auto-show the panel on new operations
    - _Requirements: 5.1, 7.1, 7.3, 4.6, 11.3_

- [x] 10. Write unit tests for pure functions
  - [x] 10.1 Write unit tests for `downloader.ts` functions
    - `base64ToBlob`: valid PDF base64, empty string throws, invalid base64 throws, correct MIME type
    - `generateWithholdingFilename`: normal item, missing date, missing number, special chars in name
    - `generateOutputTaxFilename`: normal item, missing reference, missing invoice number
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 10.2 Write unit tests for `exporter.ts` functions
    - `generateDynamicFilename`: all 11 `ExportSource` values, `undefined` source, various `filenameHint` formats
    - `escapeCSV`: plain string, comma-containing, quote-containing, newline-containing, null, undefined
    - _Requirements: 6.5, 6.6, 12.2, 12.3_

  - [x] 10.3 Write unit tests for `filter.ts`
    - `applyFilters`: date range (in-range, out-of-range, missing date), status match, keyword match, empty options
    - _Requirements: 11.5 (a, b, c, d)_

- [x] 11. Write property test for PostMessage origin guard (Property 9)
  - [x] 11.1 Write property test for PostMessage origin guard
    - **Property 9: PostMessage origin guard**
    - Use `fc.record({ sourceMatches: fc.boolean(), directionMatches: fc.boolean(), originMatches: fc.boolean() })` to generate all combinations; assert message is processed iff all three flags are true
    - Tag: `// Feature: better-coretax-improvements, Property 9: PostMessage origin guard`
    - **Validates: Requirements 7.3, 7.4, 7.5**

- [x] 12. Final checkpoint — Ensure all tests pass and lint is clean
  - Run `npm test` to verify all property and unit tests pass
  - Run `npm run lint` to verify no ESLint errors (warnings are acceptable)
  - Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Properties 1–9 from design)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout; all code should be `.ts` files under `src/`
- Test files should live under `src/tests/` and use Vitest + fast-check

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "4.2", "4.3"] },
    { "id": 3, "tasks": ["4.4", "7.1", "8.1", "8.2"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4", "8.3"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 6, "tasks": ["10.1", "10.2", "10.3", "11.1"] }
  ]
}
```

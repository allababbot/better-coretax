# Requirements Document

## Introduction

Better Coretax is a browser extension (Chrome + Firefox) that enhances the DJP Coretax tax portal. It intercepts paginated API responses from Angular-driven pages, scrapes tax data (e-Faktur output/input, SPT PPN, PPh 21/26, Withholding Slips), exports them to Excel, and bulk-downloads withholding slip PDFs with smart naming.

This document captures requirements for the most impactful improvements across five areas: reliability, UX, code quality, security, and build hygiene.

---

## Glossary

- **Extension**: The Better Coretax browser extension running as a content script on `coretaxdjp.pajak.go.id`.
- **Scraper**: The `scraper.ts` module injected into the page's MAIN world that intercepts XHR/fetch calls.
- **Content_Script**: The `main.ts` isolated-world script that bridges the Scraper and the popup/UI.
- **Downloader**: The `downloader.ts` module responsible for converting base64 PDF data to Blob and triggering browser downloads.
- **Exporter**: The `exporter.ts` module that transforms scraped data and writes XLSX or CSV files.
- **UI_Module**: The `ui.ts` module that injects buttons, filters, and the floating info bar into the Coretax DOM.
- **Floating_Bar**: The floating info bar injected by the UI_Module into the bottom-right corner of the page.
- **Bulk_Download**: The operation that fetches and saves all withholding slip PDFs for the currently loaded dataset.
- **isProcessingBetterDownload**: A boolean flag in the Scraper used to suppress native browser download behavior during PDF interception.
- **PostMessage_Channel**: The `window.postMessage` / `window.addEventListener("message")` channel used to communicate between the Scraper (MAIN world) and the Content_Script (isolated world).
- **XHR_Interceptor**: The `XMLHttpRequest.prototype` overrides in the Scraper that capture Angular's API requests.
- **Fetch_Interceptor**: The `window.fetch` override in the Scraper that intercepts PDF download API calls.
- **ExportSource**: A discriminated union type identifying which Coretax data source is being scraped (e.g., `OUTPUT_TAX`, `WITHHOLDING_SLIPS`).

---

## Requirements

### Requirement 1: Reliable PDF Download Flag Reset

**User Story:** As a user downloading output tax PDFs, I want the download process to never get permanently stuck, so that I can continue downloading other PDFs without reloading the page.

#### Acceptance Criteria

1. WHEN the `isProcessingBetterDownload` flag is set to `true` and no PDF base64 data has been successfully dispatched via PostMessage_Channel within 5 seconds, THE Scraper SHALL reset the flag to `false` and log a warning message.
2. WHEN a PDF download completes successfully (base64 data is dispatched via PostMessage_Channel), THE Scraper SHALL reset `isProcessingBetterDownload` to `false` synchronously in the same call frame as the `window.postMessage` dispatch, before any subsequent code in that handler executes.
3. WHEN an error occurs during PDF interception in the XHR `readystatechange` handler, THE Scraper SHALL reset `isProcessingBetterDownload` to `false` in the `catch` block before logging the error.
4. WHEN an error occurs during PDF interception in the `createObjectURL` or `window.open` override paths, THE Scraper SHALL reset `isProcessingBetterDownload` to `false` before the override function returns.

---

### Requirement 2: Efficient Base64-to-Blob Conversion

**User Story:** As a user bulk-downloading large withholding slip PDFs, I want the conversion from base64 to a downloadable file to be fast, so that the browser does not freeze or become unresponsive during bulk operations.

#### Acceptance Criteria

1. WHEN the Downloader converts any base64 string to a Blob, THE Downloader SHALL complete the conversion in under 100ms as measured from the function call to the returned Blob being available.
2. THE Downloader SHALL produce a `Blob` with MIME type `application/pdf` that is byte-for-byte identical to the original PDF data encoded in the base64 input.
3. WHEN the Downloader converts a valid base64 string to a Blob and the resulting Blob's `ArrayBuffer` is re-encoded to base64, THE resulting string SHALL equal the original base64 input (round-trip property).
4. WHEN the Downloader receives an invalid or malformed base64 string, THE Downloader SHALL throw a descriptive `Error` rather than returning a silently corrupted Blob.
5. WHEN the Downloader receives an empty string as input, THE Downloader SHALL throw an `Error` indicating the input is empty.

---

### Requirement 3: Per-Item Progress for Bulk PDF Download

**User Story:** As a user bulk-downloading withholding slip PDFs, I want to see which specific file is currently being downloaded and how many remain, so that I know the operation is progressing and can estimate completion time.

#### Acceptance Criteria

1. WHEN a Bulk_Download operation is in progress, THE Floating_Bar SHALL display the current item index (1-based), total item count, and the slip number of the item being downloaded (e.g., "Mengunduh 3/47: BP-2026-001").
2. WHEN a Bulk_Download operation is in progress, THE Floating_Bar SHALL display a progress bar whose fill percentage equals `(current_index / total_count) * 100`.
3. WHEN a single PDF download within a Bulk_Download fails, THE Floating_Bar SHALL display the failure count alongside the current progress without stopping the overall operation.
4. WHEN all items in a Bulk_Download have been attempted (whether successfully downloaded or failed), THE Floating_Bar SHALL display the total number of successfully downloaded PDFs and the count of any failures.
5. WHILE a Bulk_Download is in progress, THE UI_Module SHALL display the export button label as "STOP Download".
6. WHEN a Bulk_Download operation completes or is stopped by the user, THE UI_Module SHALL restore the export button label to "Bulk Download PDF".

---

### Requirement 4: Dismissible Floating Info Bar

**User Story:** As a user, I want to be able to dismiss the floating info bar after a scrape or download completes, so that it does not obscure the Coretax page content I need to review.

#### Acceptance Criteria

1. WHEN the Floating_Bar is first injected into the page, THE stats panel SHALL be hidden and only the compact "BC" badge SHALL be visible.
2. WHEN the stats panel is visible, THE Floating_Bar SHALL include a dismiss ("×") button that is visible alongside the stats content.
3. WHEN the user clicks the dismiss button, THE Floating_Bar SHALL hide the stats panel and show only the compact "BC" badge; the dismiss button SHALL also be hidden.
4. WHEN the user clicks the "BC" badge while the stats panel is hidden, THE Floating_Bar SHALL re-show the stats panel and the dismiss button.
5. WHEN the user clicks the "BC" badge while the stats panel is already visible, THE Floating_Bar SHALL take no action.
6. WHEN a new scrape or download operation starts, THE Floating_Bar SHALL automatically re-show the stats panel and the dismiss button regardless of the previous dismissed state.

---

### Requirement 5: Keyboard Shortcuts

**User Story:** As a power user, I want keyboard shortcuts to trigger common extension actions, so that I can operate the extension without moving my hands to the mouse.

#### Acceptance Criteria

1. WHEN `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (macOS) is pressed on a supported export page and no scrape or download is in progress, THE Extension SHALL dispatch the `ch:scrape-toggle` custom DOM event to start the appropriate action (export on e-Faktur/SPT pages, bulk download on the withholding slips page).
2. WHEN `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (macOS) is pressed and a scrape or download is in progress, THE Extension SHALL dispatch a `STOP_SCRAPE` message via `window.postMessage` to stop the operation.
3. WHEN `Ctrl+Shift+S` is pressed and no operation is in progress, THE Extension SHALL take no action and SHALL NOT throw an error.
4. WHEN `Ctrl+Shift+E` is pressed while an operation is already running, THE Extension SHALL take no action and SHALL NOT throw an error.
5. WHEN either keyboard shortcut is triggered on an unsupported page (i.e., `isSupportedExportPage()` returns `false`), THE Extension SHALL take no action and SHALL NOT throw an error.
6. THE `shortcuts.ts` module SHALL export a `registerShortcuts(isRunning: () => boolean): void` function that attaches `keydown` listeners implementing the behaviors described in criteria 1–5.

---

### Requirement 6: CSV Export Option

**User Story:** As a user, I want to export scraped data as CSV in addition to XLSX, so that I can open the data in tools that do not support Excel format.

#### Acceptance Criteria

1. WHEN a scrape completes on a non-withholding page, THE UI_Module SHALL render two distinct export buttons: one labelled "Export XLSX" and one labelled "Export CSV".
2. WHEN the user clicks "Export CSV", THE Exporter SHALL produce a UTF-8 BOM-prefixed CSV file using the same field selection and date formatting logic as the XLSX export.
3. WHEN the user clicks "Export XLSX", THE Exporter SHALL produce an XLSX file with a single worksheet named "Faktur", populated via the `processData` pipeline, identical to the current behavior.
4. THE Exporter SHALL apply the same `generateDynamicFilename` logic to both CSV and XLSX outputs, differing only in the file extension (`.csv` vs `.xlsx`).
5. WHEN a CSV value contains a comma, double-quote, or newline character, THE Exporter SHALL wrap the value in double-quotes and escape internal double-quotes by doubling them.
6. WHEN a field value is `null`, `undefined`, or an empty string, THE Exporter SHALL serialize it as an empty unquoted field in the CSV output.

---

### Requirement 7: Targeted PostMessage Origin

**User Story:** As a security-conscious user, I want the extension to restrict its internal messages to the Coretax origin, so that malicious third-party frames cannot intercept or inject scrape commands.

#### Acceptance Criteria

1. WHEN the Content_Script sends any message to the Scraper via `window.postMessage` (including `START_SCRAPE`, `STOP_SCRAPE`, and `SET_SERVER_FILTER`), THE Content_Script SHALL use `window.location.origin` as the `targetOrigin` argument instead of `"*"`.
2. WHEN the Scraper sends any message to the Content_Script via `window.postMessage` (including `SCRAPE_PROGRESS`, `SCRAPE_COMPLETE`, `SCRAPE_ERROR`, `DOWNLOAD_PDF_ITEM`, and `INJECTED_READY`), THE Scraper SHALL use `window.location.origin` as the `targetOrigin` argument instead of `"*"`.
3. WHEN the Content_Script receives a `message` event, THE Content_Script SHALL process the message only if `event.source === window`, `event.data.direction === "FROM_PAGE"`, and `event.origin === window.location.origin`; all three conditions must be true.
4. WHEN the Scraper receives a `message` event, THE Scraper SHALL process the message only if `event.source === window`, `event.data.direction === "FROM_CONTENT"`, and `event.origin === window.location.origin`; all three conditions must be true.
5. IF any of the three guard conditions in criteria 3 or 4 are not met, THE receiver SHALL discard the message without logging its contents.

---

### Requirement 8: Robust PDF Response Suppression

**User Story:** As a developer maintaining the extension, I want the PDF download interception to avoid `Object.defineProperty` sabotage of XHR response properties, so that the extension does not break when Angular or browser updates change XHR property descriptors.

#### Acceptance Criteria

1. WHEN the Fetch_Interceptor intercepts a PDF download request to `DownloadInvoice/download-invoice-document`, THE Fetch_Interceptor SHALL extract the base64 PDF data from the response JSON, dispatch it via `window.postMessage` as a `DOWNLOAD_PDF_ITEM` message, and then return a synthetic `Response` with body `{ "IsSuccessful": true, "Content": "" }` and HTTP status 200 to the Angular application.
2. WHEN the Fetch_Interceptor intercepts a PDF download request and the response JSON is successfully parsed, THE Fetch_Interceptor SHALL return the synthetic response described in criterion 1 so that the Angular application does not display a download error.
3. THE Scraper SHALL contain no calls to `Object.defineProperty` targeting `responseText`, `response`, `status`, or `statusText` on any XHR instance.
4. IF the Fetch_Interceptor is unable to parse the PDF response JSON (e.g., the response is not valid JSON or the expected fields are absent), THEN THE Fetch_Interceptor SHALL log the error and return the original unmodified `Response` object to the Angular application.

---

### Requirement 9: Pinned xlsx Dependency

**User Story:** As a developer building the extension, I want the `xlsx` dependency to be pinned to an exact version, so that builds are reproducible and a surprise upstream update cannot break the export functionality.

#### Acceptance Criteria

1. THE `package.json` `dependencies` field SHALL specify `xlsx` with an exact version string (e.g., `"0.18.5"`) with no `^`, `~`, `>`, `>=`, `<`, `<=`, or `*` prefix or suffix.
2. WHEN `npm install` is run after deleting `node_modules` and `package-lock.json`, THE version of `xlsx` installed under `node_modules/xlsx/package.json` SHALL equal the exact version string specified in `package.json`.
3. THE `package-lock.json` SHALL contain an entry for `xlsx` whose `"version"` field equals the exact version string specified in `package.json` `dependencies`.

---

### Requirement 10: ESLint Configuration

**User Story:** As a developer contributing to the extension, I want a linting configuration to be present, so that code style and common TypeScript errors are caught before they reach the build.

#### Acceptance Criteria

1. THE project SHALL include an ESLint configuration file named `.eslintrc.json` at the repository root.
2. THE ESLint configuration SHALL enable the `@typescript-eslint/recommended` rule set.
3. THE ESLint configuration SHALL set the `@typescript-eslint/no-explicit-any` rule to `"warn"`.
4. THE ESLint configuration SHALL set the `@typescript-eslint/ban-ts-comment` rule to `"warn"`.
5. WHEN `npm run lint` is executed and ESLint finds one or more rule violations classified as errors, THE process SHALL exit with a non-zero exit code.
6. WHEN `npm run lint` is executed and ESLint finds only warnings (no errors), THE process SHALL exit with code 0.
7. THE `package.json` `scripts` field SHALL include a `"lint"` entry with value `"eslint 'src/**/*.ts'"`.
8. THE `package.json` `devDependencies` field SHALL include `eslint` and `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` as entries.

---

### Requirement 11: Modular Content Script Architecture

**User Story:** As a developer maintaining the extension, I want `main.ts` to be split into focused modules, so that each concern is independently readable, testable, and modifiable without risk of breaking unrelated functionality.

#### Acceptance Criteria

1. THE Content_Script SHALL be refactored so that `main.ts` contains only message relay logic (receiving from the popup via `browser.runtime.onMessage` and forwarding to the page via `window.postMessage`, and vice versa), initialization orchestration (calling `init()` and `onNavigate()`), and scrape state management, with no calls to DOM mutation functions or PDF processing functions defined outside those responsibilities.
2. THE Downloader module SHALL own all PDF blob conversion and filename generation logic; `main.ts` SHALL contain no direct calls to `base64ToBlob`, `generateWithholdingFilename`, or `generateOutputTaxFilename` except through an imported handler function defined in `downloader.ts`.
3. THE UI_Module SHALL own all DOM mutation and panel update logic; `main.ts` SHALL contain no direct calls to DOM APIs (e.g., `document.createElement`, `document.querySelector`, `document.addEventListener` for UI events) except for: (a) the `MutationObserver` on `document.body` required for SPA navigation detection, (b) the `<script>` element injection in `injectScraper()`, and (c) the `keyup` listener for the reference filter input.
4. WHEN `main.ts` is refactored, THE existing exported function signatures of `downloader.ts`, `exporter.ts`, and `ui.ts` SHALL remain unchanged so that no call sites outside those modules need updating.
5. THE `filter.ts` module SHALL implement the `applyFilters` function such that: (a) rows are excluded if their `InvoiceDate` field value, parsed as an ISO 8601 date string, falls before `dateFrom` or after `dateTo` (both bounds inclusive; a missing or undefined filter option means that bound is not applied); (b) rows are excluded if their `Status` field value does not equal the `status` option using a case-insensitive exact match (absent `status` option passes all rows); (c) rows are excluded if none of their string field values contain the `keyword` option as a case-insensitive substring (absent `keyword` option passes all rows); and (d) rows with a missing or null `InvoiceDate` field are excluded when either `dateFrom` or `dateTo` is specified.
6. THE `shortcuts.ts` module SHALL implement the `registerShortcuts` function to attach `keydown` listeners that: (a) trigger the `ch:scrape-toggle` custom DOM event when `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (macOS) is pressed; (b) dispatch a `STOP_SCRAPE` message via `window.postMessage` when `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (macOS) is pressed; (c) take no action and throw no error when triggered on an unsupported page (i.e., when `isSupportedExportPage()` returns `false`); and (d) ignore the start shortcut when a scrape is already in progress.

---

### Requirement 12: Eliminate Deeply Nested Ternary Chains in Exporter

**User Story:** As a developer reading the export code, I want the filename prefix and period formatting logic to use readable control flow instead of deeply nested ternary expressions, so that I can understand and modify the logic without introducing bugs.

#### Acceptance Criteria

1. THE `generateDynamicFilename` function in `exporter.ts` SHALL replace all ternary chains with a flat lookup map (e.g., `Record<ExportSource | "default", string>`) that covers all 11 `ExportSource` values (`OUTPUT_TAX`, `INPUT_TAX`, `OUTPUT_RETURN`, `INPUT_RETURN`, `SPT_A2`, `SPT_B2`, `PPH_21_L1A`, `PPH_21_L1B`, `PPH_21_L2`, `PPH_21_L3`, `WITHHOLDING_SLIPS`) plus a `"default"` fallback, with no ternary nesting.
2. WHEN `generateDynamicFilename` is called with any valid `ExportSource` value and a representative set of `filenameHint` inputs (including `undefined`, a valid period string, and an invalid/empty string), THE refactored function SHALL return the same filename string as the original implementation for each input combination.
3. WHEN `generateDynamicFilename` is called with `source` set to `undefined` or an unrecognized value, THE refactored function SHALL return a filename using the `"FPK-"` prefix (the existing default fallback behavior).

# Design Document: Better Coretax Improvements

## Overview

Better Coretax is a browser extension (Chrome + Firefox, Manifest V3) that enhances the DJP Coretax tax portal at `coretaxdjp.pajak.go.id`. It operates as two cooperating scripts:

- **`main.js`** — runs in the browser's *isolated world*, has access to `browser.runtime` APIs, bridges the popup and the in-page scraper, and manages the UI panel.
- **`scraper.js`** — injected into the page's *MAIN world* by `main.js`, intercepts Angular's XHR/fetch calls, paginates through API responses, and dispatches results back via `window.postMessage`.

This design covers 12 targeted improvements across five areas:

| Area | Requirements |
|---|---|
| Reliability | 1 (flag reset), 2 (base64 conversion), 8 (PDF suppression) |
| UX | 3 (bulk progress), 4 (dismissible bar), 5 (keyboard shortcuts), 6 (CSV export) |
| Security | 7 (postMessage origin) |
| Code Quality | 11 (modular architecture), 12 (ternary elimination) |
| Build Hygiene | 9 (pinned xlsx), 10 (ESLint) |

No new external runtime dependencies are introduced. The only dependency change is pinning `xlsx` to an exact version and adding ESLint dev-dependencies.

---

## Architecture

### Execution Contexts

```mermaid
graph TD
    subgraph Browser Extension
        BG[background.ts<br/>Service Worker]
        POPUP[popup<br/>browser.runtime]
    end

    subgraph Page — Isolated World
        MAIN[main.ts<br/>Content Script Bridge]
    end

    subgraph Page — MAIN World
        SCRAPER[scraper.ts<br/>XHR/Fetch Interceptor]
    end

    subgraph Modules imported by main.ts
        UI[ui.ts]
        DL[downloader.ts]
        EXP[exporter.ts]
        SC[shortcuts.ts]
        PC[page-context.ts]
    end

    POPUP <-->|browser.runtime.sendMessage| MAIN
    BG <-->|browser.runtime| MAIN
    MAIN <-->|window.postMessage<br/>origin-checked| SCRAPER
    MAIN --> UI
    MAIN --> DL
    MAIN --> EXP
    MAIN --> SC
    MAIN --> PC
    SCRAPER --> PC
```

### Message Flow (Post-Improvement)

All `window.postMessage` calls use `window.location.origin` as `targetOrigin` (Req 7). All `message` event listeners validate `event.origin === window.location.origin` in addition to the existing `event.source` and `event.data.direction` guards.

```
Popup ──runtime.sendMessage──► main.ts
                                  │ postMessage(origin)
                                  ▼
                              scraper.ts  ──XHR/Fetch──► Coretax API
                                  │ postMessage(origin)
                                  ▼
                              main.ts ──► ui.ts (panel updates)
                                      ──► downloader.ts (PDF blobs)
                                      ──► exporter.ts (XLSX/CSV)
                                      ──runtime.sendMessage──► Popup
```

### Module Responsibilities (Post-Refactor)

| Module | Responsibility |
|---|---|
| `main.ts` | Message relay (popup ↔ page), init/navigation orchestration, scrape state (`isRunning`, `lastState`, `scrapedData`) |
| `scraper.ts` | XHR/fetch interception, pagination loop, bulk PDF download loop, postMessage dispatch |
| `downloader.ts` | `base64ToBlob` (ArrayBuffer-based), `downloadBlob`, filename generators, `handlePdfDownload` handler |
| `exporter.ts` | `exportXLSX`, `exportCSV`, `generateDynamicFilename` (flat map), `processData` |
| `ui.ts` | All DOM injection (badge, export buttons, filters, floating bar), panel state updates, dismiss logic |
| `shortcuts.ts` | `registerShortcuts(isRunning)` — keydown listeners for Ctrl+Shift+E/S |
| `filter.ts` | `applyFilters` — date range, status, keyword filtering on scraped rows |
| `page-context.ts` | URL-based page detection, `ExportSource` type, filename hint extraction |

---

## Components and Interfaces

### 1. `downloader.ts` — ArrayBuffer-based base64ToBlob (Req 2)

The current `charCodeAt` loop allocates a full intermediate `Array` before constructing the `Uint8Array`. The replacement uses `atob` + `Uint8Array.from` with a typed callback, which avoids the intermediate array and is significantly faster for large PDFs.

```typescript
export function base64ToBlob(base64: string, mimeType = "application/pdf"): Blob {
  if (!base64) throw new Error("base64ToBlob: input is empty");
  // atob throws a DOMException on invalid base64 — let it propagate
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}
```

A new exported handler function centralises PDF dispatch handling so `main.ts` no longer calls `base64ToBlob` directly (Req 11):

```typescript
export function handlePdfDownload(
  base64: string,
  item: Record<string, unknown>,
  source: string,
): void {
  const blob = base64ToBlob(base64);
  const filename =
    source === "OUTPUT_TAX"
      ? generateOutputTaxFilename(item as any)
      : generateWithholdingFilename(item as WithholdingSlip);
  downloadBlob(blob, filename);
}
```

### 2. `scraper.ts` — Reliable Flag Reset (Req 1)

The `isProcessingBetterDownload` flag is guarded by a `clearTimeout`/`setTimeout` pattern. Every code path that sets the flag to `true` also schedules a 5-second safety reset. Every code path that successfully dispatches the PDF resets the flag synchronously before returning.

```typescript
let isProcessingBetterDownload = false;
let processingResetTimer: ReturnType<typeof setTimeout> | null = null;

function setProcessingFlag(): void {
  isProcessingBetterDownload = true;
  if (processingResetTimer) clearTimeout(processingResetTimer);
  processingResetTimer = setTimeout(() => {
    if (isProcessingBetterDownload) {
      console.warn("[Better Coretax] isProcessingBetterDownload reset by timeout");
      isProcessingBetterDownload = false;
    }
    processingResetTimer = null;
  }, 5000);
}

function clearProcessingFlag(): void {
  isProcessingBetterDownload = false;
  if (processingResetTimer) {
    clearTimeout(processingResetTimer);
    processingResetTimer = null;
  }
}
```

`setProcessingFlag()` is called at the start of each interception path; `clearProcessingFlag()` is called synchronously after a successful `window.postMessage` dispatch and in every `catch` block.

### 3. `scraper.ts` — Robust PDF Response Suppression (Req 8)

The `Object.defineProperty` sabotage of XHR response properties is removed entirely. Instead, the Fetch interceptor is the sole mechanism for intercepting `DownloadInvoice/download-invoice-document` calls. The XHR `readystatechange` handler for that URL is removed. The Fetch interceptor returns a synthetic `Response` to Angular:

```typescript
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url;
  if (url?.includes("DownloadInvoice/download-invoice-document")) {
    setProcessingFlag();
    try {
      const resp = await origFetch.apply(window, args);
      const json = await resp.clone().json();
      const pdfData =
        json.Content ?? json.Payload?.Content ?? json.Payload?.Message?.Data;
      if (pdfData) {
        window.postMessage(
          { type: "DOWNLOAD_PDF_ITEM", base64: pdfData, item: {}, source: "OUTPUT_TAX", direction: "FROM_PAGE" },
          window.location.origin,
        );
      }
      clearProcessingFlag();
      return new Response(JSON.stringify({ IsSuccessful: true, Content: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Better Coretax] Fetch interceptor error:", err);
      clearProcessingFlag();
      return origFetch.apply(window, args);
    }
  }
  return origFetch.apply(window, args);
};
```

### 4. `scraper.ts` — Per-Item Bulk Download Progress (Req 3)

The bulk download loop in `startScraping()` is extended to track `failureCount` and send richer progress messages. A new `SCRAPE_PROGRESS` payload shape carries `currentIndex`, `totalCount`, and `failureCount`:

```typescript
// Extended progress message for bulk download
interface BulkDownloadProgress {
  type: "SCRAPE_PROGRESS";
  total: number;
  page: number;
  elapsed: string;
  status: string;
  currentIndex?: number;   // 1-based
  totalCount?: number;
  failureCount?: number;
}
```

The loop:

```typescript
let failureCount = 0;
for (let i = 0; i < total; i++) {
  if (stopRequested) break;
  const row = allData[i];
  sendToContent({
    type: "SCRAPE_PROGRESS",
    total: i + 1,
    page,
    elapsed: totalElapsed,
    status: `Mengunduh ${i + 1}/${total}: ${row.WithholdingSlipNumber ?? "..."}`,
    currentIndex: i + 1,
    totalCount: total,
    failureCount,
  });
  try {
    const base64 = await xhrDownloadPdf(captured, row);
    window.postMessage(
      { type: "DOWNLOAD_PDF_ITEM", base64, item: row, direction: "FROM_PAGE" },
      window.location.origin,
    );
    await delay(800);
  } catch (err) {
    failureCount++;
    console.error(`[Scraper] Gagal unduh PDF idx ${i}:`, err);
  }
}
// Final completion message includes failure count
sendToContent({
  type: "SCRAPE_COMPLETE",
  ...,
  failureCount,
});
```

### 5. `ui.ts` — Dismissible Floating Bar (Req 4)

The floating bar gains a dismiss button (`×`) and the badge click handler is wired to toggle visibility. CSS class `ch-hidden` controls visibility. A new `showPanel()` helper is called at the start of every operation.

New DOM structure:

```
#ch-floating-info-container
  ├── #ch-floating-stats          (hidden by default via ch-hidden)
  │     ├── .ch-f-stat-item × 3  (Data, Hal, Waktu)
  │     ├── #ch-f-status
  │     ├── .ch-f-progress-container > #ch-f-progress-bar
  │     └── #ch-dismiss-btn      (×)
  └── #ch-badge                  (BC)
```

Badge click handler:

```typescript
badgeEl.addEventListener("click", () => {
  if (statsEl && statsEl.classList.contains("ch-hidden")) {
    statsEl.classList.remove("ch-hidden");
  }
  // No action if already visible (Req 4.5)
});
```

Dismiss button handler:

```typescript
dismissBtn.addEventListener("click", () => {
  statsEl?.classList.add("ch-hidden");
});
```

`showPanel()` — called at the start of every operation (Req 4.6):

```typescript
export function showPanel(): void {
  statsEl?.classList.remove("ch-hidden");
}
```

### 6. `ui.ts` — CSV Export Button (Req 6)

On non-withholding pages, `injectExportButton` renders two buttons side-by-side instead of one. The existing `ch:scrape-toggle` event is replaced by two separate events: `ch:export-xlsx` and `ch:export-csv`. The withholding page retains its single "Bulk Download PDF" button.

```typescript
// Two-button layout for export pages
const xlsxBtn = createExportButton("ch-export-xlsx-btn", "Export XLSX", "pi-file-excel");
const csvBtn  = createExportButton("ch-export-csv-btn",  "Export CSV",  "pi-file");

xlsxBtn.addEventListener("click", () =>
  document.dispatchEvent(new CustomEvent("ch:export-xlsx")));
csvBtn.addEventListener("click", () =>
  document.dispatchEvent(new CustomEvent("ch:export-csv")));
```

`main.ts` listens for both events and calls `exportXLSX` / `exportCSV` respectively with the last scraped data.

### 7. `shortcuts.ts` — Keyboard Shortcuts (Req 5)

```typescript
export function registerShortcuts(isRunning: () => boolean): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || !e.shiftKey) return;

    if (e.key === "E" || e.key === "e") {
      e.preventDefault();
      if (!isSupportedExportPage()) return;
      if (isRunning()) return;
      document.dispatchEvent(new CustomEvent("ch:scrape-toggle"));
    }

    if (e.key === "S" || e.key === "s") {
      e.preventDefault();
      if (!isSupportedExportPage()) return;
      if (!isRunning()) return;
      window.postMessage(
        { type: "STOP_SCRAPE", direction: "FROM_CONTENT" },
        window.location.origin,
      );
    }
  });
}
```

### 8. `exporter.ts` — Flat Prefix Map (Req 12)

The deeply nested ternary chain in `generateDynamicFilename` is replaced with a `Record`:

```typescript
const PREFIX_MAP: Record<ExportSource | "default", string> = {
  OUTPUT_TAX:    "FPK-",
  INPUT_TAX:     "FPM-",
  OUTPUT_RETURN: "RET-FPK-",
  INPUT_RETURN:  "RET-FPM-",
  SPT_A2:        "A2-",
  SPT_B2:        "B2-",
  PPH_21_L1A:    "PPH21-L1A-",
  PPH_21_L1B:    "PPH21-L1B-",
  PPH_21_L2:     "PPH21-L2-",
  PPH_21_L3:     "PPH21-L3-",
  WITHHOLDING_SLIPS: "BP-",
  default:       "FPK-",
};

const prefix = (source && source in PREFIX_MAP)
  ? PREFIX_MAP[source as ExportSource]
  : PREFIX_MAP["default"];
```

### 9. `main.ts` — Modular Refactor (Req 11)

`main.ts` is trimmed to its core responsibilities. The `DOWNLOAD_PDF_ITEM` handler delegates entirely to `handlePdfDownload` from `downloader.ts`. The `ch:scrape-toggle` listener is replaced by `ch:export-xlsx` and `ch:export-csv` listeners that call `exportXLSX`/`exportCSV`. `registerShortcuts` is called during `init()`.

Retained in `main.ts`:
- `browserAPI.runtime.onMessage` listener (popup relay)
- `window.addEventListener("message", ...)` (page relay)
- `MutationObserver` on `document.body` (SPA navigation)
- `injectScraper()` (script element injection)
- `keyup` listener for reference filter inputs
- `startScrape()`, `onNavigate()`, `init()` orchestration

Removed from `main.ts` (moved to owning modules):
- Direct `base64ToBlob` / filename generator calls → `downloader.ts`
- `ch:scrape-toggle` DOM event listener → replaced by `ch:export-xlsx` / `ch:export-csv`

### 10. `filter.ts` — applyFilters Implementation (Req 11.5)

```typescript
export function applyFilters(
  data: Record<string, unknown>[],
  options: FilterOptions,
): Record<string, unknown>[] {
  return data.filter((row) => {
    // Date range filter
    if (options.dateFrom || options.dateTo) {
      const raw = row["InvoiceDate"];
      if (raw == null) return false;
      const d = new Date(String(raw));
      if (isNaN(d.getTime())) return false;
      if (options.dateFrom && d < new Date(options.dateFrom)) return false;
      if (options.dateTo   && d > new Date(options.dateTo))   return false;
    }
    // Status filter (case-insensitive exact match)
    if (options.status !== undefined) {
      const rowStatus = String(row["Status"] ?? "");
      if (rowStatus.toLowerCase() !== options.status.toLowerCase()) return false;
    }
    // Keyword filter (case-insensitive substring in any string field)
    if (options.keyword !== undefined) {
      const kw = options.keyword.toLowerCase();
      const match = Object.values(row).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(kw),
      );
      if (!match) return false;
    }
    return true;
  });
}
```

### 11. Build & Tooling (Req 9, 10)

**`package.json` changes:**
- `"xlsx": "0.18.5"` (exact, no `^`)
- Add `devDependencies`: `"eslint"`, `"@typescript-eslint/eslint-plugin"`, `"@typescript-eslint/parser"`
- Add `"lint": "eslint 'src/**/*.ts'"` to `scripts`

**`.eslintrc.json`** (new file at repo root):
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint"],
  "extends": ["plugin:@typescript-eslint/recommended"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/ban-ts-comment": "warn"
  }
}
```

---

## Data Models

### Extended `ScrapeProgress` (Req 3)

```typescript
interface ScrapeProgress {
  type: "SCRAPE_PROGRESS";
  total: number;
  page: number;
  elapsed: string;
  status: string;
  // New fields for bulk download progress
  currentIndex?: number;   // 1-based position in bulk download
  totalCount?: number;     // total items in bulk download
  failureCount?: number;   // cumulative failures so far
}
```

### Extended `ScrapeComplete` (Req 3)

```typescript
interface ScrapeComplete {
  type: "SCRAPE_COMPLETE";
  data: Record<string, unknown>[];
  fields: string[];
  total: number;
  pages: number;
  elapsed: string;
  filenameHint?: string;
  source: ExportSource;
  failureCount?: number;   // total failures in bulk download
}
```

### `ExportData` (unchanged public interface)

```typescript
export interface ExportData {
  data: Record<string, unknown>[];
  fields: string[];
  filenameHint?: string;
  source?: ExportSource;
}
```

### `FilterOptions` (Req 11.5)

```typescript
export interface FilterOptions {
  dateFrom?: string;   // ISO 8601 date string, inclusive lower bound
  dateTo?: string;     // ISO 8601 date string, inclusive upper bound
  status?: string;     // case-insensitive exact match on "Status" field
  keyword?: string;    // case-insensitive substring match across all string fields
}
```

### `PREFIX_MAP` (Req 12)

```typescript
type PrefixKey = ExportSource | "default";
const PREFIX_MAP: Record<PrefixKey, string> = { ... };
```

### Floating Bar State (Req 4)

The floating bar's visibility is managed entirely through CSS class toggling on `#ch-floating-stats`. No new state variables are needed beyond the existing `statsEl` and `badgeEl` module-level references.

```
statsEl.classList.contains("ch-hidden") === true  → panel hidden, badge visible
statsEl.classList.contains("ch-hidden") === false → panel visible, dismiss button visible
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: base64ToBlob round-trip

*For any* non-empty, valid base64-encoded string, converting it to a `Blob` via `base64ToBlob` and then reading the `Blob`'s `ArrayBuffer` and re-encoding it to base64 SHALL produce a string byte-for-byte equal to the original input.

**Validates: Requirements 2.2, 2.3**

---

### Property 2: base64ToBlob rejects invalid input

*For any* string that is either empty or contains characters outside the base64 alphabet (i.e., is not decodable by `atob`), calling `base64ToBlob` SHALL throw an `Error` rather than returning a silently corrupted `Blob`.

**Validates: Requirements 2.4, 2.5**

---

### Property 3: applyFilters date range exclusion

*For any* array of rows and any combination of `dateFrom` / `dateTo` bounds, every row returned by `applyFilters` SHALL have an `InvoiceDate` that parses to a date within the specified bounds (inclusive on both ends), and every row whose `InvoiceDate` is missing, `null`, or unparseable SHALL be excluded whenever at least one bound is specified.

**Validates: Requirements 11.5 (a, d)**

---

### Property 4: applyFilters status match

*For any* array of rows and any non-`undefined` `status` option, every row returned by `applyFilters` SHALL have a `Status` field value that equals the `status` option under case-insensitive comparison, and no row with a differing `Status` value SHALL appear in the result.

**Validates: Requirements 11.5 (b)**

---

### Property 5: applyFilters keyword match

*For any* array of rows and any non-`undefined` `keyword` option, every row returned by `applyFilters` SHALL contain the keyword as a case-insensitive substring in at least one of its string-typed field values, and no row that lacks the keyword in all string fields SHALL appear in the result.

**Validates: Requirements 11.5 (c)**

---

### Property 6: applyFilters absent options pass all rows

*For any* array of rows and an empty `FilterOptions` object (all four options absent), `applyFilters` SHALL return every row in the input unchanged, in the same order.

**Validates: Requirements 11.5 (a, b, c)**

---

### Property 7: generateDynamicFilename prefix consistency

*For any* `ExportSource` value (including all 11 named sources, `undefined`, and unrecognised strings) and any `filenameHint` input (including `undefined`, a valid period string, and an empty string), the refactored `generateDynamicFilename` using the flat `PREFIX_MAP` SHALL return the same filename string as the original nested-ternary implementation.

**Validates: Requirements 12.2, 12.3**

---

### Property 8: CSV escaping round-trip

*For any* string value (including strings containing commas, double-quotes, newline characters, or being empty), applying `escapeCSV` and then parsing the result as a single RFC 4180 CSV field SHALL recover the original string value exactly.

**Validates: Requirements 6.5, 6.6**

---

### Property 9: PostMessage origin guard

*For any* message event delivered to either the Content_Script or the Scraper, the message SHALL be processed if and only if all three of the following conditions hold simultaneously: `event.source === window`, the `direction` field matches the expected direction for that receiver, and `event.origin === window.location.origin`. Any event where one or more conditions fail SHALL be silently discarded with no side effects.

**Validates: Requirements 7.3, 7.4, 7.5**

---

## Error Handling

### PDF Download Interception Errors

- **Fetch interceptor parse failure** (Req 8.4): If `resp.clone().json()` throws, the interceptor logs the error and returns the original `Response` unmodified. `clearProcessingFlag()` is called in the `catch` block.
- **Flag stuck** (Req 1.1): The 5-second `setTimeout` in `setProcessingFlag()` guarantees the flag is always reset even if no code path explicitly clears it.
- **XHR download failure in bulk loop** (Req 3.3): `failureCount` is incremented; the loop continues to the next item. The failure is logged but does not abort the operation.

### base64ToBlob Errors

- **Empty input** (Req 2.5): Explicit guard throws `Error("base64ToBlob: input is empty")` before calling `atob`.
- **Invalid base64** (Req 2.4): `atob` throws a native `DOMException` with a descriptive message; this propagates to the caller.

### PostMessage Origin Mismatch

- Messages with `event.origin !== window.location.origin` are silently discarded (Req 7.5). No content from the rejected message is logged to avoid leaking cross-origin data.

### ESLint Errors vs Warnings

- `@typescript-eslint/no-explicit-any` and `@typescript-eslint/ban-ts-comment` are set to `"warn"` so existing `any` usages and `@ts-ignore` comments do not fail the lint step during the transition period (Req 10.3, 10.4, 10.6).

---

## Testing Strategy

### Unit Tests

Unit tests cover specific examples, edge cases, and error conditions for pure functions. The project currently has no test runner; the recommended setup is **Vitest** (zero-config, ESM-native, compatible with the existing esbuild/TypeScript setup).

Key unit test targets:

| Function | Test cases |
|---|---|
| `base64ToBlob` | Valid PDF base64, empty string, invalid base64, correct MIME type |
| `generateWithholdingFilename` | Normal item, missing date, missing number, special chars in name |
| `generateOutputTaxFilename` | Normal item, missing reference, missing invoice number |
| `generateDynamicFilename` | All 11 `ExportSource` values, `undefined` source, various `filenameHint` formats |
| `applyFilters` | Date range (in-range, out-of-range, missing date), status match, keyword match, empty options |
| `escapeCSV` | Plain string, comma-containing, quote-containing, newline-containing, null, undefined |
| `extractFilenameHintFromBody` | Each `ExportSource` with representative filter bodies |

### Property-Based Tests

Property-based tests use **fast-check** (TypeScript-native, works in Vitest). Each test runs a minimum of 100 iterations.

Tag format: `// Feature: better-coretax-improvements, Property N: <property_text>`

| Property | Generator | Assertion |
|---|---|---|
| P1: base64ToBlob round-trip | `fc.base64String({ minLength: 1 })` | Re-encode `Blob` ArrayBuffer to base64 → equals original input |
| P2: base64ToBlob rejects invalid | `fc.string()` filtered to non-base64 + `fc.constant("")` | `expect(() => base64ToBlob(s)).toThrow()` |
| P3: applyFilters date range | `fc.array(rowArb)`, `fc.option(fc.date())` × 2 | All returned rows have `InvoiceDate` within bounds; rows with null/missing date excluded when bounds set |
| P4: applyFilters status | `fc.array(rowArb)`, `fc.string()` | All returned rows have `Status` matching option (case-insensitive) |
| P5: applyFilters keyword | `fc.array(rowArb)`, `fc.string()` | All returned rows contain keyword in at least one string field |
| P6: applyFilters empty options | `fc.array(rowArb)` | Result equals input (same rows, same order) |
| P7: generateDynamicFilename prefix | `fc.option(fc.constantFrom(...ExportSources, "UNKNOWN"))`, `fc.option(fc.string())` | Result equals original nested-ternary implementation output |
| P8: CSV escaping round-trip | `fc.string()` (including special chars via `fc.fullUnicodeString()`) | Parse escaped value as RFC 4180 CSV field → recovers original |
| P9: PostMessage origin guard | `fc.record({ source: fc.boolean(), direction: fc.boolean(), origin: fc.boolean() })` | Message processed iff all three flags are true |

### Integration / Smoke Tests

These are not property-based and are run manually or in a browser extension test harness:

- **Req 7**: Verify `window.postMessage` calls in `scraper.ts` and `main.ts` use `window.location.origin` (code review / grep).
- **Req 8**: Load extension on Coretax, trigger a PDF download, verify Angular does not show a download error and the file saves correctly.
- **Req 9**: Run `npm install` from clean state, verify `node_modules/xlsx/package.json` version matches `package.json`.
- **Req 10**: Run `npm run lint`, verify exit code behaviour for errors vs warnings.
- **Req 3**: Trigger bulk download on withholding slips page, verify progress bar and item counter update correctly in the floating bar.
- **Req 4**: Verify dismiss button hides panel, badge click re-shows it, new operation auto-shows it.
- **Req 5**: Verify `Ctrl+Shift+E` starts export and `Ctrl+Shift+S` stops it on supported pages; verify no action on unsupported pages.

// ============================================================
// UI.TS — Inject export controls into the Coretax PPN page
// ============================================================
// Injects an "Export Data" button into the toolbar (left of
// Upload Faktur) with a dropdown panel for scrape + export.
// Communicates via custom DOM events with main.ts.
// ============================================================

/** Check if we're on the PPN Keluaran page */
export function isOutputTaxPage(): boolean {
	const url = location.href;
	// More flexible check: must have e-invoice-portal AND (output-tax OR keluaran OR vat-out)
	const isEInvoice = url.includes("/e-invoice-portal");
	const isKeluaran = url.includes("output-tax") || url.includes("keluaran") || url.includes("vat-out");
	const result = isEInvoice && isKeluaran;
	console.log(`Better Coretax: Output Tax Page check [${result}] for URL: ${url}`);
	return result;
}

/** Check if we're on the SPT Masa PPN page (all tabs) */
export function isSptPage(): boolean {
	const url = location.href;
	const isReturnsPortal = url.includes("/returnsheets-portal");
	const isVAT = url.includes("value-added-tax-return");
	const result = isReturnsPortal && isVAT;
	console.log(`Better Coretax: SPT Page check [${result}] for URL: ${url}`);
	return result;
}

/** 
 * Helper to find the "Upload Faktur" button or its container.
 * Coretax often changes IDs, so we use multiple strategies.
 */
function findAnchorButton(): HTMLElement | null {
	// Strategy 1: Known ID
	const byId = document.getElementById("SubmitSelectedInvoicesButton");
	if (byId) return byId;

	// Strategy 2: Button text (case insensitive)
	const buttons = Array.from(document.querySelectorAll("button.p-button"));
	const byText = buttons.find(b => 
		b.textContent?.toLowerCase().includes("upload faktur") || 
		b.textContent?.toLowerCase().includes("submit selected")
	);
	if (byText) return byText as HTMLElement;

	// Strategy 3: Icon class typical for upload
	const byIcon = document.querySelector(".pi-upload")?.closest("button");
	if (byIcon) return byIcon as HTMLElement;

	return null;
}

/** Inject the "CH" badge (always shown on Coretax pages) */
export function injectBadge() {
	if (document.getElementById("ch-badge")) return;
	console.log("Better Coretax: Injecting badge...");

	const badge = document.createElement("div");
	badge.id = "ch-badge";
	badge.textContent = "BC";
	badge.title = "Better Coretax Active";

	Object.assign(badge.style, {
		position: "fixed",
		bottom: "20px",
		right: "20px",
		width: "40px",
		height: "40px",
		backgroundColor: "#ff5722",
		color: "white",
		borderRadius: "50%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "14px",
		fontWeight: "bold",
		boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
		zIndex: "9999",
		cursor: "pointer",
		userSelect: "none",
	});

	document.body.appendChild(badge);
}

// ── SVG Icons ────────────────────────────────────────

const ICON_DOWNLOAD = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"/></svg>`;
const ICON_LOADING = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="ch-spin"><circle cx="8" cy="8" r="6" stroke-dasharray="30 10" /></svg>`;

// ── Export Panel State ───────────────────────────────

let panelEl: HTMLDivElement | null = null;
let exportBtnEl: HTMLButtonElement | null = null;
let isInjected = false;

interface PanelElements {
	statusText: HTMLDivElement;
	progressRow: HTMLDivElement;
	statTotal: HTMLSpanElement;
	statPages: HTMLSpanElement;
	statTime: HTMLSpanElement;
	btnScrape: HTMLButtonElement;
	progressBar: HTMLDivElement;
}

let els: PanelElements | null = null;

/**
 * Finds column index by text in the header row.
 */
function findColumnIndex(headerRow: HTMLTableRowElement, searchTexts: string[]): number {
	const ths = Array.from(headerRow.querySelectorAll("th"));
	return ths.findIndex(th => {
		const text = th.textContent?.trim().toLowerCase() || "";
		return searchTexts.some(s => text.includes(s.toLowerCase()));
	});
}

/**
 * Inject filter inputs into the table header.
 */
export function injectGridFilters(): void {
	if (!isOutputTaxPage()) return;

	const thead = document.querySelector("thead");
	if (!thead) return;

	const headerRows = Array.from(thead.querySelectorAll("tr"));
	if (headerRows.length < 2) return; 

	const mainHeaderRow = headerRows[0] as HTMLTableRowElement;
	const filterRow = headerRows[1] as HTMLTableRowElement;

	// Check if already injected
	if (filterRow.querySelector("#ch-filter-reference")) return;

	// Find the Reference column dynamically
	const refIdx = findColumnIndex(mainHeaderRow, ["Referensi", "Reference"]);
	if (refIdx === -1) return;

	const filterCells = Array.from(filterRow.querySelectorAll("th"));
	const refCell = filterCells[refIdx];
	if (!refCell) return;

	console.log("Better Coretax: Injecting Reference filter...");

	const container = document.createElement("div");
	container.className = "ch-grid-filter-container";
	container.innerHTML = `
		<div class="p-column-filter p-column-filter-row">
			<div class="p-fluid">
				<input type="text" 
					id="ch-grid-filter-reference"
					class="p-inputtext p-component" 
					placeholder="Cari Referensi..." 
					style="width: 100%; font-size: 12px; padding: 0.5rem;"
				/>
			</div>
		</div>
	`;

	refCell.innerHTML = ""; // Clear existing content (e.g. empty &nbsp; or other filters)
	refCell.appendChild(container);
}

/**
 * Inject filter input into the toolbar (after the reset button).
 * Uses a retry mechanism for robust loading.
 */
export function injectToolbarFilter(retries = 15): void {
	if (!isOutputTaxPage()) return;
	if (document.getElementById("ch-toolbar-filter-reference")) return;

	console.log(`Better Coretax: Attempting toolbar injection... (${retries} left)`);

	// Strategy-based button search
	const buttons = Array.from(document.querySelectorAll("button"));
	
	// Strategy 1: Tooltip match
	let anchor = buttons.find(b => b.getAttribute("ptooltip") === "Setel Ulang Filter");
	
	// Strategy 2: Icon class match
	if (!anchor) {
		anchor = buttons.find(b => b.querySelector(".pi-filter-slash"));
	}
	
	// Strategy 3: Specific Coretax utility button class match
	if (!anchor) {
		anchor = buttons.find(b => 
			(b.className.includes("ct-ovw-btn-mini-cancel") || b.className.includes("ct-ovw-btn-mini")) && 
			(b.querySelector(".pi-filter-slash") || b.querySelector(".pi-refresh"))
		);
	}

	if (!anchor) {
		if (retries > 0) {
			setTimeout(() => injectToolbarFilter(retries - 1), 1000);
		} else {
			console.error("Better Coretax: Failed to find anchor button for toolbar filter after all retries.");
		}
		return;
	}

	console.log("Better Coretax: Toolbar anchor found, injecting filter box.");

	const container = document.createElement("div");
	container.id = "ch-toolbar-filter-container";
	container.style.display = "inline-block";
	container.style.marginLeft = "0.5rem";
	container.style.verticalAlign = "middle";

	container.innerHTML = `
		<div class="p-inputgroup">
			<span class="p-inputgroup-addon" style="padding: 0 0.5rem; font-size: 12px; background: #334155; color: white; border: 1px solid #475569; border-right: none;">
				<i class="pi pi-search"></i>
			</span>
			<input type="text" 
				id="ch-toolbar-filter-reference"
				class="p-inputtext p-component" 
				placeholder="Cari Referensi..." 
				style="width: 180px; font-size: 12px; padding: 0.5rem; border-color: #475569;"
			/>
		</div>
	`;

	// Insert after the anchor button
	anchor.insertAdjacentElement("afterend", container);
	console.log("Better Coretax: Toolbar Reference filter injected successfully.");
}

/**
 * Inject the Export button into the toolbar.
 */
export function injectExportButton(retries = 15): void {
	if (isInjected) {
		const btn = document.getElementById("ch-export-btn");
		// Verify it is actually in the DOM and VISIBLE (Angular might have destroyed it or hidden its parent tab)
		if (!btn || btn.offsetParent === null) {
			console.log("Better Coretax: Export button lost or hidden, reinjecting...");
			isInjected = false;
			if (btn) btn.remove();
		} else {
			return;
		}
	}
	
	const isOutputTax = isOutputTaxPage();
	const isSpt = isSptPage();

	if (!isOutputTax && !isSpt) {
		console.log("Better Coretax: Page unsupported for export injection, skipping.");
		return;
	}

	let anchorEl: HTMLElement | null = null;
	let insertMode: "before" | "append" = "before";

	if (isOutputTax) {
		anchorEl = findAnchorButton();
		insertMode = "before";
	} else if (isSpt) {
		// SPT Page: Angular may keep both tabs in DOM (hiding one). Find the VISIBLE datatable header container.
		const headers = Array.from(document.querySelectorAll("rshshr-nvat-la2-grid .p-datatable-header .float-left, rshshr-nvat-lb2-grid .p-datatable-header .float-left"));
		const visibleHeader = headers.find(el => (el as HTMLElement).offsetParent !== null);
		if (visibleHeader) {
			anchorEl = visibleHeader as HTMLElement;
			insertMode = "append";
		}
	}
	if (!anchorEl) {
		if (retries > 0) {
			console.log(`Better Coretax: Anchor element not found, retrying... (${retries} left)`);
			setTimeout(() => injectExportButton(retries - 1), 1000);
		} else {
			console.error("Better Coretax: Could not find anchor element after multiple retries.");
		}
		return;
	}

	let containerNode = anchorEl.parentElement;
	if (insertMode === "append") {
		containerNode = anchorEl; // We append inside the float-left span
	}

	if (!containerNode) {
		console.error("Better Coretax: Anchor element has no logical parent/container.");
		return;
	}

	console.log("Better Coretax: Anchor button found, injecting Export button.");
	isInjected = true;

	// ── Create the Export button (matches Coretax style) ──

	exportBtnEl = document.createElement("button");
	exportBtnEl.id = "ch-export-btn";
	exportBtnEl.type = "button";
	exportBtnEl.className =
		"p-element btn ct-btn-group mr-1 p-button p-component ch-btn-highlight";
	exportBtnEl.style.backgroundColor = "#ff5722";
	exportBtnEl.style.borderColor = "#ff5722";
	exportBtnEl.style.color = "white";
	
	exportBtnEl.innerHTML = `
		<span class="p-button-icon p-button-icon-left pi pi-download" aria-hidden="true"></span>
		<span class="p-button-label">Better Export</span>
	`;

	if (insertMode === "before") {
		containerNode.insertBefore(exportBtnEl, anchorEl);
	} else {
		containerNode.appendChild(exportBtnEl);
	}

	// ── Create the dropdown panel ──

	// Remove old panel if it was left behind
	const oldPanel = document.getElementById("ch-export-panel");
	if (oldPanel) {
		oldPanel.remove();
	}

	panelEl = document.createElement("div");
	panelEl.id = "ch-export-panel";
	panelEl.className = "ch-export-panel";
	panelEl.innerHTML = `
		<div class="ch-panel-header">
			<span class="ch-panel-title">📊 Better Coretax Export</span>
			<button class="ch-panel-close" id="ch-panel-close">✕</button>
		</div>
		<div class="ch-panel-body">
			<div class="ch-status-text" id="ch-status-text">
				Klik "Mulai Scrape" untuk menarik otomatis semua data.
			</div>
			<div class="ch-progress-row ch-hidden" id="ch-progress-row">
				<div class="ch-stat">
					<span class="ch-stat-value" id="ch-stat-total">0</span>
					<span class="ch-stat-label">Data</span>
				</div>
				<div class="ch-stat">
					<span class="ch-stat-value" id="ch-stat-pages">0</span>
					<span class="ch-stat-label">Halaman</span>
				</div>
				<div class="ch-stat">
					<span class="ch-stat-value" id="ch-stat-time">0s</span>
					<span class="ch-stat-label">Waktu</span>
				</div>
			</div>
			<div class="ch-progress-bar-container ch-hidden" id="ch-progress-bar-container">
				<div class="ch-progress-bar" id="ch-progress-bar" style="width: 0%"></div>
			</div>
			<button class="ch-btn ch-btn-primary" id="ch-btn-scrape">
				▶ Mulai Scrape
			</button>
		</div>
	`;

	document.body.appendChild(panelEl);

	// Cache panel elements
	els = {
		statusText: panelEl.querySelector("#ch-status-text") as HTMLDivElement,
		progressRow: panelEl.querySelector("#ch-progress-row") as HTMLDivElement,
		statTotal: panelEl.querySelector("#ch-stat-total") as HTMLSpanElement,
		statPages: panelEl.querySelector("#ch-stat-pages") as HTMLSpanElement,
		statTime: panelEl.querySelector("#ch-stat-time") as HTMLSpanElement,
		btnScrape: panelEl.querySelector("#ch-btn-scrape") as HTMLButtonElement,
		progressBar: panelEl.querySelector("#ch-progress-bar") as HTMLDivElement,
	};

	// ── Event: Toggle panel ──

	exportBtnEl.addEventListener("click", (e: MouseEvent) => {
		e.stopPropagation();
		const wasOpen = panelEl?.classList.contains("ch-panel-open") ?? false;
		togglePanel();
		// Auto-start scrape when opening the panel (not when closing)
		if (!wasOpen) {
			document.dispatchEvent(new CustomEvent("ch:scrape-start"));
		}
	});

	// ── Event: Close panel ──

	panelEl
		.querySelector("#ch-panel-close")
		?.addEventListener("click", () => closePanel());

	// Close when clicking outside
	document.addEventListener("click", (e: MouseEvent) => {
		if (
			panelEl &&
			!panelEl.contains(e.target as Node) &&
			exportBtnEl &&
			!exportBtnEl.contains(e.target as Node)
		) {
			closePanel();
		}
	});

	// ── Event: Scrape button ──

	els.btnScrape.addEventListener("click", () => {
		document.dispatchEvent(new CustomEvent("ch:scrape-toggle"));
	});
}

// ── Panel open/close ─────────────────────────────────

function togglePanel(): void {
	if (!panelEl) return;
	const isOpen = panelEl.classList.contains("ch-panel-open");
	if (isOpen) {
		closePanel();
	} else {
		openPanel();
	}
}

function openPanel(): void {
	if (!panelEl || !exportBtnEl) return;

	// Position relative to the Export button
	const rect = exportBtnEl.getBoundingClientRect();
	panelEl.style.top = `${rect.bottom + 8}px`;
	panelEl.style.left = `${rect.left}px`;

	panelEl.classList.add("ch-panel-open");
}

function closePanel(): void {
	if (!panelEl) return;
	panelEl.classList.remove("ch-panel-open");
}

// ── Public API: Update panel UI from main.ts ─────────

export function updatePanelProgress(
	total: number,
	page: number,
	elapsed: string,
	status: string,
): void {
	if (!els) return;
	els.progressRow.classList.remove("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(page);
	els.statTime.textContent = elapsed;
	els.statusText.textContent = status;
	els.btnScrape.innerHTML = "⏹ Batalkan Proses";
	els.btnScrape.classList.add("ch-btn-stop");
	els.btnScrape.disabled = false;

	// Update progress bar if we have a guess or total
	const barContainer = document.getElementById("ch-progress-bar-container");
	if (barContainer) {
		barContainer.classList.remove("ch-hidden");
		// If status implies we are still catching, use an indeterminate pulse
		// once we have pages, we can do 100% / pages * page but that's inaccurate
		// best is to use a slow creep or just pulse until finished
		els.progressBar.style.width = `${Math.min(95, (page * 10) || 5)}%`;
	}
}

export function updatePanelComplete(
	total: number,
	pages: number,
	elapsed: string,
): void {
	if (!els) return;
	els.progressRow.classList.remove("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(pages);
	els.statTime.textContent = elapsed;
	els.statusText.textContent = `✅ ${total.toLocaleString("id-ID")} faktur berhasil diambil!`;
	els.btnScrape.innerHTML = "▶ Mulai Scrape";
	els.btnScrape.classList.remove("ch-btn-stop");
	els.btnScrape.disabled = false;

	els.progressBar.style.width = "100%";
	els.progressBar.classList.add("ch-progress-complete");
}

export function updatePanelError(message: string): void {
	if (!els) return;
	els.statusText.textContent = `❌ ${message}`;
	els.btnScrape.innerHTML = "▶ Mulai Scrape";
	els.btnScrape.classList.remove("ch-btn-stop");
	els.btnScrape.disabled = false;
}

export function updatePanelIdle(): void {
	if (!els) return;
	els.statusText.textContent =
		'Klik "Mulai Scrape" untuk mengambil semua data dari semua halaman.';
	els.progressRow.classList.add("ch-hidden");
	els.btnScrape.innerHTML = "▶ Mulai Scrape";
	els.btnScrape.classList.remove("ch-btn-stop");
	els.btnScrape.disabled = false;

	const barContainer = document.getElementById("ch-progress-bar-container");
	if (barContainer) barContainer.classList.add("ch-hidden");
	els.progressBar.style.width = "0%";
	els.progressBar.classList.remove("ch-progress-complete");
}

/** Remove the injected elements (e.g. on SPA navigation away) */
export function removeExportButton(): void {
	if (exportBtnEl) {
		exportBtnEl.remove();
		exportBtnEl = null;
	}
	if (panelEl) {
		panelEl.remove();
		panelEl = null;
	}
	els = null;
	isInjected = false;
}

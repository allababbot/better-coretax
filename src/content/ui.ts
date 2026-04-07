// ============================================================
// UI.TS — Inject export controls into the Coretax PPN page
// ============================================================
// Injects an "Better Export" button into the toolbar.
// Clicking it directly starts/toggles the scrape process.
// Progress is shown in a floating info bar in the bottom-right.
// Communicates via custom DOM events with main.ts.
// ============================================================

/** Check if we're on the PPN Keluaran page */
export function isOutputTaxPage(): boolean {
	const url = location.href;
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

/** Check if we're on the Withholding Slips page */
export function isWithholdingPage(): boolean {
	const url = location.href;
	const isWithholdingPortal = url.includes("/withholding-slips-portal");
	const isMySlips = url.includes("my-withholding-slips");
	const result = isWithholdingPortal && isMySlips;
	console.log(`Better Coretax: Withholding Slips Page check [${result}] for URL: ${url}`);
	return result;
}

/** 
 * Helper to find the "Upload Faktur" button or its container.
 */
function findAnchorButton(): HTMLElement | null {
	const byId = document.getElementById("SubmitSelectedInvoicesButton");
	if (byId) return byId;

	const buttons = Array.from(document.querySelectorAll("button.p-button"));
	const byText = buttons.find(b => 
		b.textContent?.toLowerCase().includes("upload faktur") || 
		b.textContent?.toLowerCase().includes("submit selected")
	);
	if (byText) return byText as HTMLElement;

	const byIcon = document.querySelector(".pi-upload")?.closest("button");
	if (byIcon) return byIcon as HTMLElement;

	return null;
}

// ── Floating Info State ──────────────────────────────

let badgeEl: HTMLDivElement | null = null;
let statsEl: HTMLDivElement | null = null;
let exportBtnEl: HTMLButtonElement | null = null;
let isInjected = false;

interface FloatingElements {
	statusText: HTMLDivElement;
	statTotal: HTMLSpanElement;
	statPages: HTMLSpanElement;
	statTime: HTMLSpanElement;
	progressBar: HTMLDivElement;
}

let els: FloatingElements | null = null;

/** Inject the Floating Info Bar (bottom-right) */
export function injectBadge() {
	if (document.getElementById("ch-floating-info-container")) return;
	console.log("Better Coretax: Injecting floating info bar...");

	const container = document.createElement("div");
	container.id = "ch-floating-info-container";
	container.className = "ch-floating-info";

	container.innerHTML = `
		<div class="ch-floating-stats ch-hidden" id="ch-floating-stats">
			<div class="ch-f-stat-item">
				<span class="ch-f-label">Data</span>
				<span class="ch-f-value" id="ch-f-total">0</span>
			</div>
			<div class="ch-f-stat-item">
				<span class="ch-f-label">Hal</span>
				<span class="ch-f-value" id="ch-f-pages">0</span>
			</div>
			<div class="ch-f-stat-item">
				<span class="ch-f-label">Waktu</span>
				<span class="ch-f-value" id="ch-f-time">0s</span>
			</div>
			<div class="ch-f-status" id="ch-f-status">Siap...</div>
			<div class="ch-f-progress-container">
				<div class="ch-f-progress-bar" id="ch-f-progress-bar"></div>
			</div>
		</div>
		<div class="ch-badge" id="ch-badge">BC</div>
	`;

	document.body.appendChild(container);

	badgeEl = container.querySelector("#ch-badge") as HTMLDivElement;
	statsEl = container.querySelector("#ch-floating-stats") as HTMLDivElement;

	els = {
		statusText: container.querySelector("#ch-f-status") as HTMLDivElement,
		statTotal: container.querySelector("#ch-f-total") as HTMLSpanElement,
		statPages: container.querySelector("#ch-f-pages") as HTMLSpanElement,
		statTime: container.querySelector("#ch-f-time") as HTMLSpanElement,
		progressBar: container.querySelector("#ch-f-progress-bar") as HTMLDivElement,
	};
}

/**
 * Finds column index by text.
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

	if (filterRow.querySelector("#ch-filter-reference")) return;

	const refIdx = findColumnIndex(mainHeaderRow, ["Referensi", "Reference"]);
	if (refIdx === -1) return;

	const filterCells = Array.from(filterRow.querySelectorAll("th"));
	const refCell = filterCells[refIdx];
	if (!refCell) return;

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

	refCell.innerHTML = "";
	refCell.appendChild(container);
}

/**
 * Inject filter input into the toolbar.
 */
export function injectToolbarFilter(retries = 15): void {
	if (!isOutputTaxPage()) return;
	if (document.getElementById("ch-toolbar-filter-reference")) return;

	const buttons = Array.from(document.querySelectorAll("button"));
	let anchor = buttons.find(b => b.getAttribute("ptooltip") === "Setel Ulang Filter") ||
	             buttons.find(b => b.querySelector(".pi-filter-slash")) ||
				 buttons.find(b => 
					(b.className.includes("ct-ovw-btn-mini-cancel") || b.className.includes("ct-ovw-btn-mini")) && 
					(b.querySelector(".pi-filter-slash") || b.querySelector(".pi-refresh"))
				 );

	if (!anchor) {
		if (retries > 0) setTimeout(() => injectToolbarFilter(retries - 1), 1000);
		return;
	}

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

	anchor.insertAdjacentElement("afterend", container);
}

/**
 * Inject the "Better Export" button into the toolbar.
 */
export function injectExportButton(retries = 15): void {
	if (isInjected) {
		const btn = document.getElementById("ch-export-btn");
		if (!btn || btn.offsetParent === null) {
			isInjected = false;
			if (btn) btn.remove();
		} else {
			return;
		}
	}
	
	const isOutputTax = isOutputTaxPage();
	const isSpt = isSptPage();
	const isWithholding = isWithholdingPage();

	if (!isOutputTax && !isSpt && !isWithholding) return;

	let anchorEl: HTMLElement | null = null;
	let insertMode: "before" | "append" = "before";

	if (isOutputTax) {
		anchorEl = findAnchorButton();
		insertMode = "before";
	} else if (isSpt) {
		const headers = Array.from(document.querySelectorAll("rshshr-nvat-la2-grid .p-datatable-header .float-left, rshshr-nvat-lb2-grid .p-datatable-header .float-left"));
		anchorEl = headers.find(el => (el as HTMLElement).offsetParent !== null) as HTMLElement || null;
		insertMode = "append";
	} else if (isWithholding) {
		const headers = Array.from(document.querySelectorAll(".p-datatable-header .float-left, .card-header .float-left"));
		anchorEl = headers.find(el => (el as HTMLElement).offsetParent !== null) as HTMLElement || null;
		insertMode = "append";
	}

	if (!anchorEl) {
		if (retries > 0) setTimeout(() => injectExportButton(retries - 1), 1000);
		return;
	}

	let containerNode = (insertMode === "append") ? anchorEl : anchorEl.parentElement;
	if (!containerNode) return;

	isInjected = true;
	exportBtnEl = document.createElement("button");
	exportBtnEl.id = "ch-export-btn";
	exportBtnEl.type = "button";
	exportBtnEl.className = "p-element btn ct-btn-group mr-1 p-button p-component ch-btn-highlight";
	exportBtnEl.style.backgroundColor = "#ff5722";
	exportBtnEl.style.borderColor = "#ff5722";
	exportBtnEl.style.color = "white";
	
	exportBtnEl.innerHTML = `
		<span class="p-button-icon p-button-icon-left pi pi-download" aria-hidden="true"></span>
		<span class="p-button-label">${isWithholding ? "Bulk Download PDF" : "Better Export"}</span>
	`;

	if (insertMode === "before") {
		containerNode.insertBefore(exportBtnEl, anchorEl);
	} else {
		containerNode.appendChild(exportBtnEl);
	}

	// ── Event: Direct Start Scrape ──
	exportBtnEl.addEventListener("click", (e: MouseEvent) => {
		e.stopPropagation();
		// Directly toggle scraping, no dropdown
		document.dispatchEvent(new CustomEvent("ch:scrape-toggle"));
	});
}

// ── Public API: Update Floating Info Bar ───────────────

export function updatePanelProgress(
	total: number,
	page: number,
	elapsed: string,
	status: string,
): void {
	if (!els || !statsEl) return;
	statsEl.classList.remove("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(page);
	els.statTime.textContent = elapsed;
	els.statusText.textContent = status;

	// Invert Export Button state
	if (exportBtnEl) {
		exportBtnEl.innerHTML = `<span class="pi pi-spin pi-spinner mr-1"></span> STOP Scrape`;
		exportBtnEl.style.backgroundColor = "#ef4444";
		exportBtnEl.style.borderColor = "#ef4444";
	}

	els.progressBar.style.width = `${Math.min(95, (page * 10) || 5)}%`;
}

export function updatePanelComplete(
	total: number,
	pages: number,
	elapsed: string,
): void {
	if (!els || !statsEl) return;
	statsEl.classList.remove("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(pages);
	els.statTime.textContent = elapsed;
	
	if (isWithholdingPage()) {
		els.statusText.textContent = `✅ ${total} PDF Berhasil`;
	} else {
		els.statusText.textContent = `✅ ${total} Data Berhasil`;
	}

	if (exportBtnEl) {
		exportBtnEl.innerHTML = `<span class="pi pi-download mr-1"></span> Better Export`;
		exportBtnEl.style.backgroundColor = "#ff5722";
		exportBtnEl.style.borderColor = "#ff5722";
	}

	els.progressBar.style.width = "100%";
}

export function updatePanelError(message: string): void {
	if (!els || !statsEl) return;
	statsEl.classList.remove("ch-hidden");
	els.statusText.textContent = `❌ ${message}`;

	if (exportBtnEl) {
		exportBtnEl.innerHTML = `<span class="pi pi-download mr-1"></span> Better Export`;
		exportBtnEl.style.backgroundColor = "#ff5722";
		exportBtnEl.style.borderColor = "#ff5722";
	}
}

export function updatePanelIdle(): void {
	if (!els || !statsEl) return;
	statsEl.classList.add("ch-hidden");
	
	if (exportBtnEl) {
		exportBtnEl.innerHTML = `<span class="pi pi-download mr-1"></span> Better Export`;
		exportBtnEl.style.backgroundColor = "#ff5722";
		exportBtnEl.style.borderColor = "#ff5722";
	}
}

/** Remove elements on navigation */
export function removeExportButton(): void {
	if (exportBtnEl) {
		exportBtnEl.remove();
		exportBtnEl = null;
	}
	const container = document.getElementById("ch-floating-info-container");
	if (container) container.remove();
	els = null;
	badgeEl = null;
	statsEl = null;
	isInjected = false;
}

// ============================================================
// UI.TS — Inject export controls into the Coretax PPN page
// ============================================================
// Injects an "Better Export" button into the toolbar.
// Clicking it directly starts/toggles the scrape process.
// Progress is shown in a floating info bar in the bottom-right.
// Communicates via custom DOM events with main.ts.
// ============================================================

import {
	isInputReturnPage,
	isInputTaxPage,
	isOutputReturnPage,
	isOutputTaxPage,
	isSptPage,
	isSupportedExportPage,
	isWithholdingPage,
} from "./page-context";

export {
	isInputReturnPage,
	isInputTaxPage,
	isOutputReturnPage,
	isOutputTaxPage,
	isSptPage,
	isSupportedExportPage,
	isWithholdingPage,
};

/**
 * Helper to find the "Upload Faktur" button or its container.
 */
function findAnchorButton(): HTMLElement | null {
	if (isInputTaxPage()) {
		const inputTaxAnchor = document.getElementById("CreditInvoiceButtonButton");
		return inputTaxAnchor && inputTaxAnchor.offsetParent !== null ? inputTaxAnchor : null;
	}

	if (isOutputReturnPage()) {
		const outputReturnAnchor = document.getElementById("CancelSelectedInvoicesButton");
		return outputReturnAnchor && outputReturnAnchor.offsetParent !== null ? outputReturnAnchor : null;
	}

	if (isInputReturnPage()) {
		const inputReturnAnchor = document.getElementById("SubmitReturnButton");
		return inputReturnAnchor && inputReturnAnchor.offsetParent !== null ? inputReturnAnchor : null;
	}

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

	const tableHeaderAnchor = document.querySelector(
		".p-datatable-header .float-left, .p-datatable-header, .card-header .float-left, .card-header",
	) as HTMLElement | null;
	if (tableHeaderAnchor && tableHeaderAnchor.offsetParent !== null) return tableHeaderAnchor;

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

function isActionAnchor(el: Element | null): el is HTMLElement {
	return !!el && el instanceof HTMLElement && (
		el.id === "SubmitSelectedInvoicesButton" ||
		el.id === "CreditInvoiceButtonButton" ||
		el.id === "CancelSelectedInvoicesButton" ||
		el.id === "SubmitReturnButton"
	);
}

function isButtonPlacedCorrectly(btn: HTMLElement): boolean {
	if (isInputTaxPage()) {
		const anchor = document.getElementById("CreditInvoiceButtonButton");
		return !!anchor && btn.nextElementSibling === anchor;
	}

	if (isOutputReturnPage()) {
		const anchor = document.getElementById("CancelSelectedInvoicesButton");
		return !!anchor && btn.nextElementSibling === anchor;
	}

	if (isInputReturnPage()) {
		const anchor = document.getElementById("SubmitReturnButton");
		return !!anchor && btn.nextElementSibling === anchor;
	}

	if (isOutputTaxPage()) {
		const anchor = document.getElementById("SubmitSelectedInvoicesButton");
		return !!anchor && btn.nextElementSibling === anchor;
	}

	return true;
}

function moveButtonNextToAnchor(btn: HTMLElement, anchor: HTMLElement): boolean {
	const parent = anchor.parentElement;
	if (!parent) return false;
	parent.insertBefore(btn, anchor);
	return true;
}

/** Inject the Floating Info Bar (bottom-right) */
export function injectBadge() {
	// Remove any old versions to avoid duplicates
	const oldContainer = document.getElementById("ch-floating-info-container");
	const oldBadge = document.getElementById("ch-badge");
	if (oldContainer) oldContainer.remove();
	else if (oldBadge) oldBadge.remove();

	console.log("Better Coretax: Injecting floating info bar...");
	const container = document.createElement("div");
	container.id = "ch-floating-info-container";
	container.className = "ch-floating-info";

	// Create stats element
	statsEl = document.createElement("div");
	statsEl.id = "ch-floating-stats";
	statsEl.className = "ch-floating-stats ch-hidden";

	const createStatItem = (label: string, id: string) => {
		const item = document.createElement("div");
		item.className = "ch-f-stat-item";
		const lbl = document.createElement("span");
		lbl.className = "ch-f-label";
		lbl.textContent = label;
		const val = document.createElement("span");
		val.className = "ch-f-value";
		val.id = id;
		val.textContent = "0";
		item.appendChild(lbl);
		item.appendChild(val);
		return { item, val };
	};

	const totalStat = createStatItem("Data", "ch-f-total");
	const pagesStat = createStatItem("Hal", "ch-f-pages");
	const timeStat = createStatItem("Waktu", "ch-f-time");

	const statusText = document.createElement("div");
	statusText.id = "ch-f-status";
	statusText.className = "ch-f-status";
	statusText.textContent = "Siap...";

	const progressContainer = document.createElement("div");
	progressContainer.className = "ch-f-progress-container";
	const progressBar = document.createElement("div");
	progressBar.id = "ch-f-progress-bar";
	progressBar.className = "ch-f-progress-bar";
	progressContainer.appendChild(progressBar);

	statsEl.appendChild(totalStat.item);
	statsEl.appendChild(pagesStat.item);
	statsEl.appendChild(timeStat.item);
	statsEl.appendChild(statusText);
	statsEl.appendChild(progressContainer);

	// Create badge element
	badgeEl = document.createElement("div");
	badgeEl.id = "ch-badge";
	badgeEl.className = "ch-badge";
	badgeEl.textContent = "BC";

	container.appendChild(statsEl);
	container.appendChild(badgeEl);
	document.body.appendChild(container);

	els = {
		statusText,
		statTotal: totalStat.val,
		statPages: pagesStat.val,
		statTime: timeStat.val,
		progressBar,
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
	
	const filterWrapper = document.createElement("div");
	filterWrapper.className = "p-column-filter p-column-filter-row";
	
	const fluidWrapper = document.createElement("div");
	fluidWrapper.className = "p-fluid";
	
	const input = document.createElement("input");
	input.type = "text";
	input.id = "ch-grid-filter-reference";
	input.className = "p-inputtext p-component";
	input.placeholder = "Cari Referensi...";
	Object.assign(input.style, {
		width: "100%",
		fontSize: "12px",
		padding: "0.5rem"
	});
	
	fluidWrapper.appendChild(input);
	filterWrapper.appendChild(fluidWrapper);
	container.appendChild(filterWrapper);

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
	Object.assign(container.style, {
		display: "inline-block",
		marginLeft: "0.5rem",
		verticalAlign: "middle"
	});

	const group = document.createElement("div");
	group.className = "p-inputgroup";
	
	const addon = document.createElement("span");
	addon.className = "p-inputgroup-addon";
	Object.assign(addon.style, {
		padding: "0 0.5rem",
		fontSize: "12px",
		background: "#334155",
		color: "white",
		border: "1px solid #475569",
		borderRight: "none"
	});
	const icon = document.createElement("i");
	icon.className = "pi pi-search";
	addon.appendChild(icon);
	
	const input = document.createElement("input");
	input.type = "text";
	input.id = "ch-toolbar-filter-reference";
	input.className = "p-inputtext p-component";
	input.placeholder = "Cari Referensi...";
	Object.assign(input.style, {
		width: "180px",
		fontSize: "12px",
		padding: "0.5rem",
		borderColor: "#475569"
	});
	
	group.appendChild(addon);
	group.appendChild(input);
	container.appendChild(group);

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
		} else if (!isButtonPlacedCorrectly(btn)) {
			const inputTaxAnchor = isInputTaxPage()
				? document.getElementById("CreditInvoiceButtonButton")
				: null;
			if (inputTaxAnchor && inputTaxAnchor.offsetParent !== null && moveButtonNextToAnchor(btn, inputTaxAnchor)) {
				return;
			}
			isInjected = false;
			btn.remove();
		} else {
			return;
		}
	}
	
	const isOutputTax = isOutputTaxPage();
	const isInputTax = isInputTaxPage();
	const isOutputReturn = isOutputReturnPage();
	const isInputReturn = isInputReturnPage();
	const isSpt = isSptPage();
	const isWithholding = isWithholdingPage();

	if (!isSupportedExportPage()) return;

	let anchorEl: HTMLElement | null = null;
	let insertMode: "before" | "append" = "before";

	if (isOutputTax || isInputTax || isOutputReturn || isInputReturn) {
		anchorEl = findAnchorButton();
		insertMode =
			anchorEl?.matches(".p-datatable-header .float-left, .p-datatable-header, .card-header .float-left, .card-header")
				? "append"
				: "before";
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
	Object.assign(exportBtnEl.style, {
		backgroundColor: "#ff5722",
		borderColor: "#ff5722",
		color: "white"
	});
	
	const icon = document.createElement("span");
	icon.className = "p-button-icon p-button-icon-left pi pi-download";
	icon.setAttribute("aria-hidden", "true");
	
	const label = document.createElement("span");
	label.className = "p-button-label";
	label.textContent = isWithholding ? "Bulk Download PDF" : "Better Export";
	
	exportBtnEl.appendChild(icon);
	exportBtnEl.appendChild(label);

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
		const icon = exportBtnEl.querySelector(".p-button-icon") as HTMLElement;
		if (icon) icon.className = "p-button-icon p-button-icon-left pi pi-spin pi-spinner mr-1";
		
		const label = exportBtnEl.querySelector(".p-button-label") as HTMLElement;
		if (label) label.textContent = " STOP Scrape";
		
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
		const icon = exportBtnEl.querySelector(".p-button-icon") as HTMLElement;
		if (icon) icon.className = "p-button-icon p-button-icon-left pi pi-download mr-1";
		
		const label = exportBtnEl.querySelector(".p-button-label") as HTMLElement;
		if (label) label.textContent = isWithholdingPage() ? "Bulk Download PDF" : "Better Export";

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
		const icon = exportBtnEl.querySelector(".p-button-icon") as HTMLElement;
		if (icon) icon.className = "p-button-icon p-button-icon-left pi pi-download mr-1";
		
		const label = exportBtnEl.querySelector(".p-button-label") as HTMLElement;
		if (label) label.textContent = isWithholdingPage() ? "Bulk Download PDF" : "Better Export";

		exportBtnEl.style.backgroundColor = "#ff5722";
		exportBtnEl.style.borderColor = "#ff5722";
	}
}

export function updatePanelIdle(): void {
	if (!els || !statsEl) return;
	statsEl.classList.add("ch-hidden");
	
	if (exportBtnEl) {
		const icon = exportBtnEl.querySelector(".p-button-icon") as HTMLElement;
		if (icon) icon.className = "p-button-icon p-button-icon-left pi pi-download mr-1";
		
		const label = exportBtnEl.querySelector(".p-button-label") as HTMLElement;
		if (label) label.textContent = isWithholdingPage() ? "Bulk Download PDF" : "Better Export";

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

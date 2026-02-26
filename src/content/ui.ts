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
	return url.includes("/e-invoice-portal") && url.includes("output-tax");
}

/** Inject the "CH" badge (always shown on Coretax pages) */
export function injectBadge() {
	if (document.getElementById("ch-badge")) return;

	const badge = document.createElement("div");
	badge.id = "ch-badge";
	badge.textContent = "CH";
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
	btnCsv: HTMLButtonElement;
	btnJson: HTMLButtonElement;
	exportRow: HTMLDivElement;
}

let els: PanelElements | null = null;

/**
 * Inject the Export button into the toolbar.
 * Must be called after the page has loaded the PrimeNG table.
 * Will retry up to 10 times with delays if the toolbar isn't ready yet.
 */
export function injectExportButton(retries = 10): void {
	if (isInjected) return;
	if (!isOutputTaxPage()) return;

	// Find the Upload Faktur button
	const uploadBtn = document.getElementById("SubmitSelectedInvoicesButton");
	if (!uploadBtn) {
		if (retries > 0) {
			setTimeout(() => injectExportButton(retries - 1), 1000);
		}
		return;
	}

	const btnGroup = uploadBtn.parentElement;
	if (!btnGroup) return;

	isInjected = true;

	// ── Create the Export button (matches Coretax style) ──

	exportBtnEl = document.createElement("button");
	exportBtnEl.id = "ch-export-btn";
	exportBtnEl.type = "button";
	exportBtnEl.className =
		"p-element btn ct-btn-group mr-1 p-button p-component";
	exportBtnEl.innerHTML = `
		<span class="p-button-icon p-button-icon-left pi pi-download" aria-hidden="true"></span>
		<span class="p-button-label">Export Data</span>
	`;

	// Insert before Upload Faktur
	btnGroup.insertBefore(exportBtnEl, uploadBtn);

	// ── Create the dropdown panel ──

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
				Klik "Mulai Scrape" untuk mengambil semua data dari semua halaman.
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
			<button class="ch-btn ch-btn-primary" id="ch-btn-scrape">
				▶ Mulai Scrape
			</button>
			<div class="ch-export-row ch-hidden" id="ch-export-row">
				<button class="ch-btn ch-btn-export" id="ch-btn-csv">
					${ICON_DOWNLOAD} Export CSV
				</button>
				<button class="ch-btn ch-btn-export" id="ch-btn-json">
					${ICON_DOWNLOAD} Export JSON
				</button>
			</div>
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
		btnCsv: panelEl.querySelector("#ch-btn-csv") as HTMLButtonElement,
		btnJson: panelEl.querySelector("#ch-btn-json") as HTMLButtonElement,
		exportRow: panelEl.querySelector("#ch-export-row") as HTMLDivElement,
	};

	// ── Event: Toggle panel ──

	exportBtnEl.addEventListener("click", (e) => {
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
	document.addEventListener("click", (e) => {
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

	// ── Event: Export buttons ──

	els.btnCsv.addEventListener("click", () => {
		document.dispatchEvent(new CustomEvent("ch:export", { detail: "csv" }));
	});

	els.btnJson.addEventListener("click", () => {
		document.dispatchEvent(new CustomEvent("ch:export", { detail: "json" }));
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
	els.exportRow.classList.add("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(page);
	els.statTime.textContent = elapsed;
	els.statusText.textContent = status;
	els.btnScrape.innerHTML = "⏹ Hentikan";
	els.btnScrape.classList.add("ch-btn-stop");
	els.btnScrape.disabled = false;
}

export function updatePanelComplete(
	total: number,
	pages: number,
	elapsed: string,
): void {
	if (!els) return;
	els.progressRow.classList.remove("ch-hidden");
	els.exportRow.classList.remove("ch-hidden");
	els.statTotal.textContent = total.toLocaleString("id-ID");
	els.statPages.textContent = String(pages);
	els.statTime.textContent = elapsed;
	els.statusText.textContent = `✅ ${total.toLocaleString("id-ID")} faktur berhasil diambil!`;
	els.btnScrape.innerHTML = "▶ Mulai Scrape";
	els.btnScrape.classList.remove("ch-btn-stop");
	els.btnScrape.disabled = false;
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
	els.exportRow.classList.add("ch-hidden");
	els.btnScrape.innerHTML = "▶ Mulai Scrape";
	els.btnScrape.classList.remove("ch-btn-stop");
	els.btnScrape.disabled = false;
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

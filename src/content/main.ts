// ============================================================
// MAIN.TS — Content Script Bridge (Isolated World)
// ============================================================
// Runs in ISOLATED world (has access to browser.runtime API).
// Injects scraper.ts (compiled) into the page's MAIN world.
// Relays messages: popup ↔ content.js ↔ scraper.js (page context)
// Also handles in-page export button UI events.
// Stores scrape state so popup can reconnect after being closed.
// ============================================================

// Cross-browser shim
// @ts-ignore
const _browser = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
const browserAPI: any = _browser;

import { type ExportData, exportXLSX } from "./exporter";
import {
	injectBadge,
	injectExportButton,
	injectGridFilters,
	isOutputTaxPage,
	isSptPage,
	isWithholdingPage,
	removeExportButton,
	updatePanelComplete,
	updatePanelError,
	updatePanelIdle,
	updatePanelProgress,
	injectToolbarFilter,
} from "./ui";
import { base64ToBlob, downloadBlob, generateWithholdingFilename } from "./downloader";

console.log("better coretax aktif");

// ── Types ────────────────────────────────────────────

interface ScrapeState {
	type: "SCRAPE_PROGRESS" | "SCRAPE_COMPLETE" | "SCRAPE_ERROR";
	total?: number;
	page?: number;
	pages?: number;
	elapsed?: string;
	status?: string;
	message?: string;
	data?: Record<string, unknown>[];
	fields?: string[];
}

// ── State storage (persists while page is open) ─────

let lastState: ScrapeState | null = null;
let isRunning = false;
let scrapedData: Record<string, unknown>[] | null = null;
let scrapedFields: string[] | null = null;

let lastUrl = location.href;
let injectionTimeout: any = null;

const observer = new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
		lastUrl = url;
		console.log("Better Coretax: URL changed to", url);
		onNavigate();
	} else if (isOutputTaxPage() || isSptPage() || isWithholdingPage()) {
		if (injectionTimeout) clearTimeout(injectionTimeout);
		if (isOutputTaxPage()) {
			// Toolbar filter handles its own retries
			injectToolbarFilter();
			injectionTimeout = setTimeout(() => {
				injectGridFilters();
			}, 300); 
		}
		// Always safely attempt to reinject the button if we arrive here
		injectExportButton();
	}
});

observer.observe(document.body, { subtree: true, childList: true });

// ── Inject the scraper script into MAIN world ───────

function injectScraper(): void {
	if (document.getElementById("__ch_scraper_injected__")) return;

	const script = document.createElement("script");
	script.id = "__ch_scraper_injected__";
	script.src = browserAPI.runtime.getURL("content/scraper.js");
	script.onload = () => {
		console.log("Better Coretax: Scraper injected into page context");
	};
	(document.head || document.documentElement).appendChild(script);
}

// ── Helper: safely send message to popup ────────────

function sendToPopup(msg: Record<string, unknown>): void {
	try {
		browserAPI.runtime.sendMessage(msg).catch(() => {
			// Popup closed or extension context invalidated
		});
	} catch (_) {
		// Extension context invalidated or popup closed
	}
}

// ── Relay: Popup → Content → Page ───────────────────

browserAPI.runtime.onMessage.addListener(
	(msg: Record<string, any>, _sender: any, sendResponse: (response?: any) => void) => {
		if (msg.type === "START_SCRAPE" || msg.type === "STOP_SCRAPE") {
			window.postMessage({ ...msg, direction: "FROM_CONTENT" }, "*");
			if (msg.type === "START_SCRAPE") {
				isRunning = true;
				lastState = {
					type: "SCRAPE_PROGRESS",
					total: 0,
					page: 0,
					elapsed: "0s",
					status: "Menunggu...",
				};
			}
			sendResponse({ ok: true });
			return true;
		}

		if (msg.type === "GET_STATE") {
			sendResponse({ state: lastState });
			return true;
		}

		return false;
	},
);

// ── Relay: Page → Content → Popup + In-page panel ───

window.addEventListener("message", (event: MessageEvent) => {
	if (event.source !== window) return;
	if (!event.data || event.data.direction !== "FROM_PAGE") return;

	const { direction: _, ...cleanMsg } = event.data;

	// Store state for reconnection
	if (
		cleanMsg.type === "SCRAPE_PROGRESS" ||
		cleanMsg.type === "SCRAPE_COMPLETE" ||
		cleanMsg.type === "SCRAPE_ERROR"
	) {
		lastState = cleanMsg as ScrapeState;
	}

	// Update in-page panel
	if (cleanMsg.type === "SCRAPE_PROGRESS") {
		updatePanelProgress(
			cleanMsg.total || 0,
			cleanMsg.page || 0,
			cleanMsg.elapsed || "0s",
			cleanMsg.status || "",
		);
	}

	if (cleanMsg.type === "SCRAPE_COMPLETE") {
		isRunning = false;
		scrapedData = cleanMsg.data || null;
		scrapedFields = cleanMsg.fields || null;
		updatePanelComplete(
			cleanMsg.total || 0,
			cleanMsg.pages || 0,
			cleanMsg.elapsed || "0s",
		);

		if (scrapedData && scrapedFields && cleanMsg.source !== "WITHHOLDING_SLIPS") {
			const exportData: ExportData = {
				data: scrapedData,
				fields: scrapedFields,
				// @ts-ignore
				filenameHint: cleanMsg.filenameHint,
				// @ts-ignore
				source: cleanMsg.source
			};
			exportXLSX(exportData);
		}
	}

	if (cleanMsg.type === "DOWNLOAD_PDF_ITEM") {
		const { base64, item } = cleanMsg;
		try {
			const blob = base64ToBlob(base64);
			const filename = generateWithholdingFilename(item);
			downloadBlob(blob, filename);
		} catch (err) {
			console.error("Better Coretax: Gagal memproses download file", err);
		}
	}

	if (cleanMsg.type === "SCRAPE_ERROR") {
		isRunning = false;
		updatePanelError(cleanMsg.message || "Error");
	}

	// Forward to popup
	sendToPopup(cleanMsg);
});

// ── Grid Filter Event ───────────────────────────────

document.addEventListener("keyup", (e: KeyboardEvent) => {
	const target = e.target as HTMLInputElement;
	if (target && (target.id === "ch-toolbar-filter-reference" || target.id === "ch-grid-filter-reference")) {
		if (e.key === "Enter") {
			console.log("Better Coretax: Reference filter triggered via Enter");
			const value = target.value.trim();
			window.postMessage(
				{
					type: "SET_SERVER_FILTER",
					field: "Reference",
					value: value.toUpperCase(),
					direction: "FROM_CONTENT",
				},
				"*",
			);

			// Trigger a search by clicking the "Cari" or "Refresh" button
			const searchBtn = Array.from(document.querySelectorAll("button")).find(btn => {
				const text = btn.textContent?.toLowerCase() || "";
				// Check for icon classes inside the button or spans
				const hasIcon = !!btn.querySelector(".pi-search, .pi-refresh, .pi-filter");
				return text.includes("cari") || 
					   text.includes("refresh") || 
					   hasIcon;
			}) as HTMLButtonElement;

			if (searchBtn) {
				console.log("Better Coretax: Triggering search via button in 100ms:", searchBtn.textContent?.trim());
				setTimeout(() => searchBtn.click(), 100);
			} else {
				console.warn("Better Coretax: Could not find search/refresh button to trigger filter");
			}
		}
	}
});

// ── In-page button events ───────────────────────────

document.addEventListener("ch:scrape-toggle", () => {
	if (isRunning) {
		// Stop
		window.postMessage({ type: "STOP_SCRAPE", direction: "FROM_CONTENT" }, "*");
		isRunning = false;
		updatePanelIdle();
	} else {
		startScrape();
	}
});

// Auto-start scrape (only starts if not already running, never stops)
document.addEventListener("ch:scrape-start", () => {
	if (isRunning) return; // Already running, don't restart
	startScrape();
});

function startScrape(): void {
	isRunning = true;
	scrapedData = null;
	scrapedFields = null;
	lastState = {
		type: "SCRAPE_PROGRESS",
		total: 0,
		page: 0,
		elapsed: "0s",
		status: "Menunggu...",
	};
	updatePanelProgress(0, 0, "0s", "Menangkap request dari Angular...");
	window.postMessage({ type: "START_SCRAPE", direction: "FROM_CONTENT" }, "*");
}



// ── Init & Navigation ───────────────────────────────

function onNavigate(): void {
	console.log("Better Coretax: Navigate event triggered. Current URL:", window.location.href);
	if (isOutputTaxPage() || isSptPage() || isWithholdingPage()) {
		console.log("Better Coretax: Supported page detected, ensuring injection...");
		injectBadge();
		injectScraper();
		injectExportButton();
		if (isOutputTaxPage()) {
			injectToolbarFilter();
			setTimeout(() => {
				injectGridFilters();
			}, 1500);
		}
	} else {
		console.log("Better Coretax: Unrecognized page, removing tools if present.");
		removeExportButton();
	}
}

function init(): void {
	console.log("Better Coretax: Extension starting up on page...", window.location.href);
	injectBadge();
	injectScraper();

	if (isOutputTaxPage() || isSptPage() || isWithholdingPage()) {
		console.log("Better Coretax: Page match found on init.");
		injectExportButton();
		if (isOutputTaxPage()) {
			injectToolbarFilter();
			setTimeout(() => {
				injectGridFilters();
			}, 1500);
		}
	} else {
		console.log("Better Coretax: Page match not found on init.");
	}
}

if (document.readyState === "complete") {
	init();
} else {
	window.addEventListener("load", init);
}

// ============================================================
// MAIN.TS — Content Script Bridge (Isolated World)
// ============================================================
// Runs in ISOLATED world (has access to browser.runtime API).
// Injects scraper.ts (compiled) into the page's MAIN world.
// Relays messages: popup ↔ content.js ↔ scraper.js (page context)
// Also handles in-page export button UI events.
// Stores scrape state so popup can reconnect after being closed.
// ============================================================

import { type ExportData, exportCSV, exportJSON } from "./exporter";
import {
	injectBadge,
	injectExportButton,
	isOutputTaxPage,
	removeExportButton,
	updatePanelComplete,
	updatePanelError,
	updatePanelIdle,
	updatePanelProgress,
} from "./ui";

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

// ── SPA Detection ───────────────────────────────────

let lastUrl = location.href;
const observer = new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
		lastUrl = url;
		console.log("Better Coretax: URL changed to", url);
		onNavigate();
	}
});

observer.observe(document, { subtree: true, childList: true });

// ── Inject the scraper script into MAIN world ───────

function injectScraper(): void {
	if (document.getElementById("__ch_scraper_injected__")) return;

	const script = document.createElement("script");
	script.id = "__ch_scraper_injected__";
	script.src = browser.runtime.getURL("content/scraper.js");
	script.onload = () => {
		console.log("Better Coretax: Scraper injected into page context");
	};
	(document.head || document.documentElement).appendChild(script);
}

// ── Helper: safely send message to popup ────────────

function sendToPopup(msg: Record<string, unknown>): void {
	try {
		browser.runtime.sendMessage(msg).catch(() => {
			// Popup closed or extension context invalidated
		});
	} catch (_) {
		// Extension context invalidated or popup closed
	}
}

// ── Relay: Popup → Content → Page ───────────────────

browser.runtime.onMessage.addListener(
	(msg: Record<string, unknown>, _sender, sendResponse) => {
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
	}

	if (cleanMsg.type === "SCRAPE_ERROR") {
		isRunning = false;
		updatePanelError(cleanMsg.message || "Error");
	}

	// Forward to popup
	sendToPopup(cleanMsg);
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

document.addEventListener("ch:export", ((e: CustomEvent<string>) => {
	if (!scrapedData || !scrapedFields) return;

	if (e.detail === "csv") {
		const exportData: ExportData = {
			data: scrapedData,
			fields: scrapedFields,
		};
		exportCSV(exportData);
	} else if (e.detail === "json") {
		exportJSON(scrapedData);
	}
}) as EventListener);

// ── Init & Navigation ───────────────────────────────

function onNavigate(): void {
	if (isOutputTaxPage()) {
		injectBadge();
		injectScraper();
		injectExportButton();
	} else {
		removeExportButton();
	}
}

function init(): void {
	console.log("Better Coretax: Initializing on page...", window.location.href);
	injectBadge();
	injectScraper();

	if (isOutputTaxPage()) {
		injectExportButton();
	}
}

if (document.readyState === "complete") {
	init();
} else {
	window.addEventListener("load", init);
}

// ============================================================
// MAIN.TS — Content Script Bridge (Isolated World)
// ============================================================
// Runs in ISOLATED world (has access to browser.runtime API).
// Injects scraper.ts (compiled) into the page's MAIN world.
// Relays messages: popup ↔ content.js ↔ scraper.js (page context)
// Stores scrape state so popup can reconnect after being closed.
// ============================================================

import { injectBadge } from "./ui";

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

// ── SPA Detection ───────────────────────────────────

let lastUrl = location.href;
const observer = new MutationObserver(() => {
	const url = location.href;
	if (url !== lastUrl) {
		lastUrl = url;
		console.log("Better Coretax: URL changed to", url);
		init();
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

// ── Relay: Page → Content → Popup ───────────────────

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

	// Forward to popup
	sendToPopup(cleanMsg);
});

// ── Init ────────────────────────────────────────────

function init(): void {
	console.log("Better Coretax: Initializing on page...", window.location.href);
	injectBadge();
	injectScraper();
}

if (document.readyState === "complete") {
	init();
} else {
	window.addEventListener("load", init);
}

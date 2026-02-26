// ============================================================
// CONTENT.JS — Bridge between Popup and Injected Page Script
// ============================================================
// Runs in ISOLATED world (has access to chrome.runtime API).
// Injects injected.js into the page's MAIN world.
// Relays messages: popup ↔ content.js ↔ injected.js (page context)
// Stores scrape state so popup can reconnect after being closed.
// ============================================================

(() => {
	// ── State storage (persists while page is open) ─────
	let lastState = null;

	// ── Inject the page script into MAIN world ──────────

	const script = document.createElement("script");
	script.src = chrome.runtime.getURL("injected.js");
	script.onload = () => {
		script.remove();
	};
	(document.head || document.documentElement).appendChild(script);

	// ── Helper: safely send message to popup ────────────
	// Uses try/catch because popup may be closed

	function sendToPopup(msg) {
		try {
			chrome.runtime.sendMessage(msg, () => {
				// Check for errors (popup closed etc.)
				void chrome.runtime.lastError;
			});
		} catch (_) {
			// Extension context invalidated or popup closed
		}
	}

	// ── Relay: Popup → Content → Page ───────────────────

	chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
	});

	// ── Relay: Page → Content → Popup ───────────────────

	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		if (!event.data || event.data.direction !== "FROM_PAGE") return;

		const { direction, ...cleanMsg } = event.data;

		// Store state for reconnection
		if (
			cleanMsg.type === "SCRAPE_PROGRESS" ||
			cleanMsg.type === "SCRAPE_COMPLETE" ||
			cleanMsg.type === "SCRAPE_ERROR"
		) {
			lastState = cleanMsg;
		}

		// Forward to popup
		sendToPopup(cleanMsg);
	});
})();

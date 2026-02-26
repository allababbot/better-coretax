// ============================================================
// INJECTED.JS — Runs in PAGE context (MAIN world)
// ============================================================
// This script has access to the page's actual XHR, Angular, etc.
// Communicates with content.js via window.postMessage
// ============================================================

(() => {
	const PAGE_SIZE = 50;
	const DELAY_MS = 300;
	const TIMEOUT = 30000;

	let isRunning = false;
	let stopRequested = false;

	// ── Listen for messages from content.js ─────────────

	window.addEventListener("message", (event) => {
		if (event.source !== window) return;
		if (!event.data || event.data.direction !== "FROM_CONTENT") return;

		const msg = event.data;

		if (msg.type === "START_SCRAPE") {
			if (isRunning) return;
			stopRequested = false;
			startScraping();
		}

		if (msg.type === "STOP_SCRAPE") {
			stopRequested = true;
		}
	});

	// ── Send message to content.js ──────────────────────

	function sendToContent(msg) {
		try {
			window.postMessage({ ...msg, direction: "FROM_PAGE" }, "*");
		} catch (_) {
			// Never let messaging errors stop the scraping loop
		}
	}

	// ── In-page floating badge (visible without popup) ──

	let badge = null;

	function showBadge(text) {
		if (!badge) {
			badge = document.createElement("div");
			badge.id = "__scraper_badge__";
			badge.style.cssText =
				"position:fixed;bottom:16px;right:16px;z-index:999999;" +
				"background:#1a1f2e;color:#60a5fa;border:1px solid #3b82f6;" +
				"padding:8px 14px;border-radius:8px;font:13px/1.4 sans-serif;" +
				"box-shadow:0 4px 12px rgba(0,0,0,0.5);pointer-events:none;";
			document.body.appendChild(badge);
		}
		badge.textContent = text;
	}

	function hideBadge() {
		if (badge) {
			badge.remove();
			badge = null;
		}
	}

	// ── Intercept XHR to capture Angular's request ──────

	function interceptRequest() {
		return new Promise((resolve, reject) => {
			const origOpen = XMLHttpRequest.prototype.open;
			const origSend = XMLHttpRequest.prototype.send;
			const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
			let found = false;

			XMLHttpRequest.prototype.open = function (method, url, ...args) {
				this.__url = url;
				this.__method = method;
				this.__headers = {};
				return origOpen.apply(this, [method, url, ...args]);
			};

			XMLHttpRequest.prototype.setRequestHeader = function (...args) {
				if (this.__headers) this.__headers[args[0]] = args[1];
				return origSetHeader.apply(this, args);
			};

			XMLHttpRequest.prototype.send = function (body) {
				const xhr = this;
				if (!found && xhr.__url && xhr.__url.includes("outputinvoice/list")) {
					found = true;
					let parsedBody = null;
					try {
						parsedBody = JSON.parse(body);
					} catch (_) {
						/* ignore */
					}

					xhr.addEventListener("load", () => {
						XMLHttpRequest.prototype.open = origOpen;
						XMLHttpRequest.prototype.send = origSend;
						XMLHttpRequest.prototype.setRequestHeader = origSetHeader;

						let respData = null;
						try {
							respData = JSON.parse(xhr.responseText);
						} catch (_) {
							/* ignore */
						}

						resolve({
							url: xhr.__url,
							headers: { ...xhr.__headers },
							body: parsedBody,
							rawBody: body,
							response: respData,
							initialData: respData?.Payload?.Data || [],
							initialFirst: parsedBody?.First || 0,
						});
					});

					xhr.addEventListener("error", () => {
						XMLHttpRequest.prototype.open = origOpen;
						XMLHttpRequest.prototype.send = origSend;
						XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
						reject(new Error("Request gagal"));
					});
				}
				return origSend.call(this, body);
			};

			// Auto-click Next Page button (PrimeNG)
			setTimeout(() => {
				const nextBtn = document.querySelector(
					"button.p-paginator-next:not(.p-disabled)",
				);
				if (nextBtn) {
					nextBtn.click();
				}
			}, 500);

			// Timeout after 15 seconds
			setTimeout(() => {
				if (!found) {
					XMLHttpRequest.prototype.open = origOpen;
					XMLHttpRequest.prototype.send = origSend;
					XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
					reject(
						new Error(
							"Tidak ada request tertangkap. Pastikan data sudah dimuat (klik Cari/Refresh).",
						),
					);
				}
			}, 15000);
		});
	}

	// ── XHR request function ────────────────────────────

	function xhrRequest(captured, first, rows) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open("POST", captured.url, true);

			for (const [k, v] of Object.entries(captured.headers)) {
				xhr.setRequestHeader(k, v);
			}

			xhr.timeout = TIMEOUT;

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const data = JSON.parse(xhr.responseText);
						resolve(data?.Payload?.Data || []);
					} catch (_) {
						reject(new Error(`Parse error di First=${first}`));
					}
				} else {
					reject(new Error(`HTTP ${xhr.status} di First=${first}`));
				}
			};
			xhr.onerror = () => reject(new Error(`Network error di First=${first}`));
			xhr.ontimeout = () => reject(new Error(`Timeout di First=${first}`));

			const body = JSON.parse(captured.rawBody);
			body.First = first;
			body.Rows = rows;
			xhr.send(JSON.stringify(body));
		});
	}

	function delay(ms) {
		return new Promise((r) => setTimeout(r, ms));
	}

	// ── Main scraping function ──────────────────────────

	async function startScraping() {
		isRunning = true;
		console.log("[Scraper] ▶ Starting scrape...");
		showBadge("⏳ Menangkap request...");

		try {
			sendToContent({
				type: "SCRAPE_PROGRESS",
				total: 0,
				page: 0,
				elapsed: "0s",
				status: "Menangkap request dari Angular...",
			});

			const captured = await interceptRequest();

			const allData = [];
			const seen = new Set();
			let page = 0;
			let first = 0;
			let keepGoing = true;
			let errorCount = 0;
			const MAX_ERRORS = 3;
			const startTime = Date.now();

			while (keepGoing && !stopRequested) {
				page++;
				try {
					const rows = await xhrRequest(captured, first, PAGE_SIZE);
					const newRows = [];

					for (const row of rows) {
						const key =
							row.RecordId || row.AggregateIdentifier || JSON.stringify(row);
						if (!seen.has(key)) {
							seen.add(key);
							newRows.push(row);
							allData.push(row);
						}
					}

					const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

					console.log(
						`[Scraper] Page ${page}: ${rows.length} rows, ${newRows.length} new, total=${allData.length}, ${elapsed}`,
					);
					showBadge(`📊 ${allData.length} data | Page ${page} | ${elapsed}`);

					sendToContent({
						type: "SCRAPE_PROGRESS",
						total: allData.length,
						page,
						elapsed,
						status: `Page ${page}: ${rows.length} baris, ${newRows.length} baru`,
					});

					if (rows.length < PAGE_SIZE) {
						keepGoing = false;
					} else {
						first += PAGE_SIZE;
						errorCount = 0;
						await delay(DELAY_MS);
					}
				} catch (err) {
					errorCount++;
					if (errorCount >= MAX_ERRORS) {
						keepGoing = false;
						sendToContent({
							type: "SCRAPE_ERROR",
							message: `${MAX_ERRORS} error berturut-turut: ${err.message}`,
						});
					} else {
						await delay(2000);
					}
				}
			}

			if (stopRequested) {
				console.log("[Scraper] ⏹ Stopped by user.");
				hideBadge();
				isRunning = false;
				return;
			}

			// Collect fields
			const fieldSet = new Set();
			for (const r of allData) {
				for (const k of Object.keys(r)) {
					fieldSet.add(k);
				}
			}

			const totalElapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

			console.log(
				`[Scraper] ✅ Complete: ${allData.length} records in ${totalElapsed}`,
			);
			showBadge(`✅ Selesai! ${allData.length} data | ${totalElapsed}`);

			sendToContent({
				type: "SCRAPE_COMPLETE",
				data: allData,
				fields: [...fieldSet],
				total: allData.length,
				pages: page,
				elapsed: totalElapsed,
			});
		} catch (err) {
			console.error("[Scraper] ❌ Error:", err.message);
			showBadge(`❌ Error: ${err.message}`);

			sendToContent({
				type: "SCRAPE_ERROR",
				message: err.message,
			});
		}

		console.log("[Scraper] ⏹ Scraping finished. isRunning=false");
		isRunning = false;
	}

	// Signal that injected script is ready
	sendToContent({ type: "INJECTED_READY" });
})();

// ============================================================
// SCRAPER.TS — Runs in PAGE context (MAIN world)
// ============================================================
// Injected by main.ts into the page to access Angular's XHR.
// Communicates with content script via window.postMessage.
// ============================================================

(() => {
	const PAGE_SIZE = 50;
	const DELAY_MS = 300;
	const TIMEOUT = 30000;
	const MAX_ERRORS = 3;

	let isRunning = false;
	let stopRequested = false;

	// ── Types ──────────────────────────────────────────

	interface CapturedRequest {
		url: string;
		headers: Record<string, string>;
		body: Record<string, unknown> | null;
		rawBody: string;
		response: unknown;
		initialData: Record<string, unknown>[];
		initialFirst: number;
		source: "OUTPUT_TAX" | "SPT_A2" | "SPT_B2" | "WITHHOLDING_SLIPS";
	}

	interface ScrapeProgress {
		type: "SCRAPE_PROGRESS";
		total: number;
		page: number;
		elapsed: string;
		status: string;
	}

	interface ScrapeComplete {
		type: "SCRAPE_COMPLETE";
		data: Record<string, unknown>[];
		fields: string[];
		total: number;
		pages: number;
		elapsed: string;
		filenameHint?: string;
		source: "OUTPUT_TAX" | "SPT_A2" | "SPT_B2" | "WITHHOLDING_SLIPS";
	}

	interface ScrapeError {
		type: "SCRAPE_ERROR";
		message: string;
	}

	type ScrapeMessage =
		| ScrapeProgress
		| ScrapeComplete
		| ScrapeError
		| { type: "INJECTED_READY" };

	// Extend XHR for intercepted properties
	interface InterceptedXHR extends XMLHttpRequest {
		__url?: string;
		__method?: string;
		__headers?: Record<string, string>;
	}

	// ── Listen for messages from content.js ─────────────

	window.addEventListener("message", (event: MessageEvent) => {
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

	function sendToContent(msg: ScrapeMessage): void {
		try {
			window.postMessage({ ...msg, direction: "FROM_PAGE" }, "*");
		} catch (_) {
			// Never let messaging errors stop the scraping loop
		}
	}

	// ── Intercept XHR to capture Angular's request ──────

	// ── Global XHR Interception Layer ──────────────────

	const origOpen = XMLHttpRequest.prototype.open;
	const origSend = XMLHttpRequest.prototype.send;
	const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

	const filterState: Record<string, any> = {};
	const captureSubscribers: ((req: CapturedRequest) => void)[] = [];
	let lastCaptured: CapturedRequest | null = null;
	let lastCapturedTime = 0;

	// ── Message Listener for Filters ───────────────────

	window.addEventListener("message", (event) => {
		if (event.source !== window || event.data.direction !== "FROM_CONTENT")
			return;
		if (event.data.type === "SET_SERVER_FILTER") {
			const { field, value } = event.data;
			if (value) {
				filterState[field] = { value, matchMode: "contains" };
			} else {
				delete filterState[field];
			}
		}
	});

	// ── Prototype Overrides ────────────────────────────

	XMLHttpRequest.prototype.open = function (
		this: InterceptedXHR,
		method: string,
		url: string | URL,
		...args: unknown[]
	) {
		this.__url = String(url);
		this.__method = method;
		this.__headers = {};
		return origOpen.apply(this, [method, url, ...args] as Parameters<typeof origOpen>);
	} as typeof XMLHttpRequest.prototype.open;

	XMLHttpRequest.prototype.setRequestHeader = function (
		this: InterceptedXHR,
		...args: [string, string]
	) {
		if (this.__headers) this.__headers[args[0]] = args[1];
		return origSetHeader.apply(this, args);
	};

	XMLHttpRequest.prototype.send = function (
		this: InterceptedXHR,
		body?: Document | XMLHttpRequestBodyInit | null,
	) {
		const xhr = this;
		let finalBody = body;

		const isOutputTax = xhr.__url?.includes("outputinvoice/list");
		const isA2 = xhr.__url?.includes("la2-grid");
		const isB2 = xhr.__url?.includes("lb2-grid");
		const isWithholding = xhr.__url?.includes("GetMyWithholdingSlip");
		const isTargetApi = isOutputTax || isA2 || isB2 || isWithholding;

		// 1. Inject Filter (Strategi B)
		if (isTargetApi && typeof body === "string") {
			try {
				const parsed = JSON.parse(body);
				const filterKey = "Filters" in parsed ? "Filters" : "filters";
				if (!parsed[filterKey]) parsed[filterKey] = [];

				if (Array.isArray(parsed[filterKey])) {
					// Remove existing "Reference" filter to prevent duplicates
					parsed[filterKey] = parsed[filterKey].filter((f: any) => f.PropertyName !== "Reference");
					
					// Inject active filters
					for (const [field, config] of Object.entries(filterState)) {
						parsed[filterKey].push({
							PropertyName: field,
							Value: config.value,
							MatchMode: "contains", 
							CaseSensitive: false, 
							AsString: false // Changed to false to try matching native behavior
						});
					}
				}
				finalBody = JSON.stringify(parsed);
			} catch (e) {
				console.error("Better Coretax [Scraper]: Filter injection failed", e);
			}
		}

		// 2. Data Inspection & Capture
		if (isTargetApi) {
			const currentFinalBody = finalBody;
			xhr.addEventListener("load", () => {
				let respData: any = null;
				try { respData = JSON.parse(xhr.responseText); } catch (_) { }

				const captured: CapturedRequest = {
					url: xhr.__url || "",
					headers: { ...(xhr.__headers || {}) },
					body: null,
					rawBody: typeof currentFinalBody === "string" ? currentFinalBody : "",
					response: respData,
					initialData: respData?.Payload?.Data || [],
					initialFirst: 0,
					source: isA2 ? "SPT_A2" : (isB2 ? "SPT_B2" : (isWithholding ? "WITHHOLDING_SLIPS" : "OUTPUT_TAX"))
				};

				// Update global cache
				lastCaptured = captured;
				lastCapturedTime = Date.now();

				const subs = [...captureSubscribers];
				captureSubscribers.length = 0;
				subs.forEach(s => s(captured));
			});
		}

		return origSend.call(this, finalBody);
	};

	// ── Intercept XHR to capture Angular's request ──────

	function interceptRequest(): Promise<CapturedRequest> {
		return new Promise<CapturedRequest>((resolve, reject) => {
			let resolved = false;

			// 1. Check if we have a "warm" cache from the same portal context
			if (lastCaptured && (Date.now() - lastCapturedTime < 300000)) { // 5 minutes fresh
				console.log("[Scraper] Using cached request from history.");
				resolved = true;
				resolve(lastCaptured);
				return;
			}

			const sub = (req: CapturedRequest) => {
				resolved = true;
				resolve(req);
			};
			captureSubscribers.push(sub);

			// 2. Strategy: Try clicking "Next Page" first
			setTimeout(() => {
				const nextBtn = document.querySelector("button.p-paginator-next:not(.p-disabled)") as HTMLButtonElement;
				if (nextBtn) {
					console.log("[Scraper] Triggering Next Page...");
					nextBtn.click();
				} else {
					// 3. Fallback Strategy: Try clicking "Refresh" or "Cari" if Next is not available
					console.log("[Scraper] Next button not available/disabled. Trying fallback trigger...");
					const fallbackBtn = Array.from(document.querySelectorAll("button")).find(b => {
						const t = b.textContent?.toLowerCase() || "";
						return t.includes("cari") || t.includes("search") || t.includes("refresh") || 
						       b.querySelector(".pi-search") || b.querySelector(".pi-refresh") || b.querySelector(".pi-filter");
					}) as HTMLButtonElement;
					
					if (fallbackBtn) {
						console.log("[Scraper] Triggering fallback button:", fallbackBtn.textContent?.trim());
						fallbackBtn.click();
					} else {
						console.warn("[Scraper] No trigger buttons found.");
					}
				}
			}, 500);

			// Timeout
			setTimeout(() => {
				if (!resolved) {
					// Remove subscriber if still there
					const idx = captureSubscribers.indexOf(sub);
					if (idx > -1) captureSubscribers.splice(idx, 1);
					reject(new Error("Tidak ada request tertangkap (Timeout). Silakan muat ulang data atau klik tombol filter/cari di halaman."));
				}
			}, 15000);
		});
	}

	// ── XHR request function ────────────────────────────

	function xhrRequest(
		captured: CapturedRequest,
		first: number,
		rows: number,
	): Promise<Record<string, unknown>[]> {
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
						const data = JSON.parse(xhr.responseText) as {
							Payload?: { Data?: Record<string, unknown>[] };
						};
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

			const body = JSON.parse(captured.rawBody) as Record<string, unknown>;
			body.First = first;
			body.Rows = rows;
			xhr.send(JSON.stringify(body));
		});
	}

	/**
	 * Fetch PDF document from DJP API
	 */
	function xhrDownloadPdf(
		captured: CapturedRequest,
		row: any
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			const url = captured.url.replace("GetMyWithholdingSlip", "DownloadWithholdingSlips/download-pdf-document");
			xhr.open("POST", url, true);

			for (const [k, v] of Object.entries(captured.headers)) {
				xhr.setRequestHeader(k, v);
			}

			xhr.timeout = TIMEOUT;

			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const res = JSON.parse(xhr.responseText);
						if (res.IsSuccessful && res.Payload && res.Payload.Message && res.Payload.Message.Data) {
							resolve(res.Payload.Message.Data);
						} else {
							reject(new Error(res.Message || (res.Payload && res.Payload.Message && res.Payload.Message.ErrorMessage) || "Gagal mengambil konten PDF"));
						}
					} catch (_) {
						reject(new Error("Parse error saat download PDF"));
					}
				} else {
					reject(new Error(`HTTP ${xhr.status} saat download PDF`));
				}
			};
			xhr.onerror = () => reject(new Error("Network error saat download PDF"));
			xhr.ontimeout = () => reject(new Error("Timeout saat download PDF"));

			// Map identifiers from row to expected request body
			const capturedBody = captured.rawBody ? JSON.parse(captured.rawBody) : {};
			const body = {
				WithholdingSlipsAggregateIdentifier: row.WithholdingslipsAggregateIdentifier,
				WithholdingSlipsRecordIdentifier: row.RecordId,
				DocumentAggregateIdentifier: row.DocumentFormAggregateIdentifier,
				TaxpayerAggregateIdentifier: row.TaxpayerAggregateIdentifier,
				EbupotType: capturedBody.WithholdingType || "EBUPOTBPU",
				DocumentDate: row.WithholdingSlipsDate,
				TaxIdentificationNumber: row.TaxIdentificationNumber
			};
			
			console.log("[Scraper] Mengirim request PDF dengan payload:", body);
			xhr.send(JSON.stringify(body));
		});
	}

	function delay(ms: number): Promise<void> {
		return new Promise((r) => setTimeout(r, ms));
	}

	// ── Main scraping function ──────────────────────────

	async function startScraping(): Promise<void> {
		isRunning = true;
		console.log("[Scraper] ▶ Starting scrape...");

		try {
			sendToContent({
				type: "SCRAPE_PROGRESS",
				total: 0,
				page: 0,
				elapsed: "0s",
				status: "Menangkap request dari Angular...",
			});

			const captured = await interceptRequest();

			const allData: Record<string, unknown>[] = [];
			const seen = new Set<string>();
			let page = 0;
			let first = 0;
			let keepGoing = true;
			let errorCount = 0;
			const startTime = Date.now();

			const isSpt = captured.source === "SPT_A2" || captured.source === "SPT_B2";
			// Boost OutputTax (e-faktur) step to 500 per page and reduce delay to 100ms
			const step = isSpt ? 1000 : 500;
			const delayMs = isSpt ? 150 : 100;

			while (keepGoing && !stopRequested) {
				page++;
				try {
					const rows = await xhrRequest(captured, first, step);
					const newRows: Record<string, unknown>[] = [];

					for (const row of rows) {
						// Fallback identifier if RecordId/AggregateIdentifier is missing.
						const key =
							(row.RecordId as string) ||
							(row.AggregateIdentifier as string) ||
							JSON.stringify(row);
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

					sendToContent({
						type: "SCRAPE_PROGRESS",
						total: allData.length,
						page,
						elapsed,
						status: `Page ${page}: ${rows.length} baris, ${newRows.length} baru`,
					});

					if (rows.length < step) {
						keepGoing = false;
					} else {
						first += step;
						errorCount = 0;
						await delay(delayMs);
					}
				} catch (err) {
					errorCount++;
					const errMsg = err instanceof Error ? err.message : String(err);
					if (errorCount >= MAX_ERRORS) {
						keepGoing = false;
						sendToContent({
							type: "SCRAPE_ERROR",
							message: `${MAX_ERRORS} error berturut-turut: ${errMsg}`,
						});
					} else {
						await delay(2000);
					}
				}
			}

			if (stopRequested) {
				console.log("[Scraper] ⏹ Stopped by user.");
				isRunning = false;
				return;
			}

			// Collect all fields
			const fieldSet = new Set<string>();
			for (const r of allData) {
				for (const k of Object.keys(r)) {
					fieldSet.add(k);
				}
			}

			const totalElapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

			console.log(
				`[Scraper] ✅ Complete: ${allData.length} records in ${totalElapsed}`,
			);

			let filenameHint = "";
			try {
				const reqBody = JSON.parse(captured.rawBody);
				const filterKey = "Filters" in reqBody ? "Filters" : "filters";
				if (reqBody[filterKey] && Array.isArray(reqBody[filterKey])) {
					const perFilter = reqBody[filterKey].find((f: any) => 
						f.PropertyName && f.PropertyName.toLowerCase().includes("period")
					);
					if (perFilter && perFilter.Value) {
						filenameHint = String(perFilter.Value).replace(/[^a-zA-Z0-9_-]/g, "");
					}
				}
			} catch (_) {}

			if (captured.source === "WITHHOLDING_SLIPS") {
				// Special handling for Bulk PDF Download
				const total = allData.length;
				console.log(`[Scraper] Starting Bulk PDF download for ${total} items...`);
				
				for (let i = 0; i < total; i++) {
					if (stopRequested) break;
					
					const row = allData[i];
					const status = `Mengunduh PDF ${i + 1}/${total}: ${row.WithholdingSlipNumber || '...'}`;
					
					sendToContent({
						type: "SCRAPE_PROGRESS",
						total: i + 1,
						page,
						elapsed: totalElapsed,
						status: status,
					});

					try {
						const base64 = await xhrDownloadPdf(captured, row);
						// Send the individual PDF to content script to trigger browser download
						window.postMessage({
							type: "DOWNLOAD_PDF_ITEM",
							base64: base64,
							item: row,
							direction: "FROM_PAGE"
						}, "*");
						
						// Wait a bit between downloads to be safe
						await delay(800);
					} catch (err) {
						console.error(`[Scraper] Gagal unduh PDF idx ${i}:`, err);
						// Continue to next file even if one fails
					}
				}
			}

			sendToContent({
				type: "SCRAPE_COMPLETE",
				data: allData,
				fields: [...fieldSet],
				total: allData.length,
				pages: page,
				elapsed: totalElapsed,
				filenameHint: filenameHint || undefined,
				source: captured.source
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			console.error("[Scraper] ❌ Error:", errMsg);

			sendToContent({
				type: "SCRAPE_ERROR",
				message: errMsg,
			});
		}

		console.log("[Scraper] ⏹ Scraping finished. isRunning=false");
		isRunning = false;
	}

	// Signal that injected script is ready
	sendToContent({ type: "INJECTED_READY" });
})();

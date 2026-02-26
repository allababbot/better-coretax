// ============================================================
// Coretax Faktur Pajak Keluaran — Console Scraper
// ============================================================
// Paste script ini di DevTools Console (F12) saat berada
// di halaman Faktur Pajak Keluaran di Coretax DJP.
//
// Cara kerja:
//   1. Intercept request Angular untuk ambil auth token & format
//   2. Auto-klik tombol Next Page untuk trigger request pertama
//   3. Scroll pagination (First=0, 50, 100...) sampai habis
//   4. Export otomatis ke CSV
//
// Catatan teknis:
//   - TotalRecords dari API tidak akurat (selalu First + Rows + 1)
//   - Server max 50 baris per request
//   - Script berhenti saat server mengembalikan < 50 baris
// ============================================================

(async function autoScrape() {
	const PAGE_SIZE = 50;
	const DELAY_MS = 300;
	const TIMEOUT = 30000;

	const log = (icon, msg) => console.log(`%c${icon} ${msg}`, "font-size:13px");

	// ── STEP 1: Intercept request dari Angular ────────────────────

	log("🚀", "CORETAX FAKTUR PAJAK SCRAPER");
	log("ℹ️", "Strategi: Intercept → Scroll Pagination → Export CSV");
	console.log("");

	const captured = await new Promise((resolve, reject) => {
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
			if (!found && this.__url && this.__url.includes("outputinvoice/list")) {
				found = true;
				let parsedBody = null;
				try {
					parsedBody = JSON.parse(body);
				} catch (_) {}

				xhr.addEventListener("load", () => {
					XMLHttpRequest.prototype.open = origOpen;
					XMLHttpRequest.prototype.send = origSend;
					XMLHttpRequest.prototype.setRequestHeader = origSetHeader;

					let respData = null;
					try {
						respData = JSON.parse(xhr.responseText);
					} catch (_) {}

					resolve({
						url: xhr.__url,
						headers: { ...xhr.__headers },
						body: parsedBody,
						rawBody: body,
						initialData: respData?.Payload?.Data || [],
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

		// Auto-klik tombol Next Page (PrimeNG)
		setTimeout(() => {
			const nextBtn = document.querySelector(
				"button.p-paginator-next:not(.p-disabled)",
			);
			if (nextBtn) {
				log("ℹ️", "Auto-klik tombol Next Page...");
				nextBtn.click();
			} else {
				log("⚠️", "Tombol Next tidak ditemukan. Klik pagination manual.");
			}
		}, 500);

		setTimeout(() => {
			if (!found) {
				XMLHttpRequest.prototype.open = origOpen;
				XMLHttpRequest.prototype.send = origSend;
				XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
				reject(new Error("Timeout 60s: tidak ada request tertangkap."));
			}
		}, 60000);
	});

	log("✅", "Request tertangkap!");
	console.log(`  URL: ${captured.url}`);
	console.log(`  Filters: ${JSON.stringify(captured.body?.Filters)}`);
	console.log("");

	// ── STEP 2: Scroll pagination ─────────────────────────────────

	function xhrRequest(first, rows) {
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
						resolve(JSON.parse(xhr.responseText)?.Payload?.Data || []);
					} catch (_) {
						reject(new Error(`Parse error @ First=${first}`));
					}
				} else {
					reject(new Error(`HTTP ${xhr.status} @ First=${first}`));
				}
			};
			xhr.onerror = () => reject(new Error(`Network error @ First=${first}`));
			xhr.ontimeout = () => reject(new Error(`Timeout @ First=${first}`));

			const body = JSON.parse(captured.rawBody);
			body.First = first;
			body.Rows = rows;
			xhr.send(JSON.stringify(body));
		});
	}

	const delay = (ms) => new Promise((r) => setTimeout(r, ms));

	log("🚀", "Scroll pagination — mengambil semua halaman...");
	console.log("");

	const allData = [];
	const seen = new Set();
	let page = 0;
	let first = 0;
	let keepGoing = true;
	let errorCount = 0;
	const startTime = Date.now();

	while (keepGoing) {
		page++;
		try {
			const rows = await xhrRequest(first, PAGE_SIZE);

			for (const row of rows) {
				const key =
					row.RecordId || row.AggregateIdentifier || JSON.stringify(row);
				if (!seen.has(key)) {
					seen.add(key);
					allData.push(row);
				}
			}

			const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
			log(
				"📦",
				`Page ${page} (First=${first}): +${rows.length} baris → total: ${allData.length} [${elapsed}s]`,
			);

			if (rows.length < PAGE_SIZE) {
				log("✅", `Halaman terakhir (${rows.length} < ${PAGE_SIZE}). Selesai!`);
				keepGoing = false;
			} else {
				first += PAGE_SIZE;
				errorCount = 0;
				await delay(DELAY_MS);
			}
		} catch (err) {
			errorCount++;
			log("⚠️", `Error page ${page}: ${err.message} (${errorCount}/3)`);
			if (errorCount >= 3) {
				log("❌", "3 error berturut-turut. Berhenti.");
				keepGoing = false;
			} else {
				await delay(2000);
			}
		}
	}

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log("");
	log(
		"🎉",
		`SELESAI! ${allData.length} faktur — ${totalTime}s, ${page} halaman`,
	);

	// ── STEP 3: Export ────────────────────────────────────────────

	if (allData.length === 0) {
		log("⚠️", "Tidak ada data.");
		return;
	}

	const fieldSet = new Set();
	for (const r of allData) {
		for (const k of Object.keys(r)) {
			fieldSet.add(k);
		}
	}
	const fields = [...fieldSet];

	log("ℹ️", `${fields.length} kolom, sample:`);
	console.table(allData.slice(0, 3));

	function exportCSV() {
		const esc = (v) => {
			if (v == null) return "";
			const s = String(v);
			return s.includes(",") || s.includes('"') || s.includes("\n")
				? `"${s.replace(/"/g, '""')}"`
				: s;
		};
		let csv = `${fields.map(esc).join(",")}\n`;
		for (const row of allData) {
			csv += `${fields.map((f) => esc(row[f])).join(",")}\n`;
		}
		const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `faktur_pajak_keluaran_${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		log("✅", `CSV: ${a.download} (${allData.length} baris)`);
	}

	function exportJSON() {
		const blob = new Blob([JSON.stringify(allData, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `faktur_pajak_keluaran_${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
		log("✅", `JSON: ${a.download}`);
	}

	exportCSV();

	window.__SCRAPED_FAKTUR = allData;
	window.__exportCSV = exportCSV;
	window.__exportJSON = exportJSON;

	console.log("");
	log("ℹ️", "Ketik __exportCSV() atau __exportJSON() untuk download ulang");
})();

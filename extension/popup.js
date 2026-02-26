// ============================================================
// POPUP.JS — Popup ↔ Content Script Messaging
// ============================================================

(() => {
	// DOM elements
	const btnScrape = document.getElementById("btn-scrape");
	const btnCsv = document.getElementById("btn-csv");
	const btnJson = document.getElementById("btn-json");
	const statusBadge = document.getElementById("status-badge");
	const statusText = document.getElementById("status-text");
	const infoBox = document.getElementById("info-box");
	const progressSection = document.getElementById("progress-section");
	const exportSection = document.getElementById("export-section");
	const statTotal = document.getElementById("stat-total");
	const statPages = document.getElementById("stat-pages");
	const statTime = document.getElementById("stat-time");
	const progressText = document.getElementById("progress-text");
	const hintBox = document.getElementById("hint-box");

	let scrapedData = null;
	let scrapedFields = null;
	let isRunning = false;
	let pollInterval = null;

	// ── Helpers ──────────────────────────────────────────

	function setStatus(type, text) {
		statusBadge.className = `badge badge-${type}`;
		statusText.textContent = text;
	}

	function showProgress() {
		progressSection.classList.remove("hidden");
	}

	function showExport() {
		exportSection.classList.remove("hidden");
	}

	function hideExport() {
		exportSection.classList.add("hidden");
	}

	function setScrapeButton() {
		btnScrape.innerHTML = `
			<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
				<rect x="4" y="4" width="10" height="10" rx="1"/>
			</svg>
			Hentikan
		`;
		btnScrape.classList.remove("btn-primary");
		btnScrape.classList.add("btn-stop");
		btnScrape.disabled = false;
	}

	function resetScrapeButton() {
		btnScrape.textContent = "Mulai Scrape";
		btnScrape.classList.remove("btn-stop");
		btnScrape.classList.add("btn-primary");
		btnScrape.disabled = false;
	}

	// ── Check if we're on the right page ─────────────────

	async function getActiveTab() {
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		return tab;
	}

	async function checkPage() {
		const tab = await getActiveTab();
		const url = tab?.url || "";

		if (url.includes("/e-invoice-portal") && url.includes("output-tax")) {
			btnScrape.disabled = false;
			setStatus("ready", "Halaman Faktur Keluaran terdeteksi");
			infoBox.classList.add("hidden");
			hintBox.classList.remove("hidden");
			return true;
		} else if (url.includes("coretaxdjp.pajak.go.id")) {
			btnScrape.disabled = true;
			setStatus("idle", "Bukan halaman Faktur Keluaran");
			infoBox.querySelector("span").innerHTML =
				"Navigasi ke <strong>eFaktur → Pajak Keluaran</strong> terlebih dahulu.";
			infoBox.classList.remove("hidden");
			hintBox.classList.add("hidden");
			return false;
		} else {
			btnScrape.disabled = true;
			setStatus("idle", "Bukan halaman Coretax");
			infoBox.querySelector("span").innerHTML =
				"Buka <strong>Coretax DJP</strong> dan navigasi ke halaman <strong>Faktur Pajak Keluaran</strong>.";
			infoBox.classList.remove("hidden");
			hintBox.classList.add("hidden");
			return false;
		}
	}

	// ── Apply state from content script ──────────────────

	function applyState(state) {
		if (!state) return;

		if (state.type === "SCRAPE_PROGRESS") {
			isRunning = true;
			showProgress();
			hintBox.classList.add("hidden");
			statTotal.textContent = state.total.toLocaleString("id-ID");
			statPages.textContent = state.page;
			statTime.textContent = state.elapsed;
			progressText.textContent = state.status;

			setStatus("running", "Sedang scraping...");
			setScrapeButton();
		}

		if (state.type === "SCRAPE_COMPLETE") {
			isRunning = false;
			scrapedData = state.data;
			scrapedFields = state.fields;
			showProgress();
			hintBox.classList.add("hidden");
			statTotal.textContent = state.total.toLocaleString("id-ID");
			statPages.textContent = state.pages;
			statTime.textContent = state.elapsed;

			progressText.textContent = "";
			setStatus(
				"done",
				`${state.total.toLocaleString("id-ID")} faktur berhasil diambil`,
			);
			resetScrapeButton();
			showExport();
			stopPolling(); // no need to poll anymore
		}

		if (state.type === "SCRAPE_ERROR") {
			isRunning = false;
			showProgress();
			hintBox.classList.add("hidden");
			setStatus("error", state.message);
			progressText.textContent = state.message;

			resetScrapeButton();
			stopPolling();
		}
	}

	// ── Polling: ask content script for state ────────────

	function startPolling(tabId) {
		stopPolling();
		pollInterval = setInterval(async () => {
			try {
				const response = await chrome.tabs.sendMessage(tabId, {
					type: "GET_STATE",
				});
				if (response?.state) {
					applyState(response.state);
				}
			} catch (_) {
				// Content script not available
			}
		}, 500);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	// ── Start / Stop scraping ────────────────────────────

	btnScrape.addEventListener("click", async () => {
		if (isRunning) {
			// Stop scraping
			const tab = await getActiveTab();
			chrome.tabs.sendMessage(tab.id, { type: "STOP_SCRAPE" });
			isRunning = false;
			stopPolling();
			setStatus("idle", "Dihentikan");
			resetScrapeButton();
			return;
		}

		const tab = await getActiveTab();
		if (!tab) return;

		isRunning = true;
		scrapedData = null;
		scrapedFields = null;
		hideExport();
		showProgress();
		hintBox.classList.add("hidden");

		// Reset stats
		statTotal.textContent = "0";
		statPages.textContent = "0";
		statTime.textContent = "0s";

		progressText.textContent = "Menangkap request dari Angular...";

		setStatus("running", "Sedang scraping...");
		setScrapeButton();

		// Send message to content script
		chrome.tabs.sendMessage(tab.id, { type: "START_SCRAPE" });

		// Start polling for state updates
		startPolling(tab.id);
	});

	// ── Export functions ─────────────────────────────────

	function downloadFile(content, filename, mimeType) {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	btnCsv.addEventListener("click", () => {
		if (!scrapedData || !scrapedFields) return;

		const esc = (v) => {
			if (v == null) return "";
			const s = String(v);
			return s.includes(",") || s.includes('"') || s.includes("\n")
				? `"${s.replace(/"/g, '""')}"`
				: s;
		};

		let csv = `${scrapedFields.map(esc).join(",")}\n`;
		for (const row of scrapedData) {
			csv += `${scrapedFields.map((f) => esc(row[f])).join(",")}\n`;
		}

		const d = new Date().toISOString().slice(0, 10);
		downloadFile(
			`\uFEFF${csv}`,
			`faktur_pajak_keluaran_${d}.csv`,
			"text/csv;charset=utf-8",
		);
	});

	btnJson.addEventListener("click", () => {
		if (!scrapedData) return;
		const d = new Date().toISOString().slice(0, 10);
		downloadFile(
			JSON.stringify(scrapedData, null, 2),
			`faktur_pajak_keluaran_${d}.json`,
			"application/json",
		);
	});

	// ── Init ─────────────────────────────────────────────

	async function init() {
		const onPage = await checkPage();
		if (!onPage) return;

		// Check if there's an existing scrape state
		const tab = await getActiveTab();
		if (!tab) return;

		try {
			const response = await chrome.tabs.sendMessage(tab.id, {
				type: "GET_STATE",
			});
			if (response?.state) {
				applyState(response.state);
				// If still running, start polling
				if (response.state.type === "SCRAPE_PROGRESS") {
					startPolling(tab.id);
				}
			}
		} catch (_) {
			// Content script not ready yet
		}
	}

	init();
})();

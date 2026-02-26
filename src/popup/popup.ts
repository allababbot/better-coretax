// ============================================================
// POPUP.TS — Popup ↔ Content Script Messaging
// ============================================================

import { type ExportData, exportCSV, exportJSON } from "../content/exporter";

// ── DOM Elements ─────────────────────────────────────

const btnScrape = document.getElementById("btn-scrape") as HTMLButtonElement;
const btnCsv = document.getElementById("btn-csv") as HTMLButtonElement;
const btnJson = document.getElementById("btn-json") as HTMLButtonElement;
const statusBadge = document.getElementById("status-badge") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const infoBox = document.getElementById("info-box") as HTMLDivElement;
const progressSection = document.getElementById(
	"progress-section",
) as HTMLDivElement;
const exportSection = document.getElementById(
	"export-section",
) as HTMLDivElement;
const statTotal = document.getElementById("stat-total") as HTMLSpanElement;
const statPages = document.getElementById("stat-pages") as HTMLSpanElement;
const statTime = document.getElementById("stat-time") as HTMLSpanElement;
const progressText = document.getElementById("progress-text") as HTMLDivElement;
const hintBox = document.getElementById("hint-box") as HTMLDivElement;

// ── State ────────────────────────────────────────────

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

let scrapedData: Record<string, unknown>[] | null = null;
let scrapedFields: string[] | null = null;
let isRunning = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ── Helpers ──────────────────────────────────────────

function setStatus(type: string, text: string): void {
	statusBadge.className = `badge badge-${type}`;
	statusText.textContent = text;
}

function showProgress(): void {
	progressSection.classList.remove("hidden");
}

function showExport(): void {
	exportSection.classList.remove("hidden");
}

function hideExport(): void {
	exportSection.classList.add("hidden");
}

function setScrapeButton(): void {
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

function resetScrapeButton(): void {
	btnScrape.textContent = "Mulai Scrape";
	btnScrape.classList.remove("btn-stop");
	btnScrape.classList.add("btn-primary");
	btnScrape.disabled = false;
}

// ── Check if we're on the right page ─────────────────

async function getActiveTab(): Promise<browser.tabs.Tab | undefined> {
	const tabs = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});
	return tabs[0];
}

async function checkPage(): Promise<boolean> {
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
		const infoSpan = infoBox.querySelector("span");
		if (infoSpan) {
			infoSpan.innerHTML =
				"Navigasi ke <strong>eFaktur → Pajak Keluaran</strong> terlebih dahulu.";
		}
		infoBox.classList.remove("hidden");
		hintBox.classList.add("hidden");
		return false;
	} else {
		btnScrape.disabled = true;
		setStatus("idle", "Bukan halaman Coretax");
		const infoSpan = infoBox.querySelector("span");
		if (infoSpan) {
			infoSpan.innerHTML =
				"Buka <strong>Coretax DJP</strong> dan navigasi ke halaman <strong>Faktur Pajak Keluaran</strong>.";
		}
		infoBox.classList.remove("hidden");
		hintBox.classList.add("hidden");
		return false;
	}
}

// ── Apply state from content script ──────────────────

function applyState(state: ScrapeState): void {
	if (!state) return;

	if (state.type === "SCRAPE_PROGRESS") {
		isRunning = true;
		showProgress();
		hintBox.classList.add("hidden");
		statTotal.textContent = (state.total || 0).toLocaleString("id-ID");
		statPages.textContent = String(state.page || 0);
		statTime.textContent = state.elapsed || "0s";
		progressText.textContent = state.status || "";

		setStatus("active", "Sedang scraping...");
		setScrapeButton();
	}

	if (state.type === "SCRAPE_COMPLETE") {
		isRunning = false;
		scrapedData = state.data || null;
		scrapedFields = state.fields || null;
		showProgress();
		hintBox.classList.add("hidden");
		statTotal.textContent = (state.total || 0).toLocaleString("id-ID");
		statPages.textContent = String(state.pages || 0);
		statTime.textContent = state.elapsed || "0s";

		progressText.textContent = "";
		setStatus(
			"success",
			`${(state.total || 0).toLocaleString("id-ID")} faktur berhasil diambil`,
		);
		resetScrapeButton();
		showExport();
		stopPolling();
	}

	if (state.type === "SCRAPE_ERROR") {
		isRunning = false;
		showProgress();
		hintBox.classList.add("hidden");
		setStatus("error", state.message || "Error");
		progressText.textContent = state.message || "Error";

		resetScrapeButton();
		stopPolling();
	}
}

// ── Polling: ask content script for state ────────────

function startPolling(tabId: number): void {
	stopPolling();
	pollInterval = setInterval(async () => {
		try {
			const response = await browser.tabs.sendMessage(tabId, {
				type: "GET_STATE",
			});
			if (response?.state) {
				applyState(response.state as ScrapeState);
			}
		} catch (_) {
			// Content script not available
		}
	}, 500);
}

function stopPolling(): void {
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
		if (tab?.id) {
			browser.tabs.sendMessage(tab.id, { type: "STOP_SCRAPE" });
		}
		isRunning = false;
		stopPolling();
		setStatus("idle", "Dihentikan");
		resetScrapeButton();
		return;
	}

	const tab = await getActiveTab();
	if (!tab?.id) return;

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

	setStatus("active", "Sedang scraping...");
	setScrapeButton();

	// Send message to content script
	browser.tabs.sendMessage(tab.id, { type: "START_SCRAPE" });

	// Start polling for state updates
	startPolling(tab.id);
});

// ── Export functions ─────────────────────────────────

btnCsv.addEventListener("click", () => {
	if (!scrapedData || !scrapedFields) return;
	const exportData: ExportData = { data: scrapedData, fields: scrapedFields };
	exportCSV(exportData);
});

btnJson.addEventListener("click", () => {
	if (!scrapedData) return;
	exportJSON(scrapedData);
});

// ── Listen for messages from content script ──────────

function isScrapeState(msg: unknown): msg is ScrapeState {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		typeof (msg as Record<string, unknown>).type === "string" &&
		["SCRAPE_PROGRESS", "SCRAPE_COMPLETE", "SCRAPE_ERROR"].includes(
			(msg as Record<string, unknown>).type as string,
		)
	);
}

browser.runtime.onMessage.addListener((msg: unknown) => {
	if (isScrapeState(msg)) {
		applyState(msg);
	}
});

// ── Init ─────────────────────────────────────────────

async function init(): Promise<void> {
	const onPage = await checkPage();
	if (!onPage) return;

	// Check if there's an existing scrape state
	const tab = await getActiveTab();
	if (!tab?.id) return;

	try {
		const response = await browser.tabs.sendMessage(tab.id, {
			type: "GET_STATE",
		});
		if (response?.state) {
			applyState(response.state as ScrapeState);
			// If still running, start polling
			if ((response.state as ScrapeState).type === "SCRAPE_PROGRESS") {
				startPolling(tab.id);
			}
		}
	} catch (_) {
		// Content script not ready yet
	}
}

init();

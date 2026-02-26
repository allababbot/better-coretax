// ============================================================
// EXPORTER.TS — Export scraped data to various formats
// ============================================================

export interface ExportData {
	data: Record<string, unknown>[];
	fields: string[];
}

function downloadFile(
	content: string | BlobPart,
	filename: string,
	mimeType: string,
): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function getDateStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

function escapeCSV(value: unknown): string {
	if (value == null) return "";
	const s = String(value);
	return s.includes(",") || s.includes('"') || s.includes("\n")
		? `"${s.replace(/"/g, '""')}"`
		: s;
}

export function exportCSV(exportData: ExportData): void {
	const { data, fields } = exportData;

	let csv = `${fields.map(escapeCSV).join(",")}\n`;
	for (const row of data) {
		csv += `${fields.map((f) => escapeCSV(row[f])).join(",")}\n`;
	}

	downloadFile(
		`\uFEFF${csv}`,
		`faktur_pajak_keluaran_${getDateStamp()}.csv`,
		"text/csv;charset=utf-8",
	);
}

export function exportJSON(data: Record<string, unknown>[]): void {
	downloadFile(
		JSON.stringify(data, null, 2),
		`faktur_pajak_keluaran_${getDateStamp()}.json`,
		"application/json",
	);
}

// Stub for Phase 2.5 — XLSX export via SheetJS
export function exportXLSX(_exportData: ExportData): void {
	console.warn("XLSX export not yet implemented. Coming in Phase 2.5.");
}

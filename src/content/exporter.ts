// ============================================================
// EXPORTER.TS — Export scraped data to various formats
// ============================================================
import * as XLSX from "xlsx";

export interface ExportData {
	data: Record<string, unknown>[];
	fields: string[];
	filenameHint?: string;
	source?: "OUTPUT_TAX" | "SPT_A2" | "SPT_B2";
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

function formatDate(dateStr: unknown): string {
	if (!dateStr || typeof dateStr !== "string") return String(dateStr || "");

	const parts = dateStr.split("T")[0].split("-");
	if (parts.length === 3 && parts[0].length === 4) {
		return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
	}

	const d = new Date(dateStr);
	if (!isNaN(d.getTime())) {
		const day = String(d.getDate()).padStart(2, "0");
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const year = d.getFullYear();
		return `${day}/${month}/${year}`;
	}

	return dateStr;
}

function processData(exportData: ExportData): ExportData {
	if (exportData.source === "SPT_A2") {
		// Hardcoded columns for SPT Masa PPN Lampiran A2 based on user request
		const a2Fields = [
			"DocumentDate",
			"Name",
			"TIN",
			"DocumentNumber",
			"TaxBase",
			"OtherTaxBase",
			"VAT",
			"STLG",
		];

		const processedData = exportData.data.map((row) => {
			const newRow: Record<string, unknown> = {};
			for (const f of a2Fields) {
				let val = row[f];
				// Format document dates strictly as well as any internal ISO time string
				if (f === "DocumentDate") {
					val = formatDate(val);
				} else if (typeof val === "string" && val.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
					val = formatDate(val);
				}
				newRow[f] = val;
			}
			return newRow;
		});
		return { data: processedData, fields: a2Fields, source: exportData.source };
	}

	if (exportData.source === "SPT_B2") {
		// Dump all fields for B2 dynamically
		const processedData = exportData.data.map((row) => {
			const newRow: Record<string, unknown> = {};
			for (const f of exportData.fields) {
				let val = row[f];
				// Catch ISO dates
				if (typeof val === "string" && val.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
					val = formatDate(val);
				}
				newRow[f] = val;
			}
			return newRow;
		});
		return { data: processedData, fields: exportData.fields, source: exportData.source };
	}

	// Default fallback to OutputTax logic
	const hardcodedFields = [
		"TaxInvoiceDate",
		"BuyerName",
		"BuyerTIN",
		"TaxInvoiceNumber",
		"TaxInvoiceStatus",
		"BuyerStatus",
		"SellingPrice",
		"OtherTaxBase",
		"VAT",
		"STLG",
		"Reference",
	];

	const processedData = exportData.data.map((row) => {
		const newRow: Record<string, unknown> = {};
		for (const f of hardcodedFields) {
			let val = row[f];
			if (f === "TaxInvoiceDate") {
				val = formatDate(val);
			}
			newRow[f] = val;
		}
		return newRow;
	});

	return { data: processedData, fields: hardcodedFields, source: exportData.source };
}

function generateDynamicFilename(exportData: ExportData): string {
	const { data: originalData, filenameHint, source } = exportData;
	const isA2 = source === "SPT_A2";
	const prefix = isA2 ? "Lampiran_A2_SPT" : "faktur_pajak_keluaran";

	if (filenameHint) {
		return `${prefix}_masa_${filenameHint}`;
	}

	if (!originalData || originalData.length === 0) {
		return `${prefix}_${getDateStamp()}`;
	}

	const periods = new Set<string>();

	for (const row of originalData) {
		// Fallbacks for different date field names depending on API
		const dateField = isA2 ? (row["DocumentDate"] || row["Date"] || "") : row["TaxInvoiceDate"];
		const dStr = String(dateField || "");
		if (dStr) {
			const parts = dStr.split("T")[0].split("-");
			if (parts.length === 3 && parts[0].length === 4) {
				periods.add(`${parts[0]}_${parts[1]}`);
			} else {
				const d = new Date(dStr);
				if (!isNaN(d.getTime())) {
					const y = d.getFullYear();
					const m = String(d.getMonth() + 1).padStart(2, "0");
					periods.add(`${y}_${m}`);
				}
			}
		}
	}

	const periodsArr = Array.from(periods).sort();
	if (periodsArr.length === 1) {
		return `${prefix}_masa_${periodsArr[0]}`;
	} else if (periodsArr.length > 1) {
		return `${prefix}_masa_${periodsArr[0]}_sd_${periodsArr[periodsArr.length - 1]}`;
	}

	return `${prefix}_${getDateStamp()}`;
}

export function exportCSV(exportData: ExportData): void {
	const filename = generateDynamicFilename(exportData);
	const { data, fields } = processData(exportData);

	let csv = `${fields.map(escapeCSV).join(",")}\n`;
	for (const row of data) {
		csv += `${fields.map((f) => escapeCSV(row[f])).join(",")}\n`;
	}

	downloadFile(
		`\uFEFF${csv}`,
		`${filename}.csv`,
		"text/csv;charset=utf-8",
	);
}

export function exportXLSX(exportData: ExportData): void {
	const filename = generateDynamicFilename(exportData);
	const { data, fields } = processData(exportData);

	const worksheet = XLSX.utils.json_to_sheet(data, { header: fields });
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, "Faktur");

	const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

	downloadFile(
		excelBuffer,
		`${filename}.xlsx`,
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	);
}

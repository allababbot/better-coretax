/**
 * DOWNLOADER.TS — Logic for handling PDF downloads with custom naming
 */

export interface WithholdingSlip {
	WithholdingSlipsNumber: string;
	WithholdingSlipsDate: string; // "2026-01-31T00:00:00+07:00"
	EmployerName: string;
	[key: string]: any;
}

/**
 * Utility to download a blob as a file in the browser
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Converts Base64 string to Blob
 */
export function base64ToBlob(base64: string, mimeType: string = "application/pdf"): Blob {
	const byteCharacters = atob(base64);
	const byteNumbers = new Array(byteCharacters.length);
	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}
	const byteArray = new Uint8Array(byteNumbers);
	return new Blob([byteArray], { type: mimeType });
}

/**
 * Formats the filename as MM-YYYY-Nomor-Nama.pdf
 */
export function generateWithholdingFilename(item: WithholdingSlip): string {
	let month = "00";
	let year = new Date().getFullYear().toString();

	if (item.WithholdingSlipsDate) {
		const d = new Date(item.WithholdingSlipsDate);
		if (!isNaN(d.getTime())) {
			month = String(d.getMonth() + 1).padStart(2, "0");
			year = String(d.getFullYear());
		}
	}

	const nomor = (item.WithholdingSlipsNumber || "TANPA_NOMOR").replace(/[/\\?%*:|"<>]/g, "-");
	const nama = (item.EmployerName || "TANPA_NAMA").replace(/[/\\?%*:|"<>]/g, "_").substring(0, 50);

	return `${month}-${year}-${nomor}-${nama}.pdf`;
}

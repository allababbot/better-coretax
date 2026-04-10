export type ExportSource =
	| "OUTPUT_TAX"
	| "INPUT_TAX"
	| "OUTPUT_RETURN"
	| "INPUT_RETURN"
	| "SPT_A2"
	| "SPT_B2"
	| "WITHHOLDING_SLIPS";

type FilterLike = {
	PropertyName?: string;
	propertyName?: string;
	Value?: unknown;
	value?: unknown;
};

function normalizeUrl(url: string): string {
	return url.toLowerCase();
}

export function isOutputTaxPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return (
		normalizedUrl.includes("/e-invoice-portal") &&
		(normalizedUrl.includes("output-tax") ||
			normalizedUrl.includes("keluaran") ||
			normalizedUrl.includes("vat-out"))
	);
}

export function isInputTaxPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return normalizedUrl.includes("/e-invoice-portal") && normalizedUrl.includes("input-tax");
}

export function isOutputReturnPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return normalizedUrl.includes("/e-invoice-portal") && normalizedUrl.includes("output-return");
}

export function isInputReturnPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return normalizedUrl.includes("/e-invoice-portal") && normalizedUrl.includes("input-return");
}

export function isSptPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return (
		normalizedUrl.includes("/returnsheets-portal") &&
		normalizedUrl.includes("value-added-tax-return")
	);
}

export function isWithholdingPage(url = location.href): boolean {
	const normalizedUrl = normalizeUrl(url);
	return (
		normalizedUrl.includes("/withholding-slips-portal") &&
		normalizedUrl.includes("my-withholding-slips")
	);
}

export function isSupportedExportPage(url = location.href): boolean {
	return (
		isOutputTaxPage(url) ||
		isInputTaxPage(url) ||
		isOutputReturnPage(url) ||
		isInputReturnPage(url) ||
		isSptPage(url) ||
		isWithholdingPage(url)
	);
}

export function getPageExportSource(url = location.href): ExportSource | null {
	if (isOutputTaxPage(url)) return "OUTPUT_TAX";
	if (isInputTaxPage(url)) return "INPUT_TAX";
	if (isOutputReturnPage(url)) return "OUTPUT_RETURN";
	if (isInputReturnPage(url)) return "INPUT_RETURN";
	return null;
}

export function inferCapturedSource(requestUrl: string, pageUrl = location.href): ExportSource | null {
	const normalizedRequestUrl = normalizeUrl(requestUrl);

	if (normalizedRequestUrl.includes("la2-grid")) return "SPT_A2";
	if (normalizedRequestUrl.includes("lb2-grid")) return "SPT_B2";
	if (normalizedRequestUrl.includes("getmywithholdingslip")) return "WITHHOLDING_SLIPS";
	if (normalizedRequestUrl.includes("outputinvoice/list")) return "OUTPUT_TAX";

	return getPageExportSource(pageUrl);
}

function getFiltersFromBody(body: Record<string, unknown>): FilterLike[] {
	const filters = body.Filters || body.filters;
	return Array.isArray(filters) ? (filters as FilterLike[]) : [];
}

function getFilterName(filter: FilterLike): string {
	return String(filter.PropertyName || filter.propertyName || "").toLowerCase();
}

function getFilterValue(filter: FilterLike): string {
	const value = filter.Value ?? filter.value ?? "";
	return String(value).trim();
}

function findFirstFilterValue(filters: FilterLike[], patterns: string[]): string {
	for (const filter of filters) {
		const name = getFilterName(filter);
		if (patterns.some((pattern) => name.includes(pattern))) {
			const value = getFilterValue(filter);
			if (value) return value;
		}
	}
	return "";
}

function extractYear(value: string): string {
	const digits = value.replace(/\D/g, "");
	const match = digits.match(/(20\d{2}|19\d{2})/);
	return match ? match[1] : "";
}

function extractMonth(value: string): string {
	const digits = value.replace(/\D/g, "");
	const yyyymm = digits.match(/(20\d{2}|19\d{2})(0[1-9]|1[0-2])$/);
	if (yyyymm) return yyyymm[2];

	const mmyyyy = digits.match(/(0[1-9]|1[0-2])(20\d{2}|19\d{2})$/);
	if (mmyyyy) return mmyyyy[1];

	const monthOnly = digits.match(/^(0?[1-9]|1[0-2])$/);
	return monthOnly ? monthOnly[1].padStart(2, "0") : "";
}

export function extractFilenameHintFromBody(
	rawBody: string,
	source: ExportSource,
): string | undefined {
	try {
		const body = JSON.parse(rawBody) as Record<string, unknown>;
		const filters = getFiltersFromBody(body);

		if (source === "INPUT_TAX") {
			const periodValue = findFirstFilterValue(filters, ["period", "masa"]);
			const monthValue =
				findFirstFilterValue(filters, ["month", "bulan"]) ||
				periodValue;
			const yearValue =
				findFirstFilterValue(filters, ["year", "tahun"]) ||
				periodValue;

			const month = extractMonth(monthValue);
			const year = extractYear(yearValue);
			if (month && year) return `${year}_${month}`;
			return undefined;
		}

		if (source === "OUTPUT_RETURN" || source === "INPUT_RETURN") {
			const value =
				findFirstFilterValue(filters, ["year", "tahun", "period", "masa"]) ||
				String(body.TaxYear || body.Year || body.Tahun || "");
			const year = extractYear(value);
			return year || undefined;
		}

		if (source === "OUTPUT_TAX" || source === "SPT_A2" || source === "SPT_B2") {
			const value = findFirstFilterValue(filters, ["period", "masa"]);
			return value ? value.replace(/[^a-zA-Z0-9_-]/g, "") : undefined;
		}
	} catch (_) {
		return undefined;
	}

	return undefined;
}

// ============================================================
// BACKGROUND.TS — Background Script
// ============================================================

// Cross-browser shim
// @ts-ignore
const _browser = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
const browserAPI: any = _browser;

console.log("Better Coretax: Background script active");

browserAPI.runtime.onInstalled.addListener(() => {
	console.log("Better Coretax: Extension installed/updated");
});

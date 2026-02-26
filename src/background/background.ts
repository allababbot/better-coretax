// ============================================================
// BACKGROUND.TS — Background Script
// ============================================================

console.log("Better Coretax: Background script active");

browser.runtime.onInstalled.addListener(() => {
	console.log("Better Coretax: Extension installed/updated");
});

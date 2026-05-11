import { isSupportedExportPage } from "./page-context";

export function registerShortcuts(isRunning: () => boolean): void {
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || !e.shiftKey) return;

    if (e.key === "E" || e.key === "e") {
      if (!isSupportedExportPage()) return;
      if (isRunning()) return;
      e.preventDefault();
      document.dispatchEvent(new CustomEvent("ch:scrape-toggle"));
    }

    if (e.key === "S" || e.key === "s") {
      if (!isSupportedExportPage()) return;
      if (!isRunning()) return;
      e.preventDefault();
      window.postMessage(
        { type: "STOP_SCRAPE", direction: "FROM_CONTENT" },
        window.location.origin,
      );
    }
  });
}

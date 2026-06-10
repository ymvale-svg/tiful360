import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Auto-reload when a stale dynamic chunk fails to load (after a new deploy).
// Throttle reloads to avoid infinite loops, but allow retries over time.
const RELOAD_KEY = "chunk-reload-at";
const RELOAD_COUNT_KEY = "chunk-reload-count";
const tryReload = () => {
  const now = Date.now();
  const lastAt = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || 0);
  // If last reload was >30s ago, reset the counter
  if (now - lastAt > 30_000) {
    sessionStorage.setItem(RELOAD_COUNT_KEY, "0");
  }
  if (count >= 3) return; // give up after 3 attempts in 30s window
  sessionStorage.setItem(RELOAD_KEY, String(now));
  sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
  window.location.reload();
};
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault?.();
  tryReload();
});
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
    tryReload();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e?.reason?.message || e?.reason || "");
  if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
    tryReload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

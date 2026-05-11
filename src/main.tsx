import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Auto-reload once when a stale dynamic chunk fails to load (after a new deploy)
window.addEventListener("vite:preloadError", () => {
  if (!sessionStorage.getItem("chunk-reload")) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  if (msg.includes("Failed to fetch dynamically imported module") && !sessionStorage.getItem("chunk-reload")) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem("chunk-reload"), 5000);
});

createRoot(document.getElementById("root")!).render(<App />);

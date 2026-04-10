import { createRoot } from "react-dom/client";
import "./index.css";

const SUPABASE_PROXY_PREFIX = "/__lovable_backend_proxy";

if (import.meta.env.DEV && import.meta.env.VITE_SUPABASE_URL) {
  const supabaseOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (requestUrl.startsWith(supabaseOrigin)) {
      const proxiedUrl = `${SUPABASE_PROXY_PREFIX}${requestUrl.slice(supabaseOrigin.length)}`;

      if (input instanceof Request) {
        return nativeFetch(new Request(proxiedUrl, input), init);
      }

      return nativeFetch(proxiedUrl, init);
    }

    return nativeFetch(input, init);
  };
}

import("./App.tsx").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});

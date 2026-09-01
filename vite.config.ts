import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: env.VITE_SUPABASE_URL
        ? {
            "/__lovable_backend_proxy": {
              target: env.VITE_SUPABASE_URL,
              changeOrigin: true,
              secure: true,
              rewrite: (requestPath) => requestPath.replace(/^\/__lovable_backend_proxy/, ""),
            },
          }
        : undefined,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        // The manifest is hand-maintained in public/manifest.webmanifest and
        // already linked from index.html — the plugin only adds the worker.
        injectRegister: "auto",
        registerType: "autoUpdate",
        manifest: false,
        workbox: {
          // Precache the built shell only.
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
          // The SPA falls back to index.html for unknown routes, but never for
          // the token-signing pages or anything under /.well-known — the TWA's
          // Digital Asset Links file must be served as itself.
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/\.well-known\//, /^\/storage\//],
          cleanupOutdatedCaches: true,
          // 3 MB: the Tax-101 chunk alone is ~680 kB.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              // Google Fonts stylesheets/files are the only third-party assets
              // worth holding; they carry no user data.
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          // Nothing from Supabase is cached. Payslips, tax-101 forms, signed
          // protocols and every API response stay off the device: the Cache API
          // is readable by anyone with the handset and survives sign-out, so
          // caching them here would undo the storage lockdown done server-side.
          navigationPreload: false,
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});

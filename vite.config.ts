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
        // We register the worker ourselves so an update can be offered to the
        // user instead of applied silently — see PwaUpdatePrompt.
        injectRegister: null,
        registerType: "prompt",
        manifest: false,
        workbox: {
          // Precache the hashed build output only. Those filenames change with
          // their content, so a precached asset can never go stale.
          globPatterns: ["**/*.{js,css,ico,png,svg,woff,woff2}"],
          // The plugin otherwise registers its own navigation route that serves a
          // precached index.html. That route is registered first, so it would win
          // over the NetworkFirst one below — and with HTML no longer precached it
          // would throw while the worker is evaluating, leaving no worker at all.
          navigateFallback: undefined,
          cleanupOutdatedCaches: true,
          // 3 MB: the Tax-101 chunk alone is ~680 kB.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              // index.html is fetched from the network on every navigation, so a
              // deploy is visible on the next page load rather than the one after.
              // Serving it from the precache (the previous navigateFallback) meant
              // the first load after every publish showed the old app — and, worse,
              // that stale HTML pointed at hashed chunks the deploy had already
              // deleted, so a lazy route could fail to load at all.
              // The cache is kept only as the offline answer.
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" &&
                !url.pathname.startsWith("/~") &&
                !url.pathname.startsWith("/.well-known/") &&
                !url.pathname.startsWith("/storage/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "html",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 20 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
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

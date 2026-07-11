/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Cible du proxy /api en dev/E2E. Configurable via VITE_PROXY_TARGET pour éviter
// les collisions quand plusieurs backends tournent sur le port 8010 en parallèle.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8010";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // écoute sur 0.0.0.0 → accessible via tunnel / réseau local
    port: 3001,
    strictPort: true,
    // Autorise les hôtes des tunnels (cloudflare, ngrok) en dev — sinon Vite renvoie
    // « Blocked request. This host is not allowed ». Dev uniquement, jamais en prod.
    // Le point initial autorise tous les sous-domaines.
    allowedHosts: [".trycloudflare.com", ".ngrok.io", ".ngrok-free.app", ".loca.lt", "localhost", "127.0.0.1"],
    // Proxy /api + /groups WS → backend local. Permet au frontend d'appeler des URL
    // RELATIVES (/api) qui fonctionnent aussi bien en local que derrière un tunnel iPhone.
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    // `vite preview` sert le build dist/ en production locale (via tunnel Cloudflare).
    // On autorise explicitement le domaine kompta0.com + sous-domaines pour la prod,
    // ainsi que les tunnels temporaires pour le dev/staging.
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: [
      "kompta0.com",
      ".kompta0.com",
      ".trycloudflare.com",
      ".ngrok.io",
      ".ngrok-free.app",
      ".loca.lt",
      "localhost",
      "127.0.0.1",
    ],
    // Proxy /api (HTTP + WebSocket) → backend FastAPI. Permet de tout servir
    // depuis UN SEUL domaine (www.kompta0.com) sans avoir besoin d'un sous-domaine
    // api.kompta0.com séparé : le frontend appelle des URL relatives /api.
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    // Single React instance across every dependency
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "@tanstack/query-core",
      "react-is",
      "recharts",
    ],
  },
  build: {
    // vendor-export (exceljs + jsPDF) est chargé dynamiquement (await import) uniquement
    // au clic sur un bouton d'export — jamais au chargement initial. La limite est
    // relevée pour ne pas polluer le build output avec un faux avertissement.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        // Code-splitting manuel pour les grosses librairies (Vite 8 / Rolldown: fonction)
        manualChunks: (id: string) => {
          // React + son runtime DOIVENT être dans le même chunk et se charger
          // en premier — `react` (createContext, hooks) et `react-dom`/`scheduler`
          // sont mutuellement dépendants. Les séparer (ou laisser `react` nu se
          // faire assigner ailleurs par défaut) crée un cycle de chargement où
          // un autre chunk appelle `React.createContext` avant que `react` soit
          // initialisé → "Cannot read properties of undefined (reading
          // 'createContext')", page blanche en production.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/scheduler") ||
            id.includes("node_modules/react-router")
          ) return "vendor-react";
          if (id.includes("node_modules/exceljs") || id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) return "vendor-export";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/react-is")) return "vendor-charts";
          if (id.includes("node_modules/lucide-react")) return "vendor-ui";
          if (id.includes("node_modules/@tanstack")) return "vendor-query";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // e2e/ contient les specs Playwright (lancés par `playwright test`, pas Vitest).
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});

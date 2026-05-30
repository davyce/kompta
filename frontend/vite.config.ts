/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
        target: "http://127.0.0.1:8010",
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
    // Augmenter la limite d'avertissement pour les gros chunks (xlsx, html2canvas)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Code-splitting manuel pour les grosses librairies (Vite 8 / Rolldown: fonction)
        manualChunks: (id: string) => {
          if (id.includes("node_modules/xlsx") || id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) return "vendor-export";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/react-is")) return "vendor-charts";
          if (id.includes("node_modules/lucide-react")) return "vendor-ui";
          if (id.includes("node_modules/@tanstack")) return "vendor-query";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) return "vendor-react";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Les specs Playwright (e2e/) sont lancées par `playwright test`, pas Vitest.
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});

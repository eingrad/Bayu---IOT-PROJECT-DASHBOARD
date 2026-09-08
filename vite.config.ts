import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  // The app calls relative paths (/api, /public-api, /ws) so the built bundle
  // has no hostname baked in. In production the frontend's nginx routes them;
  // in dev this proxy does the same job against locally running backends.
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/public-api": {
        target: "http://localhost:5050",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/public-api/, ""),
      },
      "/ws": {
        target: "ws://localhost:5000",
        ws: true,
        rewrite: (p) => p.replace(/^\/ws/, ""),
      },
    },
  },
});

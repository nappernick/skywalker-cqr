import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The de-identified JSON exported by scripts/export_dashboard.py is served as static data, never copied by hand.
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "../reports/dashboard",
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "version-replace",
      transformIndexHtml(html) {
        return html.replace("{{VERSION}}", pkg.version);
      },
    },
  ],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

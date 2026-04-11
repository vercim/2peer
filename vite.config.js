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
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "react-vendor";
            if (id.includes("supabase")) return "supabase-vendor";
            return "deps-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

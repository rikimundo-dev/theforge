import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Evita CJS re-exports con getters (Rollup no ve named exports estáticos en dist).
      "@theforge/business-rules": path.resolve(__dirname, "../../packages/business-rules/src/index.ts"),
      "@theforge/shared-types/markdown-repair": path.resolve(
        __dirname,
        "../../packages/shared-types/src/markdown-repair.ts",
      ),
      "@theforge/shared-types/mdd-pipeline-limits": path.resolve(
        __dirname,
        "../../packages/shared-types/src/mdd-pipeline-limits.ts",
      ),
      "@theforge/shared-types/markdown-table": path.resolve(
        __dirname,
        "../../packages/shared-types/src/markdown-table.ts",
      ),
      "@theforge/shared-types/mermaid": path.resolve(
        __dirname,
        "../../packages/shared-types/src/mermaid.ts",
      ),
      "@theforge/shared-types/format-document-markdown": path.resolve(
        __dirname,
        "../../packages/shared-types/src/format-document-markdown.ts",
      ),
      "@theforge/shared-types/dbga-document-structure": path.resolve(
        __dirname,
        "../../packages/shared-types/src/dbga-document-structure.ts",
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: {
    modulePreload: { polyfill: false },
    outDir: "../web/public/skivu/interactive",
    emptyOutDir: true,
    target: "es2022",
    minify: true,
    rollupOptions: {
      input: { station: "index.html", hero: "src/hero.ts", earth: "src/earth.ts" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

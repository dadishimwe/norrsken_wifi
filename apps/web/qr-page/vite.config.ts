import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brandAssetsPlugin } from "../brand-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  base: "/qr/",
  plugins: [brandAssetsPlugin(root)],
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(root, "index.html"),
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});

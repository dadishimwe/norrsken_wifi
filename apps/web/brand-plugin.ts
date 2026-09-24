import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Copy shared `apps/web/brand/*` into each app's `public/` (and dist). */
export function brandAssetsPlugin(appRoot: string): Plugin {
  const brandDir = path.resolve(appRoot, "../brand");
  const publicDir = path.join(appRoot, "public");

  function sync() {
    if (!fs.existsSync(brandDir)) return;
    fs.mkdirSync(publicDir, { recursive: true });
    for (const name of fs.readdirSync(brandDir)) {
      if (name.startsWith(".") || name.toLowerCase().endsWith(".md")) continue;
      const src = path.join(brandDir, name);
      if (!fs.statSync(src).isFile()) continue;
      fs.copyFileSync(src, path.join(publicDir, name));
    }
  }

  return {
    name: "norrsken-brand-assets",
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}

// Builds the extension into dist/: the options page as a normal Vite app, and each
// script (background, content, page-world) as a standalone IIFE, since MV3 content
// scripts can't be ES modules.
import { build } from "vite";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const watch = process.argv.includes("--watch") ? {} : null;

await build({
  root,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: { options: resolve(root, "src/options/index.html") } },
    watch,
  },
});

for (const name of ["background", "content", "page"]) {
  await build({
    root,
    publicDir: false,
    build: {
      outDir: "dist",
      emptyOutDir: false,
      lib: { entry: resolve(root, `src/${name}/index.ts`), formats: ["iife"], name: name, fileName: () => `${name}.js` },
      watch,
    },
  });
}

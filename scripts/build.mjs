// Builds the extension into dist/: the options page as a normal Vite app, and each
// script (background, content, page-world) as a standalone IIFE, since MV3 content
// scripts can't be ES modules.
import { build } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
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

// Stamp the package.json version into the built manifest so there's one source of truth.
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifestPath = resolve(root, "dist/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

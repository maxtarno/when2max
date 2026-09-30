// Builds dist/, zips it as when2max-<version>.zip, and (with --publish) creates a GitHub
// release for v<version> with the zip attached. Bump the version first: npm version minor
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const zip = `when2max-${version}.zip`;

run("npm", ["run", "build"]);
rmSync(resolve(root, zip), { force: true });
// Zip the contents of dist/ under a when2max/ folder, so unzipping gives a folder to "Load unpacked".
run("sh", ["-c", `rm -rf .pkg && mkdir -p .pkg && cp -R dist .pkg/when2max && (cd .pkg && zip -qr ../${zip} when2max) && rm -rf .pkg`]);
console.log(`Packaged ${zip}`);

if (process.argv.includes("--publish")) {
  run("gh", ["release", "create", `v${version}`, zip, "--title", `when2max ${version}`, "--generate-notes"]);
}

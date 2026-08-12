import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [configText, cargoText, appText, packageText] = await Promise.all([
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../src/AppShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);

assert.deepEqual(config.app.security.capabilities, []);
assert.equal(config.app.security.csp["connect-src"], "'none'");
assert.match(
  config.app.security.devCsp["connect-src"],
  /ws:\/\/localhost:1420/,
);
assert.doesNotMatch(cargoText, /tauri-plugin|serde/);
assert.doesNotMatch(
  appText,
  /Writing Score|Correctness|Clarity|Style|issue count/i,
);
assert.equal(packageJson.version, "0.0.2");
assert.equal(config.version, "0.0.2");
assert.match(cargoText, /version = "0\.0\.2"/);
assert.match(appText, /0\.0\.2/);
assert.deepEqual(
  Object.entries(packageJson.dependencies)
    .filter(([name]) => name.startsWith("@tiptap/"))
    .sort(),
  [
    ["@tiptap/extensions", "3.30.0"],
    ["@tiptap/pm", "3.30.0"],
    ["@tiptap/react", "3.30.0"],
    ["@tiptap/starter-kit", "3.30.0"],
  ],
);

console.log("REDLINE foundation boundaries verified.");

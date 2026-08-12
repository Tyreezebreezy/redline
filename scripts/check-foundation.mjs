import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [configText, cargoText, appText] = await Promise.all([
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../src/AppShell.tsx", import.meta.url), "utf8"),
]);
const config = JSON.parse(configText);

assert.deepEqual(config.app.security.capabilities, []);
assert.equal(config.app.security.csp["connect-src"], "'none'");
assert.match(
  config.app.security.devCsp["connect-src"],
  /ws:\/\/localhost:1420/,
);
assert.doesNotMatch(cargoText, /tauri-plugin|serde/);
assert.doesNotMatch(
  appText,
  /Writing Score|Correctness|Clarity|Style|issue count|word count/i,
);

console.log("REDLINE foundation boundaries verified.");

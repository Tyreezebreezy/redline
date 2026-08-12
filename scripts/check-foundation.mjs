import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  configText,
  cargoText,
  appText,
  packageText,
  capabilityText,
  permissionText,
] = await Promise.all([
  readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8"),
  readFile(new URL("../src/AppShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(
    new URL("../src-tauri/capabilities/documents.json", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src-tauri/permissions/documents.toml", import.meta.url),
    "utf8",
  ),
]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);

assert.deepEqual(config.app.security.capabilities, ["documents"]);
assert.equal(
  config.app.security.csp["connect-src"],
  "'self' ipc: http://ipc.localhost",
);
assert.equal(
  config.app.security.csp["script-src"],
  "'self' 'wasm-unsafe-eval'",
);
assert.equal(config.app.security.csp["worker-src"], "'self' blob:");
assert.equal(config.app.security.devCsp["worker-src"], "'self' blob:");
assert.match(
  config.app.security.devCsp["connect-src"],
  /ws:\/\/localhost:1420/,
);
assert.doesNotMatch(cargoText, /tauri-plugin/);
assert.match(
  cargoText,
  /rusqlite = \{ version = "=0\.40\.1", default-features = false, features = \["bundled"\] \}/,
);
assert.match(
  cargoText,
  /serde = \{ version = "=1\.0\.229", features = \["derive"\] \}/,
);
assert.match(cargoText, /serde_json = "=1\.0\.151"/);
assert.doesNotMatch(
  appText,
  /Writing Score|Correctness|Clarity|Style|issue count/i,
);
assert.equal(packageJson.version, "0.0.6");
assert.equal(config.version, "0.0.6");
assert.match(cargoText, /version = "0\.0\.6"/);
assert.match(appText, /0\.0\.6/);
assert.match(cargoText, /unicode-normalization = "=0\.1\.24"/);
assert.equal(packageJson.dependencies["@tauri-apps/api"], "2.11.1");
assert.equal(packageJson.dependencies["harper.js"], "2.7.0");
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

const capability = JSON.parse(capabilityText);
assert.deepEqual(capability.windows, ["main"]);
assert.deepEqual(capability.permissions, [
  "documents",
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "core:window:allow-destroy",
]);
assert.doesNotMatch(
  `${capabilityText}\n${permissionText}`,
  /fs:|shell:|process:|http:|sql:|dialog:|global-shortcut:|microphone|camera/i,
);
for (const command of [
  "load_workspace",
  "open_document",
  "save_document",
  "delete_document",
  "list_trash",
  "restore_deleted_document",
  "list_document_revisions",
  "restore_document_revision",
  "add_dictionary_term",
  "remove_dictionary_term",
]) {
  assert.match(permissionText, new RegExp(`"${command}"`));
}

console.log("REDLINE foundation boundaries verified.");

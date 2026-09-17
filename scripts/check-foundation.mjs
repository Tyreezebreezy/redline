import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  configText,
  cargoText,
  appText,
  packageText,
  capabilityText,
  permissionText,
  dictationPermissionText,
  transformPermissionText,
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
  readFile(
    new URL("../src-tauri/permissions/dictation.toml", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../src-tauri/permissions/transform.toml", import.meta.url),
    "utf8",
  ),
]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);

assert.deepEqual(config.app.security.capabilities, ["documents"]);
assert.equal(config.app.windows[0].minWidth, 720);
assert.equal(config.app.windows[0].minHeight, 480);
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
assert.deepEqual(config.app.security.headers, {
  "Permissions-Policy": "microphone=(self), camera=()",
});
assert.equal(
  config.app.windows[0].additionalBrowserArgs,
  "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,msOneAuthWAM",
);
assert.equal(config.bundle.publisher, "Tyree");
assert.equal(config.bundle.windows.allowDowngrades, false);
assert.deepEqual(config.bundle.windows.nsis, {
  installMode: "currentUser",
  installerHooks: "installer-hooks.nsh",
  installerIcon: "icons/icon.ico",
  uninstallerIcon: "icons/icon.ico",
});
assert.match(
  await readFile(
    new URL("../src-tauri/installer-hooks.nsh", import.meta.url),
    "utf8",
  ),
  /SemverCompare[\s\S]*\$R9 = -1[\s\S]*Quit/,
);
assert.match(
  await readFile(
    new URL("../src-tauri/installer-hooks.nsh", import.meta.url),
    "utf8",
  ),
  /NSIS_HOOK_POSTUNINSTALL[\s\S]*DeleteAppDataCheckboxState = 1[\s\S]*RmDir \/r \/REBOOTOK "\$LOCALAPPDATA\\\$\{BUNDLEID\}"/,
);
assert.match(
  config.app.security.devCsp["connect-src"],
  /ws:\/\/localhost:1420/,
);
assert.doesNotMatch(cargoText, /tauri-plugin/);
assert.doesNotMatch(cargoText, /\bcpal\b/);
assert.match(
  cargoText,
  /rusqlite = \{ version = "=0\.40\.1", default-features = false, features = \["bundled"\] \}/,
);
assert.match(
  cargoText,
  /serde = \{ version = "=1\.0\.229", features = \["derive"\] \}/,
);
assert.match(cargoText, /serde_json = "=1\.0\.151"/);
assert.doesNotMatch(appText, /Writing Score|Correctness|issue count/i);
assert.equal(packageJson.version, "0.2.0");
assert.equal(config.version, "0.2.0");
assert.match(cargoText, /version = "0\.2\.0"/);
assert.match(appText, /0\.2\.0/);
assert.match(appText, /Always allow word/);
assert.match(cargoText, /unicode-normalization = "=0\.1\.24"/);
assert.equal(packageJson.dependencies["@tauri-apps/api"], "2.11.1");
assert.equal(packageJson.dependencies["harper.js"], "2.7.0");
assert.deepEqual(
  Object.entries(packageJson.dependencies)
    .filter(([name]) => name.startsWith("@tiptap/"))
    .sort(),
  [
    ["@tiptap/extensions", "3.30.5"],
    ["@tiptap/pm", "3.30.5"],
    ["@tiptap/react", "3.30.5"],
    ["@tiptap/starter-kit", "3.30.5"],
  ],
);

const capability = JSON.parse(capabilityText);
assert.deepEqual(capability.windows, ["main"]);
assert.deepEqual(capability.permissions, [
  "documents",
  "dictation",
  "transform",
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "core:window:allow-destroy",
]);
assert.doesNotMatch(
  `${capabilityText}\n${permissionText}\n${dictationPermissionText}\n${transformPermissionText}`,
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
  "update_voice_settings",
]) {
  assert.match(permissionText, new RegExp(`"${command}"`));
}
const dictationCommands =
  dictationPermissionText.match(/commands\.allow = \[([\s\S]*?)\]/)?.[1] ?? "";
assert.deepEqual(
  [...dictationCommands.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]),
  ["start_dictation", "stop_dictation", "cancel_dictation"],
);
const transformCommands =
  transformPermissionText.match(/commands\.allow = \[([\s\S]*?)\]/)?.[1] ?? "";
assert.deepEqual(
  [...transformCommands.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]),
  ["transform_status", "generate_transform", "cancel_transform"],
);

console.log("REDLINE foundation boundaries verified.");

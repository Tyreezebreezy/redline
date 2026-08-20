import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function manifestFor(name, from) {
  let directory = from;
  const driveRoot = parse(directory).root;
  while (directory !== driveRoot) {
    const candidate = join(directory, "node_modules", name, "package.json");
    if (existsSync(candidate)) {
      const manifest = JSON.parse(readFileSync(candidate, "utf8"));
      if (manifest.name === name) {
        return {
          directory: dirname(realpathSync(candidate)),
          key: realpathSync(candidate),
          manifest,
        };
      }
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not resolve package metadata for ${name}.`);
}

const javascript = new Map();
const queue = Object.keys(app.dependencies).map((name) => ({
  name,
  from: root,
}));
while (queue.length) {
  const next = queue.shift();
  if (!next) continue;
  const { directory, key, manifest } = manifestFor(next.name, next.from);
  if (javascript.has(key)) continue;
  javascript.set(key, manifest);
  queue.push(
    ...[
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ].map((name) => ({ name, from: directory })),
  );
}

const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--offline",
      "--manifest-path",
      join(root, "src-tauri", "Cargo.toml"),
      "--format-version",
      "1",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);
const packages = new Map(metadata.packages.map((item) => [item.id, item]));
const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const rust = new Map();
const rustQueue = [metadata.resolve.root];
while (rustQueue.length) {
  const id = rustQueue.shift();
  const item = packages.get(id);
  if (!item || rust.has(id)) continue;
  rust.set(id, item);
  for (const dependency of nodes.get(id)?.deps ?? []) {
    if (dependency.dep_kinds.some(({ kind }) => kind === null)) {
      rustQueue.push(dependency.pkg);
    }
  }
}
rust.delete(metadata.resolve.root);

const license = (value) => {
  if (typeof value === "string") return value;
  if (value?.type) return value.type;
  throw new Error("A production dependency is missing license metadata.");
};
const lines = [
  "REDLINE third-party dependency and model notices",
  "",
  "Generated from the installed production JavaScript graph and Cargo's resolved normal-dependency graph.",
  "This file records package identity and declared license. Full license texts remain available from each package source.",
  "",
  "JavaScript production dependencies",
  "",
  ...[...javascript.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => `${item.name} ${item.version} — ${license(item.license)}`),
  "",
  "Rust production dependencies",
  "",
  ...[...rust.values()]
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
      ),
    )
    .map((item) => `${item.name} ${item.version} — ${license(item.license)}`),
  "",
  "Bundled models and native model runtimes",
  "",
  "OpenAI Whisper model and code — MIT — https://github.com/openai/whisper",
  "whisper.cpp and ggml-base.en.bin conversion — MIT — https://github.com/ggml-org/whisper.cpp",
  "Qwen2.5-1.5B-Instruct and official Q4_K_M GGUF — Apache-2.0 — https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF",
  "llama.cpp — MIT — https://github.com/ggml-org/llama.cpp",
  "",
];

writeFileSync(
  join(root, "src-tauri", "resources", "THIRD_PARTY_NOTICES.txt"),
  lines.join("\n"),
);
console.log(
  `Recorded ${javascript.size} JavaScript and ${rust.size} Rust production dependencies.`,
);

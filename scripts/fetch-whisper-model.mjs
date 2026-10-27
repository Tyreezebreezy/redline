// Downloads the bundled Whisper model (not stored in Git) and verifies its SHA-256.
// Usage: pnpm fetch:model
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const SHA256 = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";
const BYTES = 147964211;
const SOURCES = [
  "https://github.com/Tyreezebreezy/redline/releases/download/model-assets-v1/ggml-base.en.bin",
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "src-tauri", "resources", "models", "ggml-base.en.bin");
const tmp = `${dest}.part`;

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function exists(path) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

if ((await exists(dest)) && (await sha256(dest)) === SHA256) {
  console.log("Whisper model already present and verified.");
  process.exit(0);
}

await mkdir(dirname(dest), { recursive: true });
for (const url of SOURCES) {
  try {
    console.log(`Downloading ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
    const got = await sha256(tmp);
    if (got !== SHA256) throw new Error(`SHA-256 mismatch (got ${got})`);
    await rm(dest, { force: true });
    await rename(tmp, dest);
    console.log(`Whisper model verified and saved (${BYTES} bytes): ${dest}`);
    process.exit(0);
  } catch (err) {
    console.error(`  failed: ${err.message}`);
    await rm(tmp, { force: true });
  }
}
console.error(
  `Could not fetch a verified model. Download ggml-base.en.bin manually (SHA-256 ${SHA256}) into ${dirname(dest)}.`,
);
process.exit(1);

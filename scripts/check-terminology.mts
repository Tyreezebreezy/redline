import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { analyzeText } from "../src/axiom/axiom.ts";
import {
  createTerminologyMatcher,
  findTerminologyMatches,
  type TerminologyRecord,
  terminologySnapshot,
} from "../src/axiom/terminology.ts";

const records = terminologySnapshot.records as TerminologyRecord[];
const byName = new Map(
  records.map((record) => [record.canonical_name, record]),
);
const required = [
  "YouTube",
  "GitHub",
  "LinkedIn",
  "LinkedIn Learning",
  "Facebook",
  "Facebook Marketplace",
  "Instagram",
  "TikTok",
  "Reddit",
  "Discord",
  "ChatGPT",
  "OpenAI",
  "Microsoft",
  "Microsoft 365",
  "PowerShell",
  "Visual Studio",
  "Visual Studio Code",
  "Windows",
  "Xbox",
  "PlayStation",
  "Android",
  "iPhone",
  "iPad",
  "macOS",
  "Google",
  "Google Drive",
  "Google Docs",
  "Google Sheets",
  "Google Chrome",
  "Gmail",
  "OneDrive",
  "Dropbox",
  "Spotify",
  "Netflix",
  "Steam",
];

assert.ok(
  records.length >= 300,
  "production snapshot must contain hundreds of terms",
);
assert.equal(
  new Set(records.map(({ canonical_name }) => canonical_name)).size,
  records.length,
);
for (const name of required) assert.ok(byName.has(name), `missing ${name}`);

for (const record of records) {
  assert.deepEqual(
    findTerminologyMatches(record.canonical_name),
    [],
    record.canonical_name,
  );
  if (record.confidence !== "context-required") {
    const observed = record.canonical_name.toLocaleLowerCase("en-US");
    if (observed !== record.canonical_name) {
      assert.deepEqual(
        findTerminologyMatches(observed).map(({ canonical }) => canonical),
        [record.canonical_name],
        record.canonical_name,
      );
    }
  }
}

assert.deepEqual(findTerminologyMatches("visual studio code"), [
  {
    canonical: "Visual Studio Code",
    observed: "visual studio code",
    from: 0,
    to: 18,
  },
]);
assert.deepEqual(
  findTerminologyMatches("Use youtube's interface; open (github)."),
  [
    { canonical: "YouTube", observed: "youtube", from: 4, to: 11 },
    { canonical: "GitHub", observed: "github", from: 31, to: 37 },
  ],
);
assert.deepEqual(
  findTerminologyMatches('"linkedin learning" and facebook marketplace.'),
  [
    {
      canonical: "LinkedIn Learning",
      observed: "linkedin learning",
      from: 1,
      to: 18,
    },
    {
      canonical: "Facebook Marketplace",
      observed: "facebook marketplace",
      from: 24,
      to: 44,
    },
  ],
);

const contextCases = [
  ["Windows", "I installed windows.", "I cleaned the windows."],
  ["Apple", "I bought an apple product.", "I ate an apple."],
  [
    "Discord",
    "Send it through discord.",
    "There was discord between the groups.",
  ],
  ["Edge", "Use edge browser.", "Move toward the edge."],
  ["Teams", "Join the teams meeting.", "Both teams played well."],
  ["Android", "Install an android phone.", "The story featured an android."],
  ["Steam", "Open the game on steam.", "Steam rose from the cup."],
  ["Telegram", "Send it via telegram.", "The telegram arrived at noon."],
  ["Twitch", "Watch it on twitch.", "My eyelid began to twitch."],
  ["Peacock", "Watch it on peacock.", "A peacock crossed the road."],
  ["Audible", "Listen on audible.", "The alarm was audible."],
  [
    "Basecamp",
    "Open the project in basecamp.",
    "The climbers returned to basecamp.",
  ],
  ["Workday", "Open it in workday.", "It was a long workday."],
  ["Homebrew", "Install it with homebrew.", "They served homebrew cider."],
  ["Fedora", "Install fedora linux.", "He wore a fedora."],
  ["Kindle", "Read it on kindle.", "Use dry wood to kindle the flame."],
] as const;
assert.deepEqual(
  records
    .filter(({ confidence }) => confidence === "context-required")
    .map(({ canonical_name }) => canonical_name)
    .sort(),
  contextCases.map(([canonical]) => canonical).sort(),
  "every context-required term needs paired controls",
);
for (const [canonical, positive, negative] of contextCases) {
  assert.deepEqual(
    findTerminologyMatches(positive).map((match) => match.canonical),
    [canonical],
    positive,
  );
  assert.deepEqual(findTerminologyMatches(negative), [], negative);
}

for (const text of [
  "https://youtube.com/watch?v=1",
  "C:\\tools\\youtube\\video.txt",
  "youtube.exe",
  "const youtube_path = '/video';",
  "youtube-v1.2.3",
]) {
  assert.deepEqual(
    await analyzeText(text, { analyze: async () => [] }),
    [],
    text,
  );
}

assert.throws(
  () =>
    createTerminologyMatcher([
      { ...records[0], canonical_name: "First", aliases: ["collision"] },
      { ...records[0], canonical_name: "Second", aliases: ["collision"] },
    ]),
  /maps to both/,
);

const started = performance.now();
const matcher = createTerminologyMatcher(records);
const startupMs = performance.now() - started;
const lookupStarted = performance.now();
for (let index = 0; index < 1_000; index += 1) {
  matcher("Use youtube, github, microsoft 365, and visual studio code.");
}
const lookupMs = performance.now() - lookupStarted;
assert.ok(startupMs < 100, `snapshot index took ${startupMs.toFixed(2)} ms`);
assert.ok(lookupMs < 250, `1,000 lookups took ${lookupMs.toFixed(2)} ms`);

const counts = records.reduce(
  (result, record) => {
    result[record.confidence] += 1;
    return result;
  },
  { high: 0, "multiword-high": 0, "context-required": 0 },
);
console.log(
  `REDLINE terminology verified: ${records.length} records; ${counts.high} high, ${counts["multiword-high"]} multiword high, ${counts["context-required"]} context-required; ${startupMs.toFixed(2)} ms startup; ${(lookupMs / 1_000).toFixed(4)} ms/lookup.`,
);

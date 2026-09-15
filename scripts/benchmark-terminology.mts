import { performance } from "node:perf_hooks";
import {
  createTerminologyMatcher,
  type TerminologyRecord,
  terminologySnapshot,
} from "../src/axiom/terminology.ts";

function syntheticRecord(index: number): TerminologyRecord {
  return {
    canonical_name: `Product${index}`,
    aliases: [`product${index}`],
    entity_type: "benchmark",
    source: "generated benchmark",
    source_id: null,
    confidence: "high",
    ambiguity: null,
    case_sensitive: false,
    multiword: false,
    version: 1,
    notes: null,
  };
}

function median(values: number[]) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const results = [100, 1_000, 10_000, 50_000].map((count) => {
  const records = Array.from({ length: count }, (_, index) =>
    syntheticRecord(index),
  );
  const startupTimings: number[] = [];
  let matcher = createTerminologyMatcher(records);
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    matcher = createTerminologyMatcher(records);
    startupTimings.push(performance.now() - started);
  }
  const text =
    "Use product1 with product9, product42, product99, and product" +
    String(count - 1) +
    ". The windows face the edge while teams work.";
  const timings = Array.from({ length: 250 }, () => {
    const lookupStarted = performance.now();
    matcher(text);
    return performance.now() - lookupStarted;
  });
  return {
    terms: count,
    serializedBytes: Buffer.byteLength(JSON.stringify(records)),
    medianStartupMs: median(startupTimings),
    medianLookupMs: median(timings),
    maxLookupMs: Math.max(...timings),
  };
});

console.log(
  JSON.stringify(
    {
      snapshotTerms: terminologySnapshot.records.length,
      snapshotBytes: Buffer.byteLength(JSON.stringify(terminologySnapshot)),
      results,
    },
    null,
    2,
  ),
);

import { describe, expect, it } from "vitest";
import { formatSummary, hasChanges, summarizeSpecDiff } from "../src/specDiff.js";

const base = {
  components: { schemas: { A: {}, B: {} } },
  paths: { "/x": { get: {} } },
};
const next = {
  components: { schemas: { A: { x: 1 }, C: {} } },
  paths: { "/x": { get: {} }, "/y": { post: {} } },
};

describe("summarizeSpecDiff", () => {
  it("counts schema and operation deltas", () => {
    const s = summarizeSpecDiff(base, next);
    expect(s.schemasAdded).toEqual(["C"]);
    expect(s.schemasRemoved).toEqual(["B"]);
    expect(s.schemasModified).toEqual(["A"]);
    expect(s.operationsAdded).toEqual(["POST /y"]);
    expect(s.operationsRemoved).toEqual([]);
  });

  it("reports no changes for identical specs", () => {
    const s = summarizeSpecDiff(base, base);
    expect(hasChanges(s)).toBe(false);
  });

  it("formats a coherent summary line", () => {
    const s = summarizeSpecDiff(base, next);
    expect(formatSummary(s)).toContain("schemas: +1 -1 ~1; operations: +1 -0");
  });
});

import { describe, it, expect } from "vitest";
import {
  WORKGROUP_SIZE,
  workgroupCount,
  fitsInOneDispatch,
} from "../src/dispatch";

describe("workgroupCount", () => {
  it("workgroup size is 64 and stays within the 256 limit", () => {
    expect(WORKGROUP_SIZE).toBe(64);
    expect(WORKGROUP_SIZE).toBeLessThanOrEqual(256);
  });

  it("edge cases: 0, 1, 63, 64, 65", () => {
    expect(workgroupCount(0)).toBe(0);
    expect(workgroupCount(1)).toBe(1); // even a single particle gets a group
    expect(workgroupCount(63)).toBe(1);
    expect(workgroupCount(64)).toBe(1); // one exactly full group
    expect(workgroupCount(65)).toBe(2); // a second group for the 1 overflowing particle
  });

  it("100,000 particles make 1563 groups (NOT 1562)", () => {
    expect(workgroupCount(100_000)).toBe(1563);
    expect(workgroupCount(100_000) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(
      100_000,
    );
  });

  it("always launches enough invocations", () => {
    for (const n of [1, 7, 63, 64, 65, 999, 100_000, 500_000]) {
      expect(workgroupCount(n) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(n);
    }
  });

  it("launches no groups for a negative or zero count", () => {
    expect(workgroupCount(-5)).toBe(0);
  });
});

describe("fitsInOneDispatch", () => {
  it("draws the 65535 × 64 = 4,194,240 limit in the right place", () => {
    expect(fitsInOneDispatch(4_194_240)).toBe(true);
    expect(fitsInOneDispatch(4_194_241)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readbackByteLength } from "../src/readback";

describe("readbackByteLength", () => {
  it("multiplies the sample count by the 16-byte stride", () => {
    expect(readbackByteLength(8, 100_000)).toBe(128);
  });

  it("clamps to the total when the requested count exceeds it", () => {
    expect(readbackByteLength(200, 100)).toBe(1600);
  });

  it("returns 0 for a negative or zero request", () => {
    expect(readbackByteLength(-5, 10)).toBe(0);
    expect(readbackByteLength(0, 10)).toBe(0);
  });

  it("the result is always a multiple of 4 (copyBufferToBuffer requirement)", () => {
    for (const n of [1, 3, 7, 8, 99]) {
      expect(readbackByteLength(n, 1000) % 4).toBe(0);
    }
  });
});

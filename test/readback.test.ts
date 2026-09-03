import { describe, it, expect } from "vitest";
import { readbackByteLength } from "../src/readback";

describe("readbackByteLength", () => {
  it("örnek sayısını 16 bayt stride ile çarpar", () => {
    expect(readbackByteLength(8, 100_000)).toBe(128);
  });

  it("istenen sayı toplamı aşarsa toplamla sınırlar", () => {
    expect(readbackByteLength(200, 100)).toBe(1600);
  });

  it("negatif veya sıfır istekte 0 döner", () => {
    expect(readbackByteLength(-5, 10)).toBe(0);
    expect(readbackByteLength(0, 10)).toBe(0);
  });

  it("sonuç her zaman 4'ün katıdır (copyBufferToBuffer şartı)", () => {
    for (const n of [1, 3, 7, 8, 99]) {
      expect(readbackByteLength(n, 1000) % 4).toBe(0);
    }
  });
});

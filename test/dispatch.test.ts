import { describe, it, expect } from "vitest";
import {
  WORKGROUP_SIZE,
  workgroupCount,
  fitsInOneDispatch,
} from "../src/dispatch";

describe("workgroupCount", () => {
  it("workgroup boyutu 64'tür ve 256 limitini aşmaz", () => {
    expect(WORKGROUP_SIZE).toBe(64);
    expect(WORKGROUP_SIZE).toBeLessThanOrEqual(256);
  });

  it("kenar vakaları: 0, 1, 63, 64, 65", () => {
    expect(workgroupCount(0)).toBe(0);
    expect(workgroupCount(1)).toBe(1); // tek parçacık için de bir grup
    expect(workgroupCount(63)).toBe(1);
    expect(workgroupCount(64)).toBe(1); // tam dolu tek grup
    expect(workgroupCount(65)).toBe(2); // taşan 1 parçacık için ikinci grup
  });

  it("100.000 parçacık 1563 grup eder (1562 DEĞİL)", () => {
    expect(workgroupCount(100_000)).toBe(1563);
    expect(workgroupCount(100_000) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(
      100_000,
    );
  });

  it("her zaman yeterli invocation başlatır", () => {
    for (const n of [1, 7, 63, 64, 65, 999, 100_000, 500_000]) {
      expect(workgroupCount(n) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(n);
    }
  });

  it("negatif veya sıfır sayıda grup başlatmaz", () => {
    expect(workgroupCount(-5)).toBe(0);
  });
});

describe("fitsInOneDispatch", () => {
  it("65535 × 64 = 4.194.240 sınırını doğru çiziyor", () => {
    expect(fitsInOneDispatch(4_194_240)).toBe(true);
    expect(fitsInOneDispatch(4_194_241)).toBe(false);
  });
});

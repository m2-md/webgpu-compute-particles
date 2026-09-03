import { describe, it, expect } from "vitest";
import {
  SIM_PARAMS_SIZE,
  createSimParams,
  packSimParams,
} from "../src/sim-params";

describe("packSimParams", () => {
  it("32 bayt tutar ve 16'nın katıdır", () => {
    const p = createSimParams();
    expect(p.buffer.byteLength).toBe(SIM_PARAMS_SIZE);
    expect(p.buffer.byteLength % 16).toBe(0);
  });

  it("WGSL struct sırasına birebir oturur", () => {
    const p = createSimParams();
    packSimParams(p, 1 / 60, 100_000, 1920, 1080, 0, 900, 0.999);

    expect(p.f32[0]).toBeCloseTo(1 / 60, 6);
    expect(p.u32[1]).toBe(100_000); // u32 görünümü
    expect(p.f32[2]).toBe(1920);
    expect(p.f32[3]).toBe(1080);
    expect(p.f32[4]).toBe(0);
    expect(p.f32[5]).toBe(900);
    expect(p.f32[6]).toBeCloseTo(0.999, 6);
    expect(p.f32[7]).toBe(0); // _pad
  });

  it("count'u float olarak yazmak yanlış bitler üretirdi", () => {
    const p = createSimParams();
    packSimParams(p, 0.016, 100_000, 800, 600, 0, 900, 1);

    // Aynı 4 bayt, float gözüyle okununca anlamsız bir sayı verir.
    expect(p.f32[1]).not.toBeCloseTo(100_000, 0);
    expect(p.u32[1]).toBe(100_000);
  });
});

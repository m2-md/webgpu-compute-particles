import { describe, it, expect } from "vitest";
import {
  SIM_PARAMS_SIZE,
  createSimParams,
  packSimParams,
} from "../src/sim-params";

describe("packSimParams", () => {
  it("holds 32 bytes and is a multiple of 16", () => {
    const p = createSimParams();
    expect(p.buffer.byteLength).toBe(SIM_PARAMS_SIZE);
    expect(p.buffer.byteLength % 16).toBe(0);
  });

  it("maps exactly onto the WGSL struct order", () => {
    const p = createSimParams();
    packSimParams(p, 1 / 60, 100_000, 1920, 1080, 0, 900, 0.999);

    expect(p.f32[0]).toBeCloseTo(1 / 60, 6);
    expect(p.u32[1]).toBe(100_000); // u32 view
    expect(p.f32[2]).toBe(1920);
    expect(p.f32[3]).toBe(1080);
    expect(p.f32[4]).toBe(0);
    expect(p.f32[5]).toBe(900);
    expect(p.f32[6]).toBeCloseTo(0.999, 6);
    expect(p.f32[7]).toBe(0); // _pad
  });

  it("writing count as a float would produce the wrong bits", () => {
    const p = createSimParams();
    packSimParams(p, 0.016, 100_000, 800, 600, 0, 900, 1);

    // The same 4 bytes, read through float eyes, give a meaningless number.
    expect(p.f32[1]).not.toBeCloseTo(100_000, 0);
    expect(p.u32[1]).toBe(100_000);
  });
});

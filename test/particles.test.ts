import { describe, it, expect } from "vitest";
import {
  PARTICLE_FLOATS,
  PARTICLE_STRIDE,
  initParticles,
  makeRng,
  particleBufferSize,
} from "../src/particles";

describe("initParticles", () => {
  it("parçacık başına 4 float üretir", () => {
    expect(initParticles(100, 800, 600, makeRng(1)).length).toBe(
      100 * PARTICLE_FLOATS,
    );
  });

  it("bütün konumlar sınırların içinde başlar", () => {
    const data = initParticles(500, 800, 600, makeRng(7));
    for (let i = 0; i < 500; i++) {
      const o = i * PARTICLE_FLOATS;
      expect(data[o]).toBeGreaterThanOrEqual(0);
      expect(data[o]).toBeLessThanOrEqual(800);
      expect(data[o + 1]).toBeGreaterThanOrEqual(0);
      expect(data[o + 1]).toBeLessThanOrEqual(600);
    }
  });

  it("aynı tohum aynı sahneyi verir, farklı tohum vermez", () => {
    const a = initParticles(64, 800, 600, makeRng(42));
    const b = initParticles(64, 800, 600, makeRng(42));
    const c = initParticles(64, 800, 600, makeRng(43));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe("particleBufferSize", () => {
  it("stride 16 bayttır ve boyut 4'ün katıdır", () => {
    expect(PARTICLE_STRIDE).toBe(16);
    expect(particleBufferSize(100_000)).toBe(1_600_000);
    expect(particleBufferSize(65)).toBe(1040);
    expect(particleBufferSize(65) % 4).toBe(0);
  });
});

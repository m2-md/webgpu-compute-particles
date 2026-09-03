import { describe, it, expect } from "vitest";
import {
  PARTICLE_FLOATS,
  PARTICLE_STRIDE,
  initParticles,
  makeRng,
  particleBufferSize,
} from "../src/particles";

describe("initParticles", () => {
  it("produces 4 floats per particle", () => {
    expect(initParticles(100, 800, 600, makeRng(1)).length).toBe(
      100 * PARTICLE_FLOATS,
    );
  });

  it("every position starts inside the bounds", () => {
    const data = initParticles(500, 800, 600, makeRng(7));
    for (let i = 0; i < 500; i++) {
      const o = i * PARTICLE_FLOATS;
      expect(data[o]).toBeGreaterThanOrEqual(0);
      expect(data[o]).toBeLessThanOrEqual(800);
      expect(data[o + 1]).toBeGreaterThanOrEqual(0);
      expect(data[o + 1]).toBeLessThanOrEqual(600);
    }
  });

  it("the same seed gives the same scene, a different seed does not", () => {
    const a = initParticles(64, 800, 600, makeRng(42));
    const b = initParticles(64, 800, 600, makeRng(42));
    const c = initParticles(64, 800, 600, makeRng(43));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe("particleBufferSize", () => {
  it("the stride is 16 bytes and the size is a multiple of 4", () => {
    expect(PARTICLE_STRIDE).toBe(16);
    expect(particleBufferSize(100_000)).toBe(1_600_000);
    expect(particleBufferSize(65)).toBe(1040);
    expect(particleBufferSize(65) % 4).toBe(0);
  });
});

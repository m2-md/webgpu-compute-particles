import { describe, it, expect } from "vitest";
import { stepParticlesCPU } from "../src/cpu-sim";

describe("stepParticlesCPU", () => {
  it("with no gravity and no damping, position = position + velocity × dt", () => {
    const data = new Float32Array([100, 100, 60, -30]);
    stepParticlesCPU(data, 1, 0.5, 800, 600, 0, 0, 1);
    expect(data[0]).toBeCloseTo(130, 5); // 100 + 60 × 0.5
    expect(data[1]).toBeCloseTo(85, 5); // 100 - 30 × 0.5
  });

  it("clamps to the boundary and flips the velocity on hitting the left wall", () => {
    const data = new Float32Array([5, 300, -100, 0]);
    stepParticlesCPU(data, 1, 0.5, 800, 600, 0, 0, 1);
    expect(data[0]).toBe(0); // sat down on the wall
    expect(data[2]).toBeCloseTo(80, 5); // -(-100) × 0.8
  });

  it("leaves the data past count untouched", () => {
    const data = new Float32Array([0, 0, 10, 10, 7, 7, 7, 7]);
    stepParticlesCPU(data, 1, 1, 800, 600, 0, 0, 1); // only the first particle
    expect(Array.from(data.slice(4))).toEqual([7, 7, 7, 7]);
  });
});

export const PARTICLE_FLOATS = 4; // posX, posY, velX, velY
export const PARTICLE_STRIDE = 16; // bytes: 4 × Float32

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Particles spread across the screen, flung in random directions.
export function initParticles(
  count: number,
  width: number,
  height: number,
  rng: () => number,
): Float32Array<ArrayBuffer> {
  const data = new Float32Array(count * PARTICLE_FLOATS);
  for (let i = 0; i < count; i++) {
    const o = i * PARTICLE_FLOATS;
    const angle = rng() * Math.PI * 2;
    const speed = 20 + rng() * 180;
    data[o] = rng() * width;
    data[o + 1] = rng() * height;
    data[o + 2] = Math.cos(angle) * speed;
    data[o + 3] = Math.sin(angle) * speed;
  }
  return data;
}

export function particleBufferSize(count: number): number {
  return count * PARTICLE_STRIDE;
}

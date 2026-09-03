// Pure CPU bench (Node, no GPU).
// 1) Verifies the contract items: dispatch arithmetic, byte alignment and friends.
// 2) Runs stepParticlesCPU for 600 frames at 10k / 100k / 500k particles and
//    prints ms per frame and ns per particle.

import { stepParticlesCPU } from "../src/cpu-sim";
import { initParticles, makeRng, particleBufferSize } from "../src/particles";
import {
  fitsInOneDispatch,
  workgroupCount,
  WORKGROUP_SIZE,
} from "../src/dispatch";
import {
  createSimParams,
  packSimParams,
  SIM_PARAMS_SIZE,
} from "../src/sim-params";
import { readbackByteLength } from "../src/readback";

let allOk = true;
function check(label: string, ok: boolean, detail: string): void {
  allOk &&= ok;
  console.log(
    `  ${label.padEnd(26)} ${detail.padEnd(32)} ${ok ? "OK" : "FAIL"}`,
  );
}

console.log("== contract correctness ==");

check(
  "workgroup size",
  WORKGROUP_SIZE === 64 && WORKGROUP_SIZE <= 256,
  `${WORKGROUP_SIZE} (limit 256)`,
);
check(
  "dispatch edge cases",
  workgroupCount(0) === 0 &&
    workgroupCount(1) === 1 &&
    workgroupCount(63) === 1 &&
    workgroupCount(64) === 1 &&
    workgroupCount(65) === 2,
  "0→0, 1→1, 63→1, 64→1, 65→2",
);

let invariantOk = true;
for (const n of [1, 7, 63, 64, 65, 999, 10_000, 100_000, 500_000]) {
  invariantOk &&= workgroupCount(n) * WORKGROUP_SIZE >= n;
}
check("groups × 64 >= count", invariantOk, "at 9 sample sizes");
check(
  "100,000 → 1563 groups",
  workgroupCount(100_000) === 1563,
  `${workgroupCount(100_000)} groups (NOT 1562)`,
);
check(
  "single dispatch limit",
  fitsInOneDispatch(4_194_240) && !fitsInOneDispatch(4_194_241),
  "65535 × 64 = 4,194,240",
);

const params = packSimParams(
  createSimParams(),
  1 / 60,
  100_000,
  1920,
  1080,
  0,
  900,
  0.999,
);
check(
  "uniform alignment",
  params.buffer.byteLength === SIM_PARAMS_SIZE &&
    params.buffer.byteLength % 16 === 0,
  `${params.buffer.byteLength} bytes, multiple of 16`,
);
check(
  "u32 field intact",
  params.u32[1] === 100_000 && params.f32[1] !== 100_000,
  `u32=${params.u32[1]}, f32=${params.f32[1].toExponential(2)}`,
);
check(
  "particle buffer size",
  particleBufferSize(100_000) === 1_600_000,
  `${particleBufferSize(100_000)} bytes (100k × 16)`,
);
check(
  "readback size",
  readbackByteLength(8, 100_000) === 128 &&
    readbackByteLength(200, 100) === 1600,
  "8 samples → 128 bytes",
);

console.log(`  result: ${allOk ? "ALL CORRECT" : "FAILED"}`);

const FRAMES = 600;
const SIZES = [10_000, 100_000, 500_000];
const W = 2560;
const H = 1440;

// Warm-up: so the JIT gets a chance to optimize.
{
  const warm = initParticles(10_000, W, H, makeRng(1));
  for (let f = 0; f < 60; f++) {
    stepParticlesCPU(warm, 10_000, 1 / 60, W, H, 0, 900, 0.999);
  }
}

console.log(`\n== stepParticlesCPU, ${FRAMES} frames ==`);

let checksum = 0;
for (const count of SIZES) {
  const data = initParticles(count, W, H, makeRng(1337));
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    stepParticlesCPU(data, count, 1 / 60, W, H, 0, 900, 0.999);
  }
  const totalMs = performance.now() - t0;
  checksum += data[0];

  const perFrame = totalMs / FRAMES;
  const perParticleNs = (perFrame * 1e6) / count;
  const uploadKB = (count * 16) / 1024;

  console.log(
    `  ${count.toLocaleString("en-US").padStart(9)} particles   ` +
      `per frame ${perFrame.toFixed(2).padStart(5)} ms   ` +
      `${perParticleNs.toFixed(1).padStart(4)} ns/particle   ` +
      `upload ${uploadKB.toFixed(0).padStart(5)} KB/frame`,
  );
}

console.log(`  checksum: ${checksum.toFixed(3)} (optimization barrier)`);
console.log(
  "\n  note: GPU compute pass time cannot be measured in Node — measure it in the browser.",
);

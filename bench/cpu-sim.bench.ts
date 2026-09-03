// Saf CPU bench'i (Node, GPU yok).
// 1) Dispatch aritmetiği ve bayt hizalaması gibi sözleşme maddelerini doğrular.
// 2) stepParticlesCPU'yu 10k / 100k / 500k parçacıkta 600 kare koşturup
//    kare başına ms ve parçacık başına ns basar.

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
    `  ${label.padEnd(26)} ${detail.padEnd(32)} ${ok ? "OK" : "HATA"}`,
  );
}

console.log("== sözleşme doğruluğu ==");

check(
  "workgroup boyutu",
  WORKGROUP_SIZE === 64 && WORKGROUP_SIZE <= 256,
  `${WORKGROUP_SIZE} (limit 256)`,
);
check(
  "dispatch kenar vakaları",
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
check("grup × 64 >= count", invariantOk, "9 örnek boyutta");
check(
  "100.000 → 1563 grup",
  workgroupCount(100_000) === 1563,
  `${workgroupCount(100_000)} grup (1562 DEĞİL)`,
);
check(
  "tek dispatch sınırı",
  fitsInOneDispatch(4_194_240) && !fitsInOneDispatch(4_194_241),
  "65535 × 64 = 4.194.240",
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
  "uniform hizalaması",
  params.buffer.byteLength === SIM_PARAMS_SIZE &&
    params.buffer.byteLength % 16 === 0,
  `${params.buffer.byteLength} bayt, 16'nın katı`,
);
check(
  "u32 alanı bozulmadı",
  params.u32[1] === 100_000 && params.f32[1] !== 100_000,
  `u32=${params.u32[1]}, f32=${params.f32[1].toExponential(2)}`,
);
check(
  "parçacık buffer boyutu",
  particleBufferSize(100_000) === 1_600_000,
  `${particleBufferSize(100_000)} bayt (100k × 16)`,
);
check(
  "readback boyutu",
  readbackByteLength(8, 100_000) === 128 &&
    readbackByteLength(200, 100) === 1600,
  "8 örnek → 128 bayt",
);

console.log(`  sonuç: ${allOk ? "HEPSİ DOĞRU" : "HATALI"}`);

const FRAMES = 600;
const SIZES = [10_000, 100_000, 500_000];
const W = 2560;
const H = 1440;

// Isınma: JIT'in optimize etmesi için.
{
  const warm = initParticles(10_000, W, H, makeRng(1));
  for (let f = 0; f < 60; f++) {
    stepParticlesCPU(warm, 10_000, 1 / 60, W, H, 0, 900, 0.999);
  }
}

console.log(`\n== stepParticlesCPU, ${FRAMES} kare ==`);

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
    `  ${count.toLocaleString("tr-TR").padStart(9)} parçacık   ` +
      `kare başına ${perFrame.toFixed(2).padStart(5)} ms   ` +
      `${perParticleNs.toFixed(1).padStart(4)} ns/parçacık   ` +
      `yükleme ${uploadKB.toFixed(0).padStart(5)} KB/kare`,
  );
}

console.log(`  checksum: ${checksum.toFixed(3)} (optimizasyon engeli)`);
console.log(
  "\n  not: GPU compute pass süresi Node'da ölçülemez — tarayıcıda ölç.",
);

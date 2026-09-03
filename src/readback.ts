import { PARTICLE_STRIDE } from "./particles";

// Kaç bayt okuyacağız? İstenen örnek sayısını gerçek sayıyla sınırla.
export function readbackByteLength(
  sampleCount: number,
  totalCount: number,
): number {
  const n = Math.max(0, Math.min(Math.floor(sampleCount), totalCount));
  return n * PARTICLE_STRIDE;
}

// TEK SEFERLİK doğrulama içindir. Sıcak döngüde ÇAĞIRMAYIN.
export async function readParticles(
  device: GPUDevice,
  particles: GPUBuffer,
  sampleCount: number,
  totalCount: number,
): Promise<Float32Array> {
  const size = readbackByteLength(sampleCount, totalCount);
  if (size === 0) return new Float32Array(0);

  const staging = device.createBuffer({
    label: "particle-readback",
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const encoder = device.createCommandEncoder({ label: "readback" });
  encoder.copyBufferToBuffer(particles, 0, staging, 0, size);
  device.queue.submit([encoder.finish()]);

  // Bu satır GPU'nun o noktaya gelmesini bekler: senkronizasyon noktası.
  await staging.mapAsync(GPUMapMode.READ);

  // getMappedRange() unmap sonrası geçersizleşir, o yüzden kopyala.
  const copy = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

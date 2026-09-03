import { PARTICLE_STRIDE } from "./particles";

// How many bytes will we read? Clamp the requested sample count to the real count.
export function readbackByteLength(
  sampleCount: number,
  totalCount: number,
): number {
  const n = Math.max(0, Math.min(Math.floor(sampleCount), totalCount));
  return n * PARTICLE_STRIDE;
}

// This is for ONE-OFF verification. DO NOT CALL it in the hot loop.
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

  // This line waits for the GPU to reach that point: a synchronization point.
  await staging.mapAsync(GPUMapMode.READ);

  // getMappedRange() goes invalid after unmap, so copy it out.
  const copy = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}

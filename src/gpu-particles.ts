import { initParticles, makeRng, particleBufferSize } from "./particles";

export function createParticleBuffer(
  device: GPUDevice,
  count: number,
  width: number,
  height: number,
  seed = 1337,
): GPUBuffer {
  const data = initParticles(count, width, height, makeRng(seed));

  const buffer = device.createBuffer({
    label: "particles",
    size: particleBufferSize(count),
    usage:
      GPUBufferUsage.STORAGE | // compute will write, vertex will read
      GPUBufferUsage.COPY_DST | // we will put the initial data in with writeBuffer
      GPUBufferUsage.COPY_SRC, // we will copy to staging for readback
  });

  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

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
      GPUBufferUsage.STORAGE | // compute yazacak, vertex okuyacak
      GPUBufferUsage.COPY_DST | // writeBuffer ile ilk veriyi koyacağız
      GPUBufferUsage.COPY_SRC, // readback için staging'e kopyalayacağız
  });

  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

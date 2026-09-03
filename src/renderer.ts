import { resizeCanvas } from "./canvas";
import { workgroupCount } from "./dispatch";
import { createParticleBuffer } from "./gpu-particles";
import type { GpuContext } from "./gpu";
import { createParticleRenderPipeline, createSimPipeline } from "./pipelines";
import { createSimParams, packSimParams } from "./sim-params";
import { createViewParams, packViewParams } from "./view-params";

export const PARTICLE_SIZE = 2.5; // piksel

export interface ParticleRenderer {
  resize(): void;
  render(now: number): void;
  setCount(n: number): void;
  readonly particleBuffer: GPUBuffer;
  readonly count: number;
  destroy(): void;
}

export function createGpuParticleRenderer(
  canvas: HTMLCanvasElement,
  gpu: GpuContext,
  initialCount: number,
): ParticleRenderer {
  const { device, context } = gpu;

  const simPipeline = createSimPipeline(device);
  const renderPipeline = createParticleRenderPipeline(device, gpu.format);

  // Kare başına ayırma yok: iki uniform paketi bir kez kuruluyor.
  const simParams = createSimParams();
  const viewParams = createViewParams();

  const simParamsBuffer = device.createBuffer({
    label: "sim-params",
    size: simParams.buffer.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const viewParamsBuffer = device.createBuffer({
    label: "view-params",
    size: viewParams.buffer.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  resizeCanvas(canvas, device);

  let count = initialCount;
  let particleBuffer = createParticleBuffer(
    device,
    count,
    canvas.width,
    canvas.height,
  );

  // İki pipeline da layout: "auto" kullanıyor, layout'lar paylaşılmaz:
  // aynı buffer için İKİ AYRI bind group gerekir.
  let simBindGroup = makeSimBindGroup();
  let renderBindGroup = makeRenderBindGroup();

  function makeSimBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: "sim-bind-group",
      layout: simPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: simParamsBuffer } },
      ],
    });
  }

  function makeRenderBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: "render-bind-group",
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuffer } },
        { binding: 1, resource: { buffer: viewParamsBuffer } },
      ],
    });
  }

  let last = performance.now();

  return {
    get particleBuffer(): GPUBuffer {
      return particleBuffer;
    },

    get count(): number {
      return count;
    },

    resize(): void {
      resizeCanvas(canvas, device);
    },

    setCount(n: number): void {
      particleBuffer.destroy();
      count = n;
      particleBuffer = createParticleBuffer(
        device,
        count,
        canvas.width,
        canvas.height,
      );
      simBindGroup = makeSimBindGroup();
      renderBindGroup = makeRenderBindGroup();
    },

    destroy(): void {
      particleBuffer.destroy();
      simParamsBuffer.destroy();
      viewParamsBuffer.destroy();
    },

    render(now: number): void {
      const dt = Math.min((now - last) / 1000, 1 / 30); // sekme dönüşünde patlamasın
      last = now;

      packSimParams(
        simParams,
        dt,
        count,
        canvas.width,
        canvas.height,
        0,
        900,
        0.999,
      );
      device.queue.writeBuffer(simParamsBuffer, 0, simParams.buffer);

      packViewParams(viewParams, canvas.width, canvas.height, PARTICLE_SIZE);
      device.queue.writeBuffer(viewParamsBuffer, 0, viewParams.buffer);

      const encoder = device.createCommandEncoder({ label: "frame" });

      // 1) Simülasyon: veriyi GPU'da güncelle
      const compute = encoder.beginComputePass({ label: "sim-pass" });
      compute.setPipeline(simPipeline);
      compute.setBindGroup(0, simBindGroup);
      compute.dispatchWorkgroups(workgroupCount(count));
      compute.end();

      // 2) Çizim: AYNI buffer'ı oku
      const pass = encoder.beginRenderPass({
        label: "draw-pass",
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.03, g: 0.04, b: 0.08, a: 1 },
          },
        ],
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBindGroup);
      pass.draw(6, count); // 6 köşe × count instance
      pass.end();

      device.queue.submit([encoder.finish()]);
    },
  };
}

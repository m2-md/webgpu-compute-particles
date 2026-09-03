import { SIM_WGSL } from "./sim.wgsl";
import { RENDER_WGSL } from "./render.wgsl";

export function createSimPipeline(device: GPUDevice): GPUComputePipeline {
  const module = device.createShaderModule({
    label: "particle-sim",
    code: SIM_WGSL,
  });

  return device.createComputePipeline({
    label: "particle-sim-pipeline",
    layout: "auto", // bind group layout'unu shader'dan çıkar
    compute: { module, entryPoint: "cs_main" },
  });
}

export function createParticleRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const module = device.createShaderModule({
    label: "particle-render",
    code: RENDER_WGSL,
  });

  return device.createRenderPipeline({
    label: "particle-render-pipeline",
    layout: "auto",
    vertex: { module, entryPoint: "vs_main" }, // buffers YOK
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one", // katkı harmanlama
              operation: "add",
            },
            alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
}

import { SIM_WGSL } from "./sim.wgsl";
import { RENDER_WGSL } from "./render.wgsl";

export function createSimPipeline(device: GPUDevice): GPUComputePipeline {
  const module = device.createShaderModule({
    label: "particle-sim",
    code: SIM_WGSL,
  });

  return device.createComputePipeline({
    label: "particle-sim-pipeline",
    layout: "auto", // derive the bind group layout from the shader
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
    vertex: { module, entryPoint: "vs_main" }, // NO buffers
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one", // additive blending
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

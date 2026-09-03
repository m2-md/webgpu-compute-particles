import { pickCanvasFormat } from "./format";

export interface GpuContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

export async function initWebGPU(
  canvas: HTMLCanvasElement,
): Promise<GpuContext | null> {
  // 1. Does the browser have WebGPU?
  if (!navigator.gpu) return null;

  // 2. Is there a usable GPU? (null if the driver/hardware will not allow it)
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) return null;

  // 3. Open a session on that GPU
  const device = await adapter.requestDevice();

  device.lost.then((info) => {
    console.error("GPU device lost:", info.reason, info.message);
  });

  device.addEventListener("uncapturederror", (event) => {
    console.error(
      "Uncaptured GPU error:",
      (event as GPUUncapturedErrorEvent).error,
    );
  });

  // 4. The canvas's WebGPU context (null if the canvas is already bound to another context)
  const context = canvas.getContext("webgpu");
  if (!context) return null;

  const format = pickCanvasFormat(navigator.gpu.getPreferredCanvasFormat());
  context.configure({ device, format, alphaMode: "opaque" });

  return { adapter, device, context, format };
}

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
  // 1. Tarayıcıda WebGPU var mı?
  if (!navigator.gpu) return null;

  // 2. Kullanılabilir bir GPU var mı? (sürücü/donanım elvermezse null)
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) return null;

  // 3. O GPU üzerinde bir oturum aç
  const device = await adapter.requestDevice();

  device.lost.then((info) => {
    console.error("GPU device kaybedildi:", info.reason, info.message);
  });

  device.addEventListener("uncapturederror", (event) => {
    console.error(
      "Yakalanmamış GPU hatası:",
      (event as GPUUncapturedErrorEvent).error,
    );
  });

  // 4. Canvas'ın WebGPU context'i (canvas başka bir context'e ayrılmışsa null)
  const context = canvas.getContext("webgpu");
  if (!context) return null;

  const format = pickCanvasFormat(navigator.gpu.getPreferredCanvasFormat());
  context.configure({ device, format, alphaMode: "opaque" });

  return { adapter, device, context, format };
}

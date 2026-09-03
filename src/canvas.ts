export function resizeCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDim = device.limits.maxTextureDimension2D; // genelde 8192
  const w = Math.min(Math.floor(canvas.clientWidth * dpr), maxDim);
  const h = Math.min(Math.floor(canvas.clientHeight * dpr), maxDim);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// CPU yedek yolunun sürümü: device yok, sınır elle verilir
export function resizeCanvasElement(
  canvas: HTMLCanvasElement,
  maxDim = 8192,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.min(Math.floor(canvas.clientWidth * dpr), maxDim);
  const h = Math.min(Math.floor(canvas.clientHeight * dpr), maxDim);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

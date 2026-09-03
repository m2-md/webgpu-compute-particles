export function resizeCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDim = device.limits.maxTextureDimension2D; // usually 8192
  const w = Math.min(Math.floor(canvas.clientWidth * dpr), maxDim);
  const h = Math.min(Math.floor(canvas.clientHeight * dpr), maxDim);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

// The CPU fallback path's version: no device, the limit is passed by hand
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

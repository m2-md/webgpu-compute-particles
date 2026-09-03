export const VIEW_PARAMS_SIZE = 16; // bytes: 4 × Float32

export interface ViewParams {
  readonly buffer: ArrayBuffer;
  readonly f32: Float32Array;
}

export function createViewParams(): ViewParams {
  const buffer = new ArrayBuffer(VIEW_PARAMS_SIZE);
  return { buffer, f32: new Float32Array(buffer) };
}

// The ViewParams struct in WGSL: resolution : vec2f, size : f32, _pad : f32
export function packViewParams(
  v: ViewParams,
  width: number,
  height: number,
  size: number,
): ViewParams {
  v.f32[0] = width;
  v.f32[1] = height;
  v.f32[2] = size;
  v.f32[3] = 0; // _pad
  return v;
}

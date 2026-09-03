export const SIM_PARAMS_SIZE = 32; // bayt, 16'nın katı

export interface SimParams {
  readonly buffer: ArrayBuffer;
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
}

export function createSimParams(): SimParams {
  const buffer = new ArrayBuffer(SIM_PARAMS_SIZE);
  return {
    buffer,
    f32: new Float32Array(buffer),
    u32: new Uint32Array(buffer),
  };
}

// WGSL'deki SimParams struct'ının bayt düzeni. Sıra kritik.
export function packSimParams(
  p: SimParams,
  dt: number,
  count: number,
  boundsX: number,
  boundsY: number,
  gravityX: number,
  gravityY: number,
  damping: number,
): SimParams {
  p.f32[0] = dt;
  p.u32[1] = count >>> 0; // u32 görünümü: tamsayı bitleri
  p.f32[2] = boundsX;
  p.f32[3] = boundsY;
  p.f32[4] = gravityX;
  p.f32[5] = gravityY;
  p.f32[6] = damping;
  p.f32[7] = 0; // _pad
  return p;
}

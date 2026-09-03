# webgpu-compute-particles

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/webgpu-compute-particles/)** · [Source](https://github.com/m2-md/webgpu-compute-particles)
<!-- LINKS:END -->

The particle data stays on the GPU. A WGSL compute shader updates position and
velocity in place, the render pass reads the **same** storage buffer, and only 48
bytes of uniform go up from the CPU per frame. `dispatchWorkgroups` asking for the
number of groups rather than threads, the bounds guard, mixed `u32`/`f32` uniform
packing and the price of a `mapAsync` readback — all of it in running code.

Article: `articles/webgpu-compute-particles/article.md`

## What's here

| File | Contents |
|---|---|
| `src/particles.ts` | `PARTICLE_FLOATS`, `PARTICLE_STRIDE`, `makeRng` (mulberry32), `initParticles`, `particleBufferSize` — pure, seeded |
| `src/cpu-sim.ts` | `stepParticlesCPU` — the single-core loop that shows the ceiling, zero allocation |
| `src/dispatch.ts` | `WORKGROUP_SIZE`, `workgroupCount` (`Math.ceil`), `fitsInOneDispatch` |
| `src/sim-params.ts` | `SIM_PARAMS_SIZE = 32`, `createSimParams`, `packSimParams` — `f32` + `u32` views over the same `ArrayBuffer` |
| `src/view-params.ts` | `VIEW_PARAMS_SIZE = 16`, `createViewParams`, `packViewParams` |
| `src/sim.wgsl.ts` | `SIM_WGSL` — `@compute @workgroup_size(64) cs_main`, `var<storage, read_write>`, bounds guard |
| `src/render.wgsl.ts` | `RENDER_WGSL` — quad without a vertex buffer, `var<storage, read>`, speed→color |
| `src/pipelines.ts` | `createSimPipeline` + `createParticleRenderPipeline` (additive blending) |
| `src/gpu-particles.ts` | `createParticleBuffer` — `STORAGE \| COPY_DST \| COPY_SRC`, **one-time** `writeBuffer` |
| `src/renderer.ts` | `createGpuParticleRenderer` — two pipelines, two separate bind groups, compute + render in a single encoder |
| `src/readback.ts` | `readbackByteLength` (pure) + `readParticles` — staging buffer, `copyBufferToBuffer`, `mapAsync` |
| `src/gpu-info.ts` | `describeAdapter` — the GPU name the adapter reports |
| `src/gpu.ts` | `initWebGPU` (from #12, with an `adapter` field added) |
| `src/format.ts`, `src/canvas.ts` | `pickCanvasFormat`, `resizeCanvas` — copied from #12 |
| `src/cpu-fallback.ts` | The Canvas2D + `stepParticlesCPU` path for when there is no WebGPU |
| `src/main.ts` | Demo entry point: badge, HUD, 10k/100k/500k buttons, "Sample" (readback) |
| `bench/cpu-sim.bench.ts` | Node bench: contract correctness + the per-frame cost of the CPU loop |
| `test/*.test.ts` | vitest: 22 pure tests — NO GPU/DOM/`navigator` calls |

## Setup

```bash
npm install
```

## Running

```bash
npm run dev      # Vite dev server — the GPU particle demo in the browser
npm run build    # tsc --noEmit + vite build (dist/)
npm test         # vitest — 22 pure tests
npm run bench    # contract correctness in Node + the ceiling of the CPU loop
```

> `npm run dev` is required: the demo opens through the Vite module server. If you
> open `index.html` with `file://` the modules will not load and the screen stays blank.

## Expected output

### `npm test`

```
 ✓ test/sim-params.test.ts (3 tests)
 ✓ test/dispatch.test.ts (6 tests)
 ✓ test/format.test.ts (2 tests)
 ✓ test/cpu-sim.test.ts (3 tests)
 ✓ test/readback.test.ts (4 tests)
 ✓ test/particles.test.ts (4 tests)

 Test Files  6 passed (6)
      Tests  22 passed (22)
```

### `npm run bench`

Apple M2 Pro / Node v22, with 2560×1440 bounds:

```
== contract correctness ==
  workgroup size             64 (limit 256)                   OK
  dispatch edge cases        0→0, 1→1, 63→1, 64→1, 65→2       OK
  groups × 64 >= count       at 9 sample sizes                OK
  100,000 → 1563 groups      1563 groups (NOT 1562)           OK
  single dispatch limit      65535 × 64 = 4,194,240           OK
  uniform alignment          32 bytes, multiple of 16         OK
  u32 field intact           u32=100000, f32=1.40e-40         OK
  particle buffer size       1600000 bytes (100k × 16)        OK
  readback size              8 samples → 128 bytes            OK
  result: ALL CORRECT

== stepParticlesCPU, 600 frames ==
     10,000 particles   per frame  0.15 ms   15.5 ns/particle   upload   156 KB/frame
    100,000 particles   per frame  1.55 ms   15.5 ns/particle   upload  1563 KB/frame
    500,000 particles   per frame  7.84 ms   15.7 ns/particle   upload  7813 KB/frame
```

There is no GPU in Node: compute pass time and frame time are measured **in the
browser**, and the HUD shows them live.

### `npm run dev`

- Badge in the top left: a line like `WebGPU · apple metal-3` (browsers may mask
  the fields; "unknown" is a valid result too).
- HUD below it: FPS, frame time, CPU time per frame, active particle count.
- The 10,000 / 100,000 / 500,000 buttons rebuild the scene. If you see a frozen
  clump of particles at 500,000, the `Math.ceil` inside `workgroupCount` is broken.
- The "Sample (console)" button prints the `pos`/`vel` values of the first 8 particles to the console.
- If there is no `navigator.gpu` the badge says "No WebGPU — CPU fallback (10,000 particles)"
  and the same scene is drawn with Canvas2D.

## License

MIT

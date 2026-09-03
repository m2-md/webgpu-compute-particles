import { resizeCanvasElement } from "./canvas";
import { stepParticlesCPU } from "./cpu-sim";
import { initParticles, makeRng, PARTICLE_FLOATS } from "./particles";

export interface CpuFallback {
  stop(): void;
}

// The path that kicks in when there is no WebGPU: the same stepParticlesCPU, drawn with Canvas2D.
export function startCpuFallback(
  canvas: HTMLCanvasElement,
  count: number,
  onFrame?: (frameMs: number, count: number) => void,
): CpuFallback {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get the Canvas2D context");

  resizeCanvasElement(canvas);
  const data = initParticles(count, canvas.width, canvas.height, makeRng(1337));

  let last = performance.now();
  let raf = 0;

  const frame = (now: number): void => {
    const t0 = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    resizeCanvasElement(canvas);
    stepParticlesCPU(
      data,
      count,
      dt,
      canvas.width,
      canvas.height,
      0,
      900,
      0.999,
    );

    ctx.fillStyle = "#080a14";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(120, 170, 255, 0.55)";
    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_FLOATS;
      ctx.fillRect(data[o], data[o + 1], 2, 2);
    }

    onFrame?.(performance.now() - t0, count);
    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  return {
    stop(): void {
      cancelAnimationFrame(raf);
    },
  };
}

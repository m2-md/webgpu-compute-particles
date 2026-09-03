import { startCpuFallback } from "./cpu-fallback";
import { describeAdapter } from "./gpu-info";
import { initWebGPU, type GpuContext } from "./gpu";
import { readParticles } from "./readback";
import { createGpuParticleRenderer } from "./renderer";

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const badge = document.querySelector<HTMLDivElement>("#badge")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const sampleButton = document.querySelector<HTMLButtonElement>("#sample")!;
const countButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("button[data-count]"),
);

const nf = new Intl.NumberFormat("tr-TR");

function markActive(count: number): void {
  for (const b of countButtons) {
    b.classList.toggle("active", Number(b.dataset.count) === count);
  }
}

// CPU yedeğinin HUD'ı: kare başına saf güncelleme + çizim maliyeti.
let cpuFrames = 0;
let cpuMs = 0;
let cpuLastReport = performance.now();

function reportCpuFrame(frameMs: number, count: number): void {
  cpuFrames++;
  cpuMs += frameMs;
  const now = performance.now();
  if (now - cpuLastReport >= 500) {
    const fps = (cpuFrames * 1000) / (now - cpuLastReport);
    hud.textContent =
      `${fps.toFixed(0)} FPS · CPU ${(cpuMs / cpuFrames).toFixed(2)} ms/kare · ` +
      `${nf.format(count)} parçacık (Canvas2D)`;
    cpuFrames = 0;
    cpuMs = 0;
    cpuLastReport = now;
  }
}

function startGpuDemo(canvas: HTMLCanvasElement, gpu: GpuContext): void {
  const renderer = createGpuParticleRenderer(canvas, gpu, 10_000);
  markActive(10_000);

  let frames = 0;
  let cpuAcc = 0;
  let lastReport = performance.now();

  const loop = (now: number): void => {
    const t0 = performance.now();
    renderer.render(now);
    cpuAcc += performance.now() - t0;

    frames++;
    if (now - lastReport >= 500) {
      const fps = (frames * 1000) / (now - lastReport);
      hud.textContent =
        `${fps.toFixed(0)} FPS · ${(1000 / fps).toFixed(2)} ms/kare · ` +
        `CPU ${(cpuAcc / frames).toFixed(2)} ms · ` +
        `${nf.format(renderer.count)} parçacık`;
      frames = 0;
      cpuAcc = 0;
      lastReport = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  window.addEventListener("resize", () => renderer.resize());

  for (const button of countButtons) {
    button.addEventListener("click", () => {
      const n = Number(button.dataset.count);
      renderer.setCount(n);
      markActive(n);
    });
  }

  sampleButton.addEventListener("click", () => {
    void (async () => {
      const count = renderer.count;
      const sample = await readParticles(
        gpu.device,
        renderer.particleBuffer,
        8,
        count,
      );
      for (let i = 0; i < sample.length; i += 4) {
        console.log(
          `#${i / 4}  pos=(${sample[i].toFixed(1)}, ${sample[i + 1].toFixed(1)})` +
            `  vel=(${sample[i + 2].toFixed(1)}, ${sample[i + 3].toFixed(1)})`,
        );
      }
    })();
  });
}

async function start(): Promise<void> {
  const gpu = navigator.gpu ? await initWebGPU(canvas) : null;

  if (!gpu) {
    badge.textContent = "WebGPU yok — CPU yedeği (10.000 parçacık)";
    badge.classList.add("warn");
    for (const b of [...countButtons, sampleButton]) b.disabled = true;
    startCpuFallback(canvas, 10_000, reportCpuFrame); // Canvas2D + stepParticlesCPU
    return;
  }

  badge.textContent = `WebGPU · ${describeAdapter(gpu.adapter)}`;
  startGpuDemo(canvas, gpu);
}

void start();

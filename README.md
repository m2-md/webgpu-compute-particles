# webgpu-compute-particles

Parçacık verisi GPU'da kalıyor. Bir WGSL compute shader konum ve hızı yerinde
güncelliyor, render pass **aynı** storage buffer'ı okuyor, CPU'dan yukarı kare
başına sadece 48 bayt uniform gidiyor. `dispatchWorkgroups`'un thread değil grup
sayısı istemesi, sınır koruması, `u32`/`f32` karışık uniform paketleme ve
`mapAsync` readback'in bedeli — hepsi çalışan kodda.

Makale: `articles/webgpu-compute-particles/article.md`

## Ne var burada

| Dosya | İçerik |
|---|---|
| `src/particles.ts` | `PARTICLE_FLOATS`, `PARTICLE_STRIDE`, `makeRng` (mulberry32), `initParticles`, `particleBufferSize` — saf, tohumlu |
| `src/cpu-sim.ts` | `stepParticlesCPU` — tavanı gösteren tek çekirdekli döngü, sıfır ayırma |
| `src/dispatch.ts` | `WORKGROUP_SIZE`, `workgroupCount` (`Math.ceil`), `fitsInOneDispatch` |
| `src/sim-params.ts` | `SIM_PARAMS_SIZE = 32`, `createSimParams`, `packSimParams` — aynı `ArrayBuffer` üzerinde `f32` + `u32` görünümü |
| `src/view-params.ts` | `VIEW_PARAMS_SIZE = 16`, `createViewParams`, `packViewParams` |
| `src/sim.wgsl.ts` | `SIM_WGSL` — `@compute @workgroup_size(64) cs_main`, `var<storage, read_write>`, sınır koruması |
| `src/render.wgsl.ts` | `RENDER_WGSL` — vertex buffer'sız quad, `var<storage, read>`, hız→renk |
| `src/pipelines.ts` | `createSimPipeline` + `createParticleRenderPipeline` (katkı harmanlama) |
| `src/gpu-particles.ts` | `createParticleBuffer` — `STORAGE \| COPY_DST \| COPY_SRC`, **tek seferlik** `writeBuffer` |
| `src/renderer.ts` | `createGpuParticleRenderer` — iki pipeline, iki ayrı bind group, tek encoder'da compute + render |
| `src/readback.ts` | `readbackByteLength` (saf) + `readParticles` — staging buffer, `copyBufferToBuffer`, `mapAsync` |
| `src/gpu-info.ts` | `describeAdapter` — adapter'ın bildirdiği GPU adı |
| `src/gpu.ts` | `initWebGPU` (#12'den, `adapter` alanı eklendi) |
| `src/format.ts`, `src/canvas.ts` | `pickCanvasFormat`, `resizeCanvas` — #12'den kopya |
| `src/cpu-fallback.ts` | WebGPU yoksa Canvas2D + `stepParticlesCPU` yolu |
| `src/main.ts` | Demo girişi: rozet, HUD, 10k/100k/500k düğmeleri, "Örnekle" (readback) |
| `bench/cpu-sim.bench.ts` | Node bench: sözleşme doğruluğu + CPU döngüsünün kare başına maliyeti |
| `test/*.test.ts` | vitest: 22 saf test — GPU/DOM/`navigator` çağrısı YOK |

## Kurulum

```bash
npm install
```

## Çalıştırma

```bash
npm run dev      # Vite dev server — tarayıcıda GPU parçacık demosu
npm run build    # tsc --noEmit + vite build (dist/)
npm test         # vitest — 22 saf test
npm run bench    # Node'da sözleşme doğruluğu + CPU döngüsünün tavanı
```

> `npm run dev` şart: demo Vite modül sunucusuyla açılır. `index.html`'i `file://`
> ile açarsanız modüller yüklenmez, ekran boş kalır.

## Beklenen çıktı

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

Apple M2 Pro / Node v22, 2560×1440 sınırlarda:

```
== sözleşme doğruluğu ==
  workgroup boyutu           64 (limit 256)                   OK
  dispatch kenar vakaları    0→0, 1→1, 63→1, 64→1, 65→2       OK
  grup × 64 >= count         9 örnek boyutta                  OK
  100.000 → 1563 grup        1563 grup (1562 DEĞİL)           OK
  tek dispatch sınırı        65535 × 64 = 4.194.240           OK
  uniform hizalaması         32 bayt, 16'nın katı             OK
  u32 alanı bozulmadı        u32=100000, f32=1.40e-40         OK
  parçacık buffer boyutu     1600000 bayt (100k × 16)         OK
  readback boyutu            8 örnek → 128 bayt               OK
  sonuç: HEPSİ DOĞRU

== stepParticlesCPU, 600 kare ==
     10.000 parçacık   kare başına  0.15 ms   15.5 ns/parçacık   yükleme   156 KB/kare
    100.000 parçacık   kare başına  1.55 ms   15.5 ns/parçacık   yükleme  1563 KB/kare
    500.000 parçacık   kare başına  7.84 ms   15.7 ns/parçacık   yükleme  7813 KB/kare
```

Node'da GPU yok: compute pass süresi ve kare süresi **tarayıcıda** ölçülür, HUD
canlı gösterir.

### `npm run dev`

- Sol üstte rozet: `WebGPU · apple metal-3` gibi bir satır (tarayıcı alanları
  maskeleyebilir; "bilinmiyor" da geçerli bir sonuçtur).
- Altında HUD: FPS, kare süresi, kare başına CPU süresi, aktif parçacık sayısı.
- 10.000 / 100.000 / 500.000 düğmeleri sahneyi yeniden kurar. 500.000'de donmuş
  parçacık kümesi görürseniz `workgroupCount` içindeki `Math.ceil` bozulmuştur.
- "Örnekle (konsol)" düğmesi ilk 8 parçacığın `pos`/`vel` değerlerini konsola basar.
- `navigator.gpu` yoksa rozet "WebGPU yok — CPU yedeği (10.000 parçacık)" der ve
  aynı sahne Canvas2D'de çizilir.

## Lisans

MIT

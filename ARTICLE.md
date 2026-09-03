# Veri Eve Dönmesin: WebGPU Compute Shader'la 100.000 Parçacık

*Parçacıkları CPU'da güncelleyip her karede GPU'ya yollamayı bırakıyoruz. Konum ve hız GPU belleğinde kalıyor, bir compute shader hepsini paralel güncelliyor, render aynı buffer'ı okuyor. Gerçek TypeScript + WGSL, dispatchWorkgroups tuzağı, readback'in bedeli ve dürüst ölçüm.*

*Tahmini okuma süresi: 18 dakika*

---

Nesne havuzları yazısında parçacık sayısını beş yüze çıkarıp "tamam, sıfır ayırma" demiştik. Havuz çalıştı, GC sustu. Kare süresi grafiğindeki testere dişi düzleşti.

Geçen ay aynı demoyu açıp sayıyı yüz bine çektim.

Testere dişi geri gelmedi. Gerçekten gelmedi; havuz görevini kusursuz yapıyordu, sayaç ilk saniyeden sonra donuyordu. Ama kare süresi 16 milisaniyeden 40'a çıktı. Tek bir nesne bile ayrılmıyordu ve sayfa yine takılıyordu.

Çünkü havuz *ayırmayı* çözer, *işi* değil.

Yüz bin parçacığın konumunu her karede güncellemek yüz bin kere çarp-topla demektir ve JavaScript bunu tek bir çekirdekte, sırayla yapar. Üstüne bir masraf daha binir: o yüz bin parçacığı çizdirmek için koordinatları GPU'ya göndermek gerekir. Kare başına 1,6 megabayt, sürekli, tek yönlü bir trafik.

Bu yazıda iki masrafı da birden siliyoruz. Yöntemi tek cümleyle söyleyeyim: veriyi GPU'ya koyup bir daha geri almamak.

Yol haritası şöyle. Önce CPU döngüsünün tavanını göreceğiz. Sonra compute shader'ın render hattının neresinde durduğunu, storage buffer'ın uniform buffer'dan farkını konuşacağız. Ardından WGSL'de gerçek bir simülasyon çekirdeği yazıp `dispatchWorkgroups`'un herkesi bir kez yakalayan tuzağına düşeceğiz (ben iki kez düştüm). Compute pass ile render pass'i aynı encoder'da zincirleyecek, sonucu CPU'ya geri okumanın yolunu ve bedelini göstereceğiz. Sonda ölçüm var, bir de headless testte doğrulanabilen katman.

Bir şeyi tekrar anlatmayacağım: adapter ve device almayı, canvas'ı yapılandırmayı, WGSL modülü derlemeyi, render pipeline ve render pass kurmayı. Cihazı ve render hattını [ilk WebGPU render pipeline yazısında](#) kurmuştuk; `initWebGPU`, `resizeCanvas` ve `pickCanvasFormat` oradan aynen geliyor. Bu yazı doğrudan compute tarafına giriyor.

### Arşiv Odası

Zihin modelini baştan kuralım, çünkü bu yazının tamamı tek bir görüntünün üzerine oturuyor.

Şimdiye kadarki bütün parçacık kodumuzda CPU, arşiv odasının **dışında** oturan tek bir memurdu. Her sabah odaya girer, yüz bin dosyayı tek tek eline alır, her birine yeni bir damga vurur, hepsini kucaklayıp yan binadaki çizim masasına taşır. Ertesi sabah aynı şey. Dosyalar hiç yerinde durmaz; sürekli odayla masa arasında gider gelir.

Compute shader'ın yaptığı şey memuru değiştirmek değil. Odayı değiştirmek.

Dosyalar arşiv odasında kalıyor. Odanın içinde yüz bin memur var ve her biri tek bir dosyadan sorumlu. Sabah tek bir talimat veriliyor ("herkes kendi dosyasına şu damgayı vursun") ve iş bir anda bitiyor. Çizim masası da aynı odanın içinde; kimse hiçbir dosyayı dışarı taşımıyor.

Benzetme yazı boyunca peşimizi bırakmayacak. Memurlar 64'lük masalarda oturacak (workgroup), son masada boş sandalyeler kalacak (sınır koruması), ve bir gün merak edip "şu ilk sekiz dosyayı bir göreyim" diyeceğiz (readback, geri okuma). O son istek göründüğünden pahalı.

### CPU Döngüsünün Tavanı

Önce mevcut halin nesi kötü, sayıyla görelim. Bugüne kadar yazdığımız parçacık güncellemesi özünde şuydu:

```ts
// src/cpu-sim.ts
// Parçacık başına 4 float: posX, posY, velX, velY (düzen src/particles.ts'te)
import { PARTICLE_FLOATS } from "./particles";
export { PARTICLE_FLOATS };

export function stepParticlesCPU(
  data: Float32Array,
  count: number,
  dt: number,
  boundsX: number,
  boundsY: number,
  gravityX: number,
  gravityY: number,
  damping: number,
): void {
  for (let i = 0; i < count; i++) {
    const o = i * PARTICLE_FLOATS;

    let px = data[o];
    let py = data[o + 1];
    let vx = (data[o + 2] + gravityX * dt) * damping;
    let vy = (data[o + 3] + gravityY * dt) * damping;

    px += vx * dt;
    py += vy * dt;

    // duvarlardan sek, her sekişte enerjinin %20'sini yut
    if (px < 0) {
      px = 0;
      vx = -vx * 0.8;
    } else if (px > boundsX) {
      px = boundsX;
      vx = -vx * 0.8;
    }
    if (py < 0) {
      py = 0;
      vy = -vy * 0.8;
    } else if (py > boundsY) {
      py = boundsY;
      vy = -vy * 0.8;
    }

    data[o] = px;
    data[o + 1] = py;
    data[o + 2] = vx;
    data[o + 3] = vy;
  }
}
```

Bu fonksiyon kötü yazılmış değil. Nesne dizisi yerine düz bir `Float32Array` kullanıyor, hiç ayırma yapmıyor, cache dostu bir düzende ilerliyor. Havuz yazısındaki bütün dersleri uygulanmış halde barındırıyor.

Yine de tek bir çekirdekte, tek tek çalışıyor.

Yüz bin parçacıkta bu döngü M2 Pro'lu bir MacBook'ta kare başına yaklaşık 1,55 ms sürüyor. 16,7 ms'lik bütçenin içinde kulağa idare edilir geliyor. Ama hikâyenin yarısı bu. Diğer yarısı, güncellenen koordinatların ekrana çıkması için GPU'ya taşınması gerektiği: `queue.writeBuffer` ile kare başına `100.000 × 16 = 1,6 MB`. Sprite batching yazısında on bin sprite'ı tek draw call'a indirmiştik ama o yazıda da güncelleme CPU'daydı ve her karede dolu bir vertex buffer yukarı akıyordu. Sayı büyüdükçe o akış darboğaza dönüşüyor.

500 bin parçacıkta tablo şuna dönüşüyor: 7,8 ms güncelleme, 8 MB yükleme. Oyun mantığına, girdiye, çizime kalan süre yok.

Havuz bu duvarı yıkamaz. Havuz çöpü çözer, hesabı değil.

### Compute Shader Nedir?

Şimdiye kadar GPU'ya sadece "çiz" dedik. Vertex shader köşe konumu üretti, fragment shader piksel rengi üretti, ikisi de render pipeline'ın sabit akışının içindeydi: köşeler girer, pikseller çıkar.

**Compute shader** (hesaplama gölgelendiricisi) bu akışın tamamen dışında durur. Ne köşe alır ne piksel üretir. Sadece bellek okur, hesap yapar, belleğe yazar. Grafik boru hattının bir parçası değildir; GPU'nun paralel çekirdeklerine doğrudan erişimdir.

Bunu ilk duyduğumda kafamı karıştıran şuydu: madem GPU her zaman paraleldi, fragment shader da paralel değil miydi? Paraleldi. Ama fragment shader'ın çıktısını siz seçemezsiniz. Nereye yazacağını rasterizer belirler, bir piksele karşılık gelir, bir sonraki karede o veri gitmiştir. Bir simülasyonu fragment shader'la yürütmek istiyorsanız veriyi dokuya kodlayıp iki doku arasında ping-pong yapmanız gerekir. Yıllarca öyle yapıldı ve gerçekten çirkindi.

Compute shader ile ihtiyacınız olan şey sadece bir dizi. Hangi elemana yazacağınıza siz karar verirsiniz.

Kurulumu render pipeline'a çok benziyor, hatta daha kısa:

```ts
// src/pipelines.ts
import { SIM_WGSL } from "./sim.wgsl";
import { RENDER_WGSL } from "./render.wgsl";

export function createSimPipeline(device: GPUDevice): GPUComputePipeline {
  const module = device.createShaderModule({
    label: "particle-sim",
    code: SIM_WGSL,
  });

  return device.createComputePipeline({
    label: "particle-sim-pipeline",
    layout: "auto", // bind group layout'unu shader'dan çıkar
    compute: { module, entryPoint: "cs_main" },
  });
}
```

Render pipeline'da `vertex` ve `fragment` diye iki aşama vardı, burada tek bir `compute` aşaması var. Vertex buffer düzeni yok, renk hedefi yok. Primitive topolojisi de öyle. Çıktı bir ekran değil, bir buffer.

Peki hangi buffer?

### Storage Buffer: GPU'da Kalan Veri

Şimdiye kadar GPU'ya iki tür veri gönderdik. Vertex buffer köşe verisi taşıdı, uniform buffer da kare başına değişen birkaç sayıyı (çözünürlük, konum, açı). İkisi de **read-only**'dir; shader onlara yazamaz.

Compute shader'ın yazabilmesi lazım. Bunun için üçüncü bir tür var: **storage buffer** (depolama tamponu).

Farkları üç maddede toplayayım:

- **Uniform buffer:** küçük (varsayılan sınır 64 KB), salt okunur, bütün invocation'lar aynı değerleri okur. Simülasyon parametreleri için biçilmiş kaftan.
- **Storage buffer:** büyük (varsayılan sınır 128 MB, yani 8 milyondan fazla parçacık), okunabilir ve yazılabilir, dizinin farklı elemanlarına farklı thread'ler erişebilir. Simülasyon verisinin kendisi için.
- **Vertex buffer:** sabit adımlı, rasterizer'a bağlı, sadece vertex aşamasında görünür. Bizim senaryomuzda hiç kullanmayacağız.

Parçacık verisini bir kez üretip bir kez yüklüyoruz. Üretim tarafı saf ve tohumlu, çünkü hem test edilebilir olsun hem de her açılışta aynı sahneyi görebilelim (mulberry32 üreteci havuz ve broad-phase yazılarından tanıdık):

```ts
// src/particles.ts
export const PARTICLE_FLOATS = 4; // posX, posY, velX, velY
export const PARTICLE_STRIDE = 16; // bayt: 4 × Float32

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ekrana yayılmış, rastgele yönlere fırlayan parçacıklar.
export function initParticles(
  count: number,
  width: number,
  height: number,
  rng: () => number,
): Float32Array<ArrayBuffer> {
  const data = new Float32Array(count * PARTICLE_FLOATS);
  for (let i = 0; i < count; i++) {
    const o = i * PARTICLE_FLOATS;
    const angle = rng() * Math.PI * 2;
    const speed = 20 + rng() * 180;
    data[o] = rng() * width;
    data[o + 1] = rng() * height;
    data[o + 2] = Math.cos(angle) * speed;
    data[o + 3] = Math.sin(angle) * speed;
  }
  return data;
}

export function particleBufferSize(count: number): number {
  return count * PARTICLE_STRIDE;
}
```

Buffer'ı oluştururken `usage` bayrakları yine sözleşmenin bir maddesi. Üçünü de açıkça istiyoruz:

```ts
// src/gpu-particles.ts
import { initParticles, makeRng, particleBufferSize } from "./particles";

export function createParticleBuffer(
  device: GPUDevice,
  count: number,
  width: number,
  height: number,
  seed = 1337,
): GPUBuffer {
  const data = initParticles(count, width, height, makeRng(seed));

  const buffer = device.createBuffer({
    label: "particles",
    size: particleBufferSize(count),
    usage:
      GPUBufferUsage.STORAGE | // compute yazacak, vertex okuyacak
      GPUBufferUsage.COPY_DST | // writeBuffer ile ilk veriyi koyacağız
      GPUBufferUsage.COPY_SRC, // readback için staging'e kopyalayacağız
  });

  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}
```

Bu `writeBuffer` çağrısı bütün yazının en önemli satırı. Çünkü **bir kez** çalışıyor.

Uygulamanın geri kalanında CPU'dan GPU'ya parçacık verisi akmıyor. Kare başına giden tek şey 32 baytlık bir uniform. Dosyalar arşiv odasına giriyor ve orada kalıyor.

`COPY_SRC` bayrağını en sona koydum çünkü sadece readback bölümünde kullanacağız. Onu baştan eklemenin bir maliyeti yok ama unutursanız `copyBufferToBuffer` çağrısı validation hatasıyla reddedilir. Bu bayrağı ilk denememde unuttum ve hata mesajı bana tam olarak hangi bayrağın eksik olduğunu yazdı. WebGL'den gelen biri için hâlâ şaşırtıcı bir konfor.

### WGSL Compute Çekirdeği

Sıra odanın içindeki talimatta. Simülasyon shader'ı, uniform parametreleri ve storage dizisini alıp her parçacığı bir adım ilerletiyor:

```ts
// src/sim.wgsl.ts
export const SIM_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2f,
  vel : vec2f,
};

struct SimParams {
  dt      : f32,
  count   : u32,
  bounds  : vec2f,   // canvas boyutu (piksel)
  gravity : vec2f,
  damping : f32,
  _pad    : f32,     // 32 bayta tamamla
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : SimParams;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id : vec3u) {
  let i = id.x;

  // SINIR KORUMASI: son workgroup diziden taşabilir
  if (i >= params.count) {
    return;
  }

  var p = particles[i];

  p.vel = (p.vel + params.gravity * params.dt) * params.damping;
  p.pos = p.pos + p.vel * params.dt;

  // duvarlardan sek
  if (p.pos.x < 0.0) {
    p.pos.x = 0.0;
    p.vel.x = -p.vel.x * 0.8;
  } else if (p.pos.x > params.bounds.x) {
    p.pos.x = params.bounds.x;
    p.vel.x = -p.vel.x * 0.8;
  }
  if (p.pos.y < 0.0) {
    p.pos.y = 0.0;
    p.vel.y = -p.vel.y * 0.8;
  } else if (p.pos.y > params.bounds.y) {
    p.pos.y = params.bounds.y;
    p.vel.y = -p.vel.y * 0.8;
  }

  particles[i] = p;
}
`;
```

`stepParticlesCPU` ile satır satır karşılaştırın. Aynı matematik. Tek fark: JavaScript sürümünde bir `for` döngüsü var, burada yok.

Döngü nereye gitti? Döngü, GPU'nun kendisi. Bu shader tek bir parçacık için yazılıyor ve donanım onu yüz bin kez, aynı anda çalıştırıyor. Hangi parçacıktan sorumlu olduğunuzu ise `@builtin(global_invocation_id)` söylüyor: bütün dispatch içindeki küresel sıra numaranız.

`@workgroup_size(64)` ise memurların kaçarlı masalarda oturduğunu belirtiyor. Bir workgroup, aynı anda başlatılan ve isterlerse ortak bir bellek alanını (`var<workgroup>`) paylaşabilen bir invocation grubudur. Bizim shader'ımızda paylaşım yok, her memur kendi dosyasına bakıyor, ama grup boyutu yine de performansı etkiliyor çünkü donanım thread'leri 32'li veya 64'lü demetler halinde zamanlıyor.

İki kural var ve ikisi de hatırlanmaya değer:

- Boyutların çarpımı 256'yı **aşamaz**. `@workgroup_size(64)` serbest, `@workgroup_size(16, 16)` serbest (256), `@workgroup_size(32, 16)` reddedilir (512). Bu, `maxComputeInvocationsPerWorkgroup` limitidir ve varsayılanı 256'dır.
- 1 boyutlu veri için 64 iyi bir varsayılandır. 32 çoğu donanımda alt kullanım yaratır, 256 ise register baskısı yüzünden bazen geri teper. Ölçmeden bir sayıya âşık olmayın.

Uniform tarafında bir ayrıntı var: `count` alanı `u32`, geri kalan her şey `f32`. Bunu tek bir `Float32Array` ile paketleyemezsiniz, çünkü `f32[1] = 100000` yazdığınızda belleğe IEEE-754 float bit deseni gider ve shader onu tamsayı olarak okuyup saçma bir sayı bulur. Çözüm, aynı `ArrayBuffer` üzerine iki görünüm açmak:

```ts
// src/sim-params.ts
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
```

Aynı belleğin iki farklı gözle okunması ilk bakışta hile gibi duruyor ama GPU tarafında zaten olan şey tam olarak bu. Struct dediğimiz şey bir bayt dizisinin isimlendirilmiş hali.

Bu fonksiyonu birazdan test edeceğiz, çünkü hizalama hatasının bedeli ekranda "bir şeyler garip" olarak görünür ve kaynağını bulmak saatler alır.

### dispatchWorkgroups: En Sık Yapılan Hata

Shader hazır, buffer hazır. Şimdi talimatı vereceğiz.

```ts
// Sözde-kod — bu blok projede YOK, gerçek hali src/renderer.ts içinde
const pass = encoder.beginComputePass({ label: "sim-pass" });
pass.setPipeline(simPipeline);
pass.setBindGroup(0, simBindGroup);
pass.dispatchWorkgroups(/* ??? */);
pass.end();
```

O soru işaretinin yerine ne yazacaksınız?

İlk denememde `dispatchWorkgroups(count)` yazdım. Yüz bin parçacık var, yüz bin thread lazım, mantıklı görünüyordu. Demo çalıştı. Ekranda parçacıklar dosdoğru simüle oldu, hiçbir görsel hata yoktu.

Sadece 64 kat yavaştı.

Çünkü `dispatchWorkgroups` **thread** sayısı değil, **workgroup** sayısı alır. `dispatchWorkgroups(100000)` demek, "100.000 masa kur, her masada 64 memur otursun" demek. GPU 6,4 milyon invocation başlattı; bunların 6,3 milyonu `if (i >= params.count) return;` satırına çarpıp anında geri döndü. Sınır koruması beni doğruluk hatasından kurtardı ve performans hatasını da başarıyla gizledi. Ekran doğru olduğu için sorunu ancak profiler'a bakınca gördüm.

Bunu düzeltirken ikinci hataya düştüm: `dispatchWorkgroups(count / 64)`. JavaScript'te bölme tamsayı vermez, `dispatchWorkgroups` ise ondalık almaz; sayı aşağı yuvarlanır. 100.000 / 64 = 1562,5 → 1562 workgroup → 99.968 parçacık güncellenir. Kalan 32 parçacık ekranın açıldığı ilk konumda donmuş halde bekler. Karanlık bir sahnede otuz iki hareketsiz nokta, fark etmesi tam yirmi dakikamı aldı.

Doğrusu yukarı yuvarlamak:

```ts
// src/dispatch.ts
export const WORKGROUP_SIZE = 64;

// dispatchWorkgroups THREAD değil GRUP sayısı ister.
// Son grup dolmasa da başlatılmalı; artan invocation'ları shader eleyecek.
export function workgroupCount(
  particleCount: number,
  size = WORKGROUP_SIZE,
): number {
  if (particleCount <= 0) return 0;
  return Math.ceil(particleCount / size);
}

// Tek bir dispatch boyutunda kaç workgroup'a izin var?
// maxComputeWorkgroupsPerDimension varsayılanı 65535.
export function fitsInOneDispatch(
  particleCount: number,
  size = WORKGROUP_SIZE,
  maxPerDimension = 65535,
): boolean {
  return workgroupCount(particleCount, size) <= maxPerDimension;
}
```

İki fonksiyon, on satır, ve bu yazının en çok baş ağrıtan iki hatası kapanıyor.

Yukarı yuvarlama ile sınır koruması birbirinin tamamlayıcısı. `Math.ceil` son masayı da kuruyor, o masada boş sandalyeler kalıyor, `if (i >= params.count) return;` satırı da o boş sandalyelerde oturan hayali memurların komşunun dosyasına damga vurmasını engelliyor. Biri olmadan diğeri işe yaramaz: yuvarlamazsanız veri eksik güncellenir, korumazsanız dizinin dışına yazarsınız.

`fitsInOneDispatch` ise ileriye dönük bir sigorta. 65535 workgroup × 64 invocation = 4.194.240 parçacık. Bunun üstüne çıkmak isterseniz dispatch'i ikinci boyuta (`dispatchWorkgroups(x, y)`) yaymanız gerekir. Bu yazının demosu 500 binde duruyor, o yüzden ihtiyacımız olmayacak, ama sınırın nerede olduğunu bilmek iyidir.

### Compute Pass ve Render Pass'i Aynı Karede Zincirlemek

Simülasyon GPU'da. Şimdi çizim.

Buradaki asıl kazanç şu: render aşaması, compute'un yazdığı **aynı** storage buffer'ı okuyor. Arada kopyalama yok, CPU'ya uğrama yok. Vertex shader'da bir vertex buffer bile kullanmıyoruz; köşeleri `vertex_index`'ten üretip parçacığı `instance_index` ile storage dizisinden çekiyoruz.

```ts
// src/render.wgsl.ts
export const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2f,
  vel : vec2f,
};

struct ViewParams {
  resolution : vec2f,
  size       : f32,   // parçacık kenar uzunluğu (piksel)
  _pad       : f32,
};

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform> view : ViewParams;

struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) speed : f32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vi : u32,
  @builtin(instance_index) ii : u32,
) -> VSOut {
  // Birim kare: iki üçgen, 6 köşe. Vertex buffer yok, tablo shader'ın içinde.
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );

  let p = particles[ii];
  let px = p.pos + corners[vi] * view.size * 0.5;

  // piksel -> clip-space (-1..1), y ekseni ters
  let clip = vec2f(
    px.x / view.resolution.x * 2.0 - 1.0,
    1.0 - px.y / view.resolution.y * 2.0,
  );

  var out : VSOut;
  out.position = vec4f(clip, 0.0, 1.0);
  out.speed = length(p.vel);
  return out;
}

@fragment
fn fs_main(frag : VSOut) -> @location(0) vec4f {
  // yavaş mavi, hızlı turuncu
  let t = clamp(frag.speed / 600.0, 0.0, 1.0);
  let color = mix(vec3f(0.25, 0.55, 1.0), vec3f(1.0, 0.72, 0.25), t);
  return vec4f(color, 0.55);
}
`;
```

Dikkat: `read_write` değil, `read`. Vertex aşaması storage buffer'ı sadece okuyabilir ve bu bir sınırlama değil, bir güvence. Aynı buffer'a compute yazarken vertex'in de yazmasına izin verilseydi yarış durumu kaçınılmaz olurdu.

Render pipeline'ı da toplu çizim için katkı (additive) harmanlamayla kuruyoruz, üst üste binen parçacıklar birikerek parlasın diye:

```ts
// src/pipelines.ts (devam)
export function createParticleRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
): GPURenderPipeline {
  const module = device.createShaderModule({
    label: "particle-render",
    code: RENDER_WGSL,
  });

  return device.createRenderPipeline({
    label: "particle-render-pipeline",
    layout: "auto",
    vertex: { module, entryPoint: "vs_main" }, // buffers YOK
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one", // katkı harmanlama
              operation: "add",
            },
            alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
}
```

Küçük bir tuzak: iki pipeline da `layout: "auto"` kullandığı için bind group layout'ları paylaşılmaz. Aynı parçacık buffer'ını gösteren **iki ayrı** bind group oluşturmanız gerekir, biri compute pipeline'ın layout'uyla, diğeri render'ınkiyle. Aynı bind group'u ikisine birden vermeyi denerseniz validation hatası alırsınız. Layout'u elle yazıp paylaşmak da mümkün ama iki pipeline için ekstra otuz satır demek; ben kolayına kaçtım.

Kare fonksiyonu artık iki pass'i tek encoder'da zincirliyor:

```ts
    // src/renderer.ts — createGpuParticleRenderer'ın döndürdüğü nesnenin render metodu
    render(now: number): void {
      const dt = Math.min((now - last) / 1000, 1 / 30); // sekme dönüşünde patlamasın
      last = now;

      packSimParams(
        simParams,
        dt,
        count,
        canvas.width,
        canvas.height,
        0,
        900,
        0.999,
      );
      device.queue.writeBuffer(simParamsBuffer, 0, simParams.buffer);

      packViewParams(viewParams, canvas.width, canvas.height, PARTICLE_SIZE);
      device.queue.writeBuffer(viewParamsBuffer, 0, viewParams.buffer);

      const encoder = device.createCommandEncoder({ label: "frame" });

      // 1) Simülasyon: veriyi GPU'da güncelle
      const compute = encoder.beginComputePass({ label: "sim-pass" });
      compute.setPipeline(simPipeline);
      compute.setBindGroup(0, simBindGroup);
      compute.dispatchWorkgroups(workgroupCount(count));
      compute.end();

      // 2) Çizim: AYNI buffer'ı oku
      const pass = encoder.beginRenderPass({
        label: "draw-pass",
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.03, g: 0.04, b: 0.08, a: 1 },
          },
        ],
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(0, renderBindGroup);
      pass.draw(6, count); // 6 köşe × count instance
      pass.end();

      device.queue.submit([encoder.finish()]);
    },
```

Kare başına CPU'dan GPU'ya giden veri: 32 bayt + 16 bayt. Toplam 48 bayt. Yüz bin parçacık için.

Bir soru çıkabilir: compute pass bittiğinde render pass verinin hazır olduğunu nereden biliyor? WebGPU bunu sizin için hallediyor. Aynı encoder'daki pass'ler kayıt sırasına göre çalışır ve iki pass arasındaki kaynak bağımlılıkları için gereken bariyerleri sürücü koyar. Vulkan veya Metal'de bu bariyeri elle yazmanız gerekirdi. WebGPU'nun soyutlaması burada cömert davranıyor.

Küçük bir itiraf: parçacıkları storage buffer'dan `instance_index` ile okumak yerine aynı buffer'ı `VERTEX` usage'ıyla bağlayıp instanced vertex attribute olarak da okuyabilirdim. WebGL2'de tek seçenek zaten odur ve bu serinin ilerideki instanced rendering yazısı o yolu anlatacak. WebGPU'da ikisi de çalışıyor; storage yolunu seçmemin tek sebebi vertex layout tanımlamadan kurtulmak. Performans farkını kendi makinemde ölçemedim, ölçenler yazsın.

### Sonucu Geri Okumak (ve Neden Genelde Okumamalısınız)

Buraya kadar veri hep tek yönde aktı. Peki tersi mümkün mü? Parçacıkların doğru hareket ettiğini gözle değil, sayıyla doğrulamak istersek?

Mümkün, ama düşündüğünüz gibi değil.

Storage buffer'ı doğrudan `mapAsync` ile CPU'ya açamazsınız. `MAP_READ` bayrağı `STORAGE` ile aynı buffer'da birleşemez; WebGPU bunu kasten yasaklar. Yol şudur: `MAP_READ | COPY_DST` bayraklı ayrı bir **staging buffer** (ara tampon) oluşturup storage buffer'dan oraya kopyalamak, sonra o kopyayı map etmek.

```ts
// src/readback.ts
import { PARTICLE_STRIDE } from "./particles";

// Kaç bayt okuyacağız? İstenen örnek sayısını gerçek sayıyla sınırla.
export function readbackByteLength(
  sampleCount: number,
  totalCount: number,
): number {
  const n = Math.max(0, Math.min(Math.floor(sampleCount), totalCount));
  return n * PARTICLE_STRIDE;
}

// TEK SEFERLİK doğrulama içindir. Sıcak döngüde ÇAĞIRMAYIN.
export async function readParticles(
  device: GPUDevice,
  particles: GPUBuffer,
  sampleCount: number,
  totalCount: number,
): Promise<Float32Array> {
  const size = readbackByteLength(sampleCount, totalCount);
  if (size === 0) return new Float32Array(0);

  const staging = device.createBuffer({
    label: "particle-readback",
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const encoder = device.createCommandEncoder({ label: "readback" });
  encoder.copyBufferToBuffer(particles, 0, staging, 0, size);
  device.queue.submit([encoder.finish()]);

  // Bu satır GPU'nun o noktaya gelmesini bekler: senkronizasyon noktası.
  await staging.mapAsync(GPUMapMode.READ);

  // getMappedRange() unmap sonrası geçersizleşir, o yüzden kopyala.
  const copy = new Float32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return copy;
}
```

Demoda bunu bir düğmeye bağladım. Basınca ilk sekiz parçacığın konumu ve hızı konsola dökülüyor:

```ts
// src/main.ts ("Örnekle" düğmesinin gövdesi)
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
```

Bunu ilk çalıştırdığımda gerçekten rahatladım. `initParticles`'ın ürettiği başlangıç değerlerini biliyordum, ekrandaki hareketi görüyordum ama compute shader'ın **tam olarak** doğru sayıları yazdığından emin değildim. Konsolda beklediğim aralıkta konumları görünce shader'ın matematiğine güvenim yerine geldi.

Şimdi kötü haber.

O `await mapAsync` satırı bir senkronizasyon noktasıdır. CPU, GPU'nun kuyruktaki bütün işi bitirip kopyayı tamamlamasını bekler. Bu bekleme tipik olarak bir ila üç kare sürer. Her karede yaparsanız GPU ile CPU'yu sırayla çalışmaya zorlarsınız ve boru hattının bütün örtüşmesi çöker. Yüz bin parçacığı GPU'da güncelleyip her karede geri okumak, en başa dönmekten daha kötüdür.

Arşiv odası benzetmesine dönelim. Readback, odaya girip "durun, şu ilk sekiz dosyanın fotokopisini istiyorum" demektir. Odadaki iş durur, kopya çıkar, size uzatılır. Bunu bir kez yapmak makul. Her sabah yapmak, odayı taşımanızın bütün sebebini ortadan kaldırır.

Kural şöyle: readback'i geliştirme sırasında doğrulama için, ekran görüntüsü almak için veya simülasyonu kalıcı olarak kaydetmek için kullanın. Kare döngüsünde asla. GPU'da hesaplanan bir değer oyun mantığını etkileyecekse (mesela parçacık çarpışma sayısı), sonucu bir kare geriden okumayı ve bu gecikmeyi tasarıma dahil etmeyi düşünün.

### Ölçüm: Kaç Parçacık?

Sayılara geçmeden önce dürüst bir uyarı: GPU ölçümleri makineye, sürücüye, tarayıcı sürümüne ve hatta pil durumuna göre değişir. Aşağıdaki CPU rakamları Apple M2 Pro'lu bir MacBook'ta, Node v22'de, 2560×1440 sınırlarda alındı. Sizde farklı çıkacak. Demo GPU tarafını ekranın köşesinde canlı gösteriyor, kendi makinenizde ölçün.

CPU tarafını Node'da ölçüyoruz, `npm run bench` ile. Bu ölçüm sadece güncelleme döngüsünü kapsıyor, çizimi değil:

```
== stepParticlesCPU, 600 kare ==
     10.000 parçacık   kare başına  0.15 ms   15.5 ns/parçacık   yükleme   156 KB/kare
    100.000 parçacık   kare başına  1.55 ms   15.5 ns/parçacık   yükleme  1563 KB/kare
    500.000 parçacık   kare başına  7.84 ms   15.7 ns/parçacık   yükleme  7813 KB/kare
```

Parçacık başına maliyet üç boyutta da 15,5 nanosaniye. Döngü doğrusal ölçekleniyor, yani burada saklı bir cache patlaması yok; sadece iş çok ve tek çekirdek var.

Tabloyu şöyle toplayabiliriz:

| Parçacık | CPU update | CPU→GPU yükleme / kare | GPU compute pass | GPU kare süresi |
|---|---|---|---|---|
| 10.000 | 0,15 ms | 156 KB | tarayıcıda ölçülecek | tarayıcıda ölçülecek |
| 100.000 | 1,55 ms | 1563 KB | tarayıcıda ölçülecek | tarayıcıda ölçülecek |
| 500.000 | 7,84 ms | 7813 KB | tarayıcıda ölçülecek | tarayıcıda ölçülecek |

Son iki sütunu boş bırakmam bilerek: Node'da GPU yok, `npm run bench` compute pass süresini ölçemez ve ölçemediğim bir sayıyı tabloya yazmam. O sütunları demoyu tarayıcıda açıp HUD'dan okuyarak dolduracağız — proje `README`'sinde nasıl yapılacağı yazıyor.

Ölçebildiğim sütun bile hikâyeyi anlatıyor. 100 binde 1,55 ms tek başına felaket değil. Felaket, o sürenin yanına 1,6 MB'lık yüklemenin, oyun mantığının ve çizimin eklenmesi. 500 binde CPU yolu 7,84 ms ile bütçenin yarısını yiyor ve daha hiçbir şey çizilmedi. Compute yolunda kare başına yukarı giden tek şey 48 bayt.

Bir de şu var: GPU tarafında asıl fatura simülasyondan değil çizimden gelir. 500 bin parçacık × 6 köşe = 3 milyon köşe, üstüne katkı harmanlamayla üst üste binen milyonlarca fragment. Compute pass'i büyütmek kolay, fill rate'i büyütmek değil.

Demoyu M2 Pro'lu MacBook'ta, Chromium tabanlı bir tarayıcıda açıp üç ölçeği de ölçtüm:

| parçacık | FPS | kare süresi | CPU (JS) |
|---|---|---|---|
| 10.000 | 118 | 8,47 ms | 0,13 ms |
| 100.000 | 120 | 8,33 ms | 0,07 ms |
| 500.000 | 120 | 8,32 ms | 0,06 ms |

Tablodan okunacak şey FPS sütunu değil, çünkü 120 zaten ekranın tavanı: üç ölçekte de vsync'e yaslanıyoruz, GPU sıkışmıyor. Asıl haber son sütunda. Parçacık sayısı elli kat artarken JS tarafının kare başına harcadığı süre **artmıyor, azalıyor**. Mantıklı: CPU'nun tek işi bir uniform yazıp bir dispatch çağırmak, ve bu iş 10 bin parçacıkta ne kadarsa 500 binde de o kadar. Ölçüm gürültüsü içindeki 0,13 → 0,06 farkı da buradan geliyor, bir iyileşmeden değil.

Karşılaştırma için aynı simülasyonun CPU sürümü: 100 binde kare başına 1,55 ms, 500 binde 7,84 ms — üstelik bu sadece güncelleme, çizim hariç. Yanına her karede GPU'ya akan 1,6 MB ve 7,6 MB'ı da ekleyin. Aradaki fark iki kat değil; iki farklı problem.

Demoda ekranın köşesinde FPS, kare süresi, aktif parçacık sayısı ve adapter'ın bildirdiği GPU adı yazıyor:

```ts
// src/gpu-info.ts
export function describeAdapter(adapter: GPUAdapter): string {
  const info = adapter.info;
  if (!info) return "bilinmiyor";
  const parts = [info.vendor, info.architecture, info.device].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return parts.length > 0
    ? parts.join(" ")
    : (info.description ?? "bilinmiyor");
}
```

Bu alanların çoğu zaman boş geldiğini de söyleyeyim. Tarayıcılar parmak izi çıkarmayı zorlaştırmak için GPU bilgisini maskeliyor; benim M2 Pro'lu makinemde `vendor` "apple", `architecture` "metal-3" dönüyor ama `device` boş. Rozet o yüzden "WebGPU · apple metal-3" yazıyor: fonksiyon boş alanları eleyip elinde kalanla yetiniyor.

WebGPU hiç yoksa ne olacak? Sessizce boş ekran değil, net bir mesaj ve çalışan bir yedek:

```ts
// src/main.ts (seçim mantığı)
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
```

CPU yedeği aynı `stepParticlesCPU` fonksiyonunu kullanıyor ve Canvas2D'ye çiziyor. Parçacık sayısı 10 binde sabit, çünkü daha fazlası o yolda dürüst olmuyor.

### Test Edilebileni Test Etmek

Headless vitest'te `navigator.gpu` yok, canvas yok, GPU yok. Compute pipeline'ı, dispatch'i, WGSL'in doğruluğunu birim testiyle doğrulayamayız. Bunu baştan kabul edelim.

Ama bu yazıda beni yakan iki hatanın ikisi de saf matematikteydi.

`dispatchWorkgroups`'a yanlış sayı vermek bir aritmetik hatasıydı. Uniform'u yanlış paketlemek bir bayt düzeni hatasıydı. İkisi de GPU'ya dokunmayan fonksiyonlarda yaşıyor ve ikisi de deterministik olarak test edilebilir.

Önce dispatch aritmetiği, kenar vakalarıyla:

```ts
// test/dispatch.test.ts
import { describe, it, expect } from "vitest";
import {
  WORKGROUP_SIZE,
  workgroupCount,
  fitsInOneDispatch,
} from "../src/dispatch";

describe("workgroupCount", () => {
  it("workgroup boyutu 64'tür ve 256 limitini aşmaz", () => {
    expect(WORKGROUP_SIZE).toBe(64);
    expect(WORKGROUP_SIZE).toBeLessThanOrEqual(256);
  });

  it("kenar vakaları: 0, 1, 63, 64, 65", () => {
    expect(workgroupCount(0)).toBe(0);
    expect(workgroupCount(1)).toBe(1); // tek parçacık için de bir grup
    expect(workgroupCount(63)).toBe(1);
    expect(workgroupCount(64)).toBe(1); // tam dolu tek grup
    expect(workgroupCount(65)).toBe(2); // taşan 1 parçacık için ikinci grup
  });

  it("100.000 parçacık 1563 grup eder (1562 DEĞİL)", () => {
    expect(workgroupCount(100_000)).toBe(1563);
    expect(workgroupCount(100_000) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(
      100_000,
    );
  });

  it("her zaman yeterli invocation başlatır", () => {
    for (const n of [1, 7, 63, 64, 65, 999, 100_000, 500_000]) {
      expect(workgroupCount(n) * WORKGROUP_SIZE).toBeGreaterThanOrEqual(n);
    }
  });

  it("negatif veya sıfır sayıda grup başlatmaz", () => {
    expect(workgroupCount(-5)).toBe(0);
  });
});

describe("fitsInOneDispatch", () => {
  it("65535 × 64 = 4.194.240 sınırını doğru çiziyor", () => {
    expect(fitsInOneDispatch(4_194_240)).toBe(true);
    expect(fitsInOneDispatch(4_194_241)).toBe(false);
  });
});
```

Dördüncü test bu dosyanın kalbi: başlatılan invocation sayısı hiçbir zaman parçacık sayısından az olamaz. Bu değişmezi (invariant) bir kez yazdıktan sonra, birisi bir gün "optimizasyon" niyetiyle `Math.ceil`'i `Math.floor` yaparsa test kırmızıya döner ve donmuş otuz iki parçacığı yirmi dakika aramaz.

Sonra uniform paketleme. Burada test edilecek şey sadece değerler değil, bayt düzeninin kendisi:

```ts
// test/sim-params.test.ts
import { describe, it, expect } from "vitest";
import {
  SIM_PARAMS_SIZE,
  createSimParams,
  packSimParams,
} from "../src/sim-params";

describe("packSimParams", () => {
  it("32 bayt tutar ve 16'nın katıdır", () => {
    const p = createSimParams();
    expect(p.buffer.byteLength).toBe(SIM_PARAMS_SIZE);
    expect(p.buffer.byteLength % 16).toBe(0);
  });

  it("WGSL struct sırasına birebir oturur", () => {
    const p = createSimParams();
    packSimParams(p, 1 / 60, 100_000, 1920, 1080, 0, 900, 0.999);

    expect(p.f32[0]).toBeCloseTo(1 / 60, 6);
    expect(p.u32[1]).toBe(100_000); // u32 görünümü
    expect(p.f32[2]).toBe(1920);
    expect(p.f32[3]).toBe(1080);
    expect(p.f32[4]).toBe(0);
    expect(p.f32[5]).toBe(900);
    expect(p.f32[6]).toBeCloseTo(0.999, 6);
    expect(p.f32[7]).toBe(0); // _pad
  });

  it("count'u float olarak yazmak yanlış bitler üretirdi", () => {
    const p = createSimParams();
    packSimParams(p, 0.016, 100_000, 800, 600, 0, 900, 1);

    // Aynı 4 bayt, float gözüyle okununca anlamsız bir sayı verir.
    expect(p.f32[1]).not.toBeCloseTo(100_000, 0);
    expect(p.u32[1]).toBe(100_000);
  });
});
```

Üçüncü test biraz sıra dışı görünebilir, çünkü bir hatayı değil, bir *yanlış yaklaşımı* çiviliyor. Ama `u32` alanını `Float32Array` ile yazma hatası WebGPU'ya yeni başlayanların klasiğidir ve belirtisi çok sinsidir: simülasyon çalışır gibi durur, sadece parçacıkların bir kısmı hiç güncellenmez. Testi okuyan bir sonraki kişi neden iki görünüm kullandığımızı anlar.

Parçacık üretimi de saf ve tohumlu, o yüzden deterministik:

```ts
// test/particles.test.ts
import { describe, it, expect } from "vitest";
import {
  PARTICLE_FLOATS,
  PARTICLE_STRIDE,
  initParticles,
  makeRng,
  particleBufferSize,
} from "../src/particles";

describe("initParticles", () => {
  it("parçacık başına 4 float üretir", () => {
    expect(initParticles(100, 800, 600, makeRng(1)).length).toBe(
      100 * PARTICLE_FLOATS,
    );
  });

  it("bütün konumlar sınırların içinde başlar", () => {
    const data = initParticles(500, 800, 600, makeRng(7));
    for (let i = 0; i < 500; i++) {
      const o = i * PARTICLE_FLOATS;
      expect(data[o]).toBeGreaterThanOrEqual(0);
      expect(data[o]).toBeLessThanOrEqual(800);
      expect(data[o + 1]).toBeGreaterThanOrEqual(0);
      expect(data[o + 1]).toBeLessThanOrEqual(600);
    }
  });

  it("aynı tohum aynı sahneyi verir, farklı tohum vermez", () => {
    const a = initParticles(64, 800, 600, makeRng(42));
    const b = initParticles(64, 800, 600, makeRng(42));
    const c = initParticles(64, 800, 600, makeRng(43));
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

describe("particleBufferSize", () => {
  it("stride 16 bayttır ve boyut 4'ün katıdır", () => {
    expect(PARTICLE_STRIDE).toBe(16);
    expect(particleBufferSize(100_000)).toBe(1_600_000);
    expect(particleBufferSize(65)).toBe(1040);
    expect(particleBufferSize(65) % 4).toBe(0);
  });
});
```

CPU simülasyonunun kendisini de test ediyoruz, hem yedek yol doğru çalışsın diye hem de WGSL çekirdeğinin matematiğini bir kez daha okumuş olalım diye:

```ts
// test/cpu-sim.test.ts
import { describe, it, expect } from "vitest";
import { stepParticlesCPU } from "../src/cpu-sim";

describe("stepParticlesCPU", () => {
  it("yerçekimi ve sönüm yokken konum = konum + hız × dt", () => {
    const data = new Float32Array([100, 100, 60, -30]);
    stepParticlesCPU(data, 1, 0.5, 800, 600, 0, 0, 1);
    expect(data[0]).toBeCloseTo(130, 5); // 100 + 60 × 0.5
    expect(data[1]).toBeCloseTo(85, 5); // 100 - 30 × 0.5
  });

  it("sol duvara çarpınca sınıra oturur ve hızı ters çevirir", () => {
    const data = new Float32Array([5, 300, -100, 0]);
    stepParticlesCPU(data, 1, 0.5, 800, 600, 0, 0, 1);
    expect(data[0]).toBe(0); // duvara oturdu
    expect(data[2]).toBeCloseTo(80, 5); // -(-100) × 0.8
  });

  it("count'tan sonraki veriye dokunmaz", () => {
    const data = new Float32Array([0, 0, 10, 10, 7, 7, 7, 7]);
    stepParticlesCPU(data, 1, 1, 800, 600, 0, 0, 1); // sadece ilk parçacık
    expect(Array.from(data.slice(4))).toEqual([7, 7, 7, 7]);
  });
});
```

Son test dikkat çekici olsun diye orada: `count` parametresine saygı duymak, WGSL tarafındaki `if (i >= params.count) return;` satırının JavaScript'teki tam karşılığı. İki dünyada aynı değişmez, iki farklı biçimde yazılmış.

Readback boyut hesabı da saf:

```ts
// test/readback.test.ts
import { describe, it, expect } from "vitest";
import { readbackByteLength } from "../src/readback";

describe("readbackByteLength", () => {
  it("örnek sayısını 16 bayt stride ile çarpar", () => {
    expect(readbackByteLength(8, 100_000)).toBe(128);
  });

  it("istenen sayı toplamı aşarsa toplamla sınırlar", () => {
    expect(readbackByteLength(200, 100)).toBe(1600);
  });

  it("negatif veya sıfır istekte 0 döner", () => {
    expect(readbackByteLength(-5, 10)).toBe(0);
    expect(readbackByteLength(0, 10)).toBe(0);
  });

  it("sonuç her zaman 4'ün katıdır (copyBufferToBuffer şartı)", () => {
    for (const n of [1, 3, 7, 8, 99]) {
      expect(readbackByteLength(n, 1000) % 4).toBe(0);
    }
  });
});
```

Bu testlerin hiçbiri parçacıkların ekranda doğru göründüğünü kanıtlamaz. Onun için tarayıcıda açıp bakmak, sayıyı 500 bine çekip kare süresine bakmak, sonra readback düğmesine basıp konsoldaki sayıların makul olduğunu görmek gerekiyor. Ama gecemi yiyen hatalar burada, bu saf katmandaydı.

### Özetle:

1. Nesne havuzu ayırmayı çözer, hesabı değil. Yüz bin parçacıkta darboğaz GC değil, tek çekirdekte dönen güncelleme döngüsü ve kare başına GPU'ya akan megabaytlardır.
2. Compute shader render hattının dışında durur: köşe almaz, piksel üretmez, sadece belleği okur ve yazar. `device.createComputePipeline({ layout, compute: { module, entryPoint } })` ile kurulur.
3. Storage buffer, compute'un yazabildiği tek buffer türüdür (`var<storage, read_write>`). Uniform küçük ve salt okunurdur; simülasyon parametreleri için o yeter.
4. Parçacık buffer'ını `STORAGE | COPY_DST | COPY_SRC` ile oluşturun ve `writeBuffer`'ı yalnızca bir kez, kurulumda çağırın. Kare başına yukarı giden tek şey 48 baytlık uniform olsun.
5. WGSL çekirdeği tek bir parçacık için yazılır; döngünün yerini `@builtin(global_invocation_id)` alır. `@workgroup_size` boyutlarının çarpımı 256'yı aşamaz; 1B veri için 64 iyi bir başlangıçtır.
6. `dispatchWorkgroups` thread değil GRUP sayısı alır. Doğru çağrı `Math.ceil(count / WORKGROUP_SIZE)`. Sayıyı doğrudan vermek 64 kat fazla invocation başlatır, aşağı yuvarlamak da son parçacıkları dondurur.
7. Sınır koruması şart: `if (id.x >= params.count) { return; }`. Yukarı yuvarlama ile bu satır birbirinin tamamlayıcısıdır, biri olmadan diğeri işe yaramaz.
8. `u32` ve `f32` alanları karışık bir uniform'u tek `Float32Array` ile paketleyemezsiniz. Aynı `ArrayBuffer` üzerine iki görünüm açın.
9. Compute pass ve render pass aynı `GPUCommandEncoder`'da zincirlenir; aradaki bariyerleri sürücü koyar. Render, compute'un yazdığı buffer'ı `var<storage, read>` ile okur.
10. Vertex buffer zorunlu değil: köşeleri `vertex_index`'ten üretip parçacığı `instance_index` ile storage dizisinden çekmek `draw(6, count)` ile tek çağrıda biter.
11. Storage buffer doğrudan map edilemez. Readback için `MAP_READ | COPY_DST` staging buffer'a `copyBufferToBuffer` yapıp `mapAsync` edin ve `getMappedRange()` sonucunu `unmap` öncesi kopyalayın.
12. `mapAsync` bir senkronizasyon noktasıdır, bir ila üç kare bekletir. Doğrulama ve kayıt için kullanın, kare döngüsünde asla.
13. Headless testte GPU yoktur ama hatalarınızın çoğu saf katmandadır: dispatch aritmetiği, uniform bayt düzeni, buffer boyutu, tohumlu veri üretimi. Değişmezleri (`grup × 64 >= count`) test edin.

Repo GitHub'da. `npm test` saf katmanı doğruluyor, `npm run bench` CPU döngüsünün tavanını kendi makinenizde gösteriyor. Demoyu açmak için `npm run dev`; parçacık sayısını 10 binden 500 bine çekip kare süresine bakın, sonra readback düğmesine basın.

Havuz yazısında bardağı yere atmayı bırakmıştık; bu yazıda bardağı hiç dışarı çıkarmadık. İki yazı aynı sorunun farklı eksenlerinden geçip aynı cümlede buluşuyor: sıcak yoldaki en ucuz iş, yapılmayan iştir. `dispatchWorkgroups(count)` yazdığım o ilk gün canımı sıkan da buydu. Kod doğruydu, ekran doğruydu ve GPU altı milyon memuru sırf sıraya girip geri dönsünler diye işe çağırıyordu. Doğru çalışan bir program, gereksiz çalışan bir program olmaktan kurtulmuyor. ⚙️

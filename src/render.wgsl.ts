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

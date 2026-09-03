export const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2f,
  vel : vec2f,
};

struct ViewParams {
  resolution : vec2f,
  size       : f32,   // particle edge length (pixels)
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
  // Unit quad: two triangles, 6 vertices. No vertex buffer, the table lives inside the shader.
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );

  let p = particles[ii];
  let px = p.pos + corners[vi] * view.size * 0.5;

  // pixels -> clip space (-1..1), y axis flipped
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
  // slow is blue, fast is orange
  let t = clamp(frag.speed / 600.0, 0.0, 1.0);
  let color = mix(vec3f(0.25, 0.55, 1.0), vec3f(1.0, 0.72, 0.25), t);
  return vec4f(color, 0.55);
}
`;

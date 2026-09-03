export const SIM_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2f,
  vel : vec2f,
};

struct SimParams {
  dt      : f32,
  count   : u32,
  bounds  : vec2f,   // canvas size (pixels)
  gravity : vec2f,
  damping : f32,
  _pad    : f32,     // pad out to 32 bytes
};

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<uniform> params : SimParams;

@compute @workgroup_size(64)
fn cs_main(@builtin(global_invocation_id) id : vec3u) {
  let i = id.x;

  // BOUNDS GUARD: the last workgroup can overrun the array
  if (i >= params.count) {
    return;
  }

  var p = particles[i];

  p.vel = (p.vel + params.gravity * params.dt) * params.damping;
  p.pos = p.pos + p.vel * params.dt;

  // bounce off the walls
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

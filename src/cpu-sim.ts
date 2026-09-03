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

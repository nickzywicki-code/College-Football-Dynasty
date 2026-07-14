// Thin matter-js wrapper for on-field player physics.
// Players are circle bodies (mass from strength); movement is steering-blended
// so collision impulses (blocks, hits, piles) survive user/AI control.

import Matter from 'matter-js';
import type { Player } from '../engine/types';

const STEP_MS = 1000 / 60;
/** matter velocity is distance per 16.67ms step; ours is yards/sec */
const V = 1 / 60;
/** low per-step air drag so bodies coast naturally; steering does the stopping */
const AIR = 0.05;
/** compensates the drag so driven bodies actually reach their rated speed */
const DRAG_COMP = 1 / (1 - AIR);

export interface PhysBody {
  body: Matter.Body;
}

// collision categories: the ball carrier can be made to "phase" through players
// locked in a block (they're occupied) so he isn't stuck behind the pile, while
// still colliding with — and being tackled by — free defenders.
const CAT_PLAYER = 0x0001;
const CAT_BLOCKED = 0x0002;

export class PhysicsWorld {
  engine: Matter.Engine;
  private acc = 0;

  constructor(fieldW: number, fieldLen: number) {
    this.engine = Matter.Engine.create();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    // sideline + end-line walls keep non-carriers on the field
    const wall = (x: number, y: number, w: number, h: number) =>
      Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, restitution: 0.1 });
    Matter.Composite.add(this.engine.world, [
      wall(-0.5, fieldLen / 2, 1, fieldLen + 4),
      wall(fieldW + 0.5, fieldLen / 2, 1, fieldLen + 4),
      wall(fieldW / 2, -0.5, fieldW + 4, 1),
      wall(fieldW / 2, fieldLen + 0.5, fieldW + 4, 1),
    ]);
  }

  addPlayer(x: number, y: number, p: Player): Matter.Body {
    const density = 0.9 + (p.attrs.str / 99) * 1.1; // heavier = harder to move
    const body = Matter.Bodies.circle(x, y, 0.42, {
      density,
      frictionAir: AIR,
      friction: 0.02,
      restitution: 0.08,
      collisionFilter: { category: CAT_PLAYER, mask: CAT_PLAYER | CAT_BLOCKED, group: 0 },
    });
    Matter.Composite.add(this.engine.world, body);
    return body;
  }

  /** Flag a body as locked in a block (or not) so carriers can slip past it. */
  setBlocked(body: Matter.Body, blocked: boolean): void {
    body.collisionFilter.category = blocked ? CAT_BLOCKED : CAT_PLAYER;
  }

  /** When true, this body ignores blocked players (runs through the pile). */
  setPhasing(body: Matter.Body, phasing: boolean): void {
    body.collisionFilter.mask = phasing ? CAT_PLAYER : CAT_PLAYER | CAT_BLOCKED;
  }

  remove(body: Matter.Body): void {
    Matter.Composite.remove(this.engine.world, body);
  }

  /**
   * Steer a body toward a desired velocity (yards/sec). Blends rather than
   * overwrites so knockback / pushing from collisions persists. `accel` is
   * the blend rate (1/s): higher = snappier direction changes.
   */
  drive(body: Matter.Body, vx: number, vy: number, accel = 16, dt = 1 / 60): void {
    const cur = body.velocity;
    const t = Math.min(1, accel * dt);
    // overdrive slightly so equilibrium against air drag lands on the true speed
    const tx = vx * V * DRAG_COMP;
    const ty = vy * V * DRAG_COMP;
    Matter.Body.setVelocity(body, {
      x: cur.x + (tx - cur.x) * t,
      y: cur.y + (ty - cur.y) * t,
    });
  }

  /** Instant velocity kick in yards/sec (tackle knockback, juke burst, sheds). */
  impulse(body: Matter.Body, vx: number, vy: number): void {
    Matter.Body.setVelocity(body, {
      x: body.velocity.x + vx * V,
      y: body.velocity.y + vy * V,
    });
  }

  /** Advance the simulation with fixed 60Hz substeps. */
  step(dt: number): void {
    this.acc += dt * 1000;
    let n = 0;
    while (this.acc >= STEP_MS && n++ < 4) {
      Matter.Engine.update(this.engine, STEP_MS);
      this.acc -= STEP_MS;
    }
    if (this.acc > STEP_MS * 4) this.acc = 0;
  }

  /** Current speed of a body in yards/sec. */
  speedOf(body: Matter.Body): number {
    return Math.hypot(body.velocity.x, body.velocity.y) / V;
  }

  velocityOf(body: Matter.Body): { vx: number; vy: number } {
    return { vx: body.velocity.x / V, vy: body.velocity.y / V };
  }

  setPosition(body: Matter.Body, x: number, y: number): void {
    Matter.Body.setPosition(body, { x, y });
    Matter.Body.setVelocity(body, { x: 0, y: 0 });
  }
}

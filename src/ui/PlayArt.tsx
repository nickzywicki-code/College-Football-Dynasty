// Miniature playbook diagram: formation dots + route arrows, drawn to match
// the horizontal field orientation (offense attacks right).

import { useEffect, useRef } from 'react';
import type { OffensivePlay } from '../game/playbook';
import { OFFENSE_ALIGNMENT } from '../game/playbook';

const W = 128;
const H = 64;
/** map playbook coords (x lateral, y depth) → diagram px (depth → x, lateral → y) */
const DEPTH_SCALE = 2.6;
const LAT_SCALE = 1.25;
const LOS_X = 34;

function pt(depth: number, lateral: number): [number, number] {
  return [LOS_X + depth * DEPTH_SCALE, H / 2 + lateral * LAT_SCALE];
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 5 * Math.cos(angle - 0.45), y - 5 * Math.sin(angle - 0.45));
  ctx.moveTo(x, y);
  ctx.lineTo(x - 5 * Math.cos(angle + 0.45), y - 5 * Math.sin(angle + 0.45));
  ctx.stroke();
}

export function PlayArt({ play }: { play: OffensivePlay }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // chalkboard field
    ctx.fillStyle = '#0f2418';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (let d = -5; d <= 35; d += 10) {
      const [x] = pt(d, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // LOS
    ctx.strokeStyle = 'rgba(78,163,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(LOS_X, 0);
    ctx.lineTo(LOS_X, H);
    ctx.stroke();

    // offensive line as squares
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 5; i++) {
      const a = OFFENSE_ALIGNMENT[`OL${i}`];
      const [x, y] = pt(a.y, a.x);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    // skill players as circles + routes as arrows
    const slots: { slot: 'QB' | 'RB' | 'TE' | 'WR1' | 'WR2' | 'WR3'; color: string }[] = [
      { slot: 'QB', color: '#ffcf40' },
      { slot: 'RB', color: '#3ddc68' },
      { slot: 'TE', color: '#e8e8f0' },
      { slot: 'WR1', color: '#e8e8f0' },
      { slot: 'WR2', color: '#e8e8f0' },
      { slot: 'WR3', color: '#e8e8f0' },
    ];
    for (const { slot, color } of slots) {
      const a = OFFENSE_ALIGNMENT[slot];
      const [x, y] = pt(a.y, a.x);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.stroke();

      // route line
      const route = play.routes?.[slot as keyof NonNullable<typeof play.routes>];
      if (play.type === 'pass' && route && route.length) {
        ctx.strokeStyle = slot.startsWith('WR') ? '#ffcf40' : '#3ddc68';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let [px, py] = pt(a.y, a.x);
        ctx.moveTo(px, py);
        for (const rp of route) {
          const [nx, ny] = pt(rp.y, rp.x);
          ctx.lineTo(nx, ny);
          px = nx;
          py = ny;
        }
        ctx.stroke();
        const last = route[route.length - 1];
        const prev = route.length > 1 ? route[route.length - 2] : a;
        const [lx, ly] = pt(last.y, last.x);
        const [pxx, pyy] = pt(prev.y, prev.x);
        arrowHead(ctx, lx, ly, Math.atan2(ly - pyy, lx - pxx));
      }
    }

    // run play: bold arrow from QB through the hole
    if (play.type === 'run' && play.runPoint) {
      const rb = OFFENSE_ALIGNMENT.RB;
      ctx.strokeStyle = '#ff5a4e';
      ctx.lineWidth = 2;
      const [sxp, syp] = pt(rb.y, rb.x);
      const [exp, eyp] = pt(play.runPoint.y, play.runPoint.x);
      ctx.beginPath();
      ctx.moveTo(sxp, syp);
      // slight curve through the mesh point
      ctx.quadraticCurveTo(LOS_X - 6, (syp + eyp) / 2, exp, eyp);
      ctx.stroke();
      arrowHead(ctx, exp, eyp, Math.atan2(eyp - syp, exp - sxp));
    }
  }, [play]);

  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 3, marginTop: 6 }}
    />
  );
}

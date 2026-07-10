// Canvas rendering for the arcade game: field, players, ball, markers.

import type { ArcadeGame } from './arcade';
import { FIELD_LEN, FIELD_W } from './arcade';

/** Visible field width in yards — zoomed in, camera pans laterally. */
const VIEW_W = 38;

export interface Camera {
  x: number; // field x at left edge of viewport
  y: number; // field y at the bottom of the viewport
  scale: number; // pixels per yard
  viewH: number; // in yards
}

export function updateCamera(cam: Camera, game: ArcadeGame, canvasW: number, canvasH: number, dt: number): void {
  cam.scale = canvasW / VIEW_W;
  cam.viewH = canvasH / cam.scale;
  // follow the ball, keeping it in the lower third (offense attacks upward)
  const targetY = game.ball.y - cam.viewH * 0.32;
  const clampedY = Math.max(0, Math.min(FIELD_LEN - cam.viewH, targetY));
  const targetX = Math.max(0, Math.min(FIELD_W - VIEW_W, game.ball.x - VIEW_W / 2));
  const k = Math.min(1, dt * 5);
  cam.y += (clampedY - cam.y) * k;
  cam.x += (targetX - cam.x) * k;
}

function fy(cam: Camera, y: number, canvasH: number): number {
  // field y → screen y (flip: higher field y is up the screen)
  return canvasH - (y - cam.y) * cam.scale;
}

function fx(cam: Camera, x: number): number {
  return (x - cam.x) * cam.scale;
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: ArcadeGame,
  cam: Camera,
  canvasW: number,
  canvasH: number,
): void {
  const s = cam.scale;
  const leftX = fx(cam, 0);
  const rightX = fx(cam, FIELD_W);

  // out-of-bounds surround
  ctx.fillStyle = '#0d3320';
  ctx.fillRect(0, 0, canvasW, canvasH);
  // grass
  ctx.fillStyle = '#1a7a3c';
  ctx.fillRect(leftX, 0, rightX - leftX, canvasH);
  // mowing stripes every 5 yards
  for (let y = 0; y < FIELD_LEN; y += 10) {
    const top = fy(cam, y + 5, canvasH);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(leftX, top, rightX - leftX, 5 * s);
  }

  // end zones (offense attacks y=110; far zone in CPU color, near in user color)
  ctx.fillStyle = hexWithAlpha(game.cpuTeam.colors[0], 0.55);
  ctx.fillRect(leftX, fy(cam, 120, canvasH), rightX - leftX, 10 * s);
  ctx.fillStyle = hexWithAlpha(game.userTeam.colors[0], 0.55);
  ctx.fillRect(leftX, fy(cam, 10, canvasH), rightX - leftX, 10 * s);

  // end zone text
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `bold ${3 * s}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(game.cpuTeam.name.toUpperCase(), fx(cam, FIELD_W / 2), fy(cam, 115, canvasH) + 1.1 * s);
  ctx.fillText(game.userTeam.name.toUpperCase(), fx(cam, FIELD_W / 2), fy(cam, 5, canvasH) + 1.1 * s);
  ctx.restore();

  // sidelines
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, 0.18 * s);
  line(ctx, leftX, 0, leftX, canvasH);
  line(ctx, rightX, 0, rightX, canvasH);

  // yard lines
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, 0.11 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `bold ${1.7 * s}px sans-serif`;
  for (let y = 10; y <= 110; y += 5) {
    const sy = fy(cam, y, canvasH);
    if (sy < -10 || sy > canvasH + 10) continue;
    ctx.beginPath();
    ctx.moveTo(leftX, sy);
    ctx.lineTo(rightX, sy);
    ctx.stroke();
    if ((y - 10) % 10 === 0 && y > 10 && y < 110) {
      const num = y - 10 <= 50 ? y - 10 : 100 - (y - 10);
      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillText(String(num), Math.max(6, leftX + 6), sy - 3);
      ctx.textAlign = 'right';
      ctx.fillText(String(num), Math.min(canvasW - 6, rightX - 6), sy - 3);
      ctx.restore();
    }
    // hash marks
    ctx.beginPath();
    ctx.moveTo(fx(cam, FIELD_W * 0.37), sy);
    ctx.lineTo(fx(cam, FIELD_W * 0.37 + 0.6), sy);
    ctx.moveTo(fx(cam, FIELD_W * 0.63 - 0.6), sy);
    ctx.lineTo(fx(cam, FIELD_W * 0.63), sy);
    ctx.stroke();
  }

  // LOS + first down markers during offensive possession
  if (game.phase === 'presnap' || game.phase === 'live' || game.phase === 'playcall') {
    const losY = 10 + (100 - game.yardsToGoal);
    const fdY = Math.min(110, losY + game.toGo);
    ctx.strokeStyle = 'rgba(80,140,255,0.85)';
    ctx.lineWidth = Math.max(1.5, 0.2 * s);
    line(ctx, leftX, fy(cam, losY, canvasH), rightX, fy(cam, losY, canvasH));
    ctx.strokeStyle = 'rgba(255,214,60,0.9)';
    line(ctx, leftX, fy(cam, fdY, canvasH), rightX, fy(cam, fdY, canvasH));
  }

  // players
  if (game.phase === 'presnap' || game.phase === 'live') {
    for (const e of game.ents) {
      const px = fx(cam, e.x);
      const py = fy(cam, e.y, canvasH);
      if (py < -20 || py > canvasH + 20) continue;
      const team = e.side === 'off'
        ? game.possession === 'user' ? game.userTeam : game.cpuTeam
        : game.possession === 'user' ? game.cpuTeam : game.userTeam;
      const radius = 1.0 * s;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = e.stunTimer > 0 ? hexWithAlpha(team.colors[0], 0.45) : team.colors[0];
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.14 * s);
      ctx.strokeStyle = e === game.carrier ? '#ffe14b' : team.colors[1];
      ctx.stroke();
      // jersey number
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${0.95 * s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(e.player.jersey), px, py);
    }
    // control indicator
    if (game.carrier) {
      const c = game.carrier;
      ctx.beginPath();
      ctx.arc(fx(cam, c.x), fy(cam, c.y, canvasH), 1.55 * s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,225,75,0.9)';
      ctx.lineWidth = Math.max(1, 0.16 * s);
      ctx.stroke();
    }
  }

  // ball
  if (game.phase === 'live' || game.phase === 'presnap') {
    const bx = fx(cam, game.ball.x);
    let by = fy(cam, game.ball.y, canvasH);
    if (game.ball.inFlight) {
      // arc: lift the ball visually mid-flight
      const t = Math.min(1, game.ball.flightT / game.ball.flightDur);
      const lift = Math.sin(t * Math.PI) * 2.2 * s;
      by -= lift;
    }
    ctx.beginPath();
    ctx.ellipse(bx, by, 0.5 * s, 0.35 * s, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#8a5220';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

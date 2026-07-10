// Canvas rendering for the arcade game: field, players, ball, markers.

import type { ArcadeGame } from './arcade';
import { FIELD_LEN, FIELD_W } from './arcade';

export interface Camera {
  /** field y at the bottom of the viewport */
  y: number;
  /** pixels per yard */
  scale: number;
  viewH: number; // in yards
}

export function updateCamera(cam: Camera, game: ArcadeGame, canvasW: number, canvasH: number, dt: number): void {
  cam.scale = canvasW / FIELD_W;
  cam.viewH = canvasH / cam.scale;
  // follow the ball, keeping it in the lower third (offense attacks upward)
  const targetY = game.ball.y - cam.viewH * 0.32;
  const clamped = Math.max(0, Math.min(FIELD_LEN - cam.viewH, targetY));
  cam.y += (clamped - cam.y) * Math.min(1, dt * 5);
}

function fy(cam: Camera, y: number, canvasH: number): number {
  // field y → screen y (flip: higher field y is up the screen)
  return canvasH - (y - cam.y) * cam.scale;
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: ArcadeGame,
  cam: Camera,
  canvasW: number,
  canvasH: number,
): void {
  const s = cam.scale;

  // grass
  ctx.fillStyle = '#1a7a3c';
  ctx.fillRect(0, 0, canvasW, canvasH);
  // mowing stripes every 5 yards
  for (let y = 0; y < FIELD_LEN; y += 10) {
    const top = fy(cam, y + 5, canvasH);
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, top, canvasW, 5 * s);
  }

  // end zones
  const userAttacksTop = true;
  void userAttacksTop;
  const ezFar = game.userIsHome ? game.userTeam : game.userTeam; // offense attacks y=110
  void ezFar;
  ctx.fillStyle = hexWithAlpha(game.cpuTeam.colors[0], 0.55);
  ctx.fillRect(0, fy(cam, 120, canvasH), canvasW, 10 * s);
  ctx.fillStyle = hexWithAlpha(game.userTeam.colors[0], 0.55);
  ctx.fillRect(0, fy(cam, 10, canvasH), canvasW, 10 * s);

  // end zone text
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = `bold ${3.2 * s}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(game.cpuTeam.name.toUpperCase(), canvasW / 2, fy(cam, 115, canvasH) + 1.2 * s);
  ctx.fillText(game.userTeam.name.toUpperCase(), canvasW / 2, fy(cam, 5, canvasH) + 1.2 * s);
  ctx.restore();

  // yard lines
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, 0.12 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `bold ${1.8 * s}px sans-serif`;
  for (let y = 10; y <= 110; y += 5) {
    const sy = fy(cam, y, canvasH);
    if (sy < -10 || sy > canvasH + 10) continue;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(canvasW, sy);
    ctx.stroke();
    if ((y - 10) % 10 === 0 && y > 10 && y < 110) {
      const num = y - 10 <= 50 ? y - 10 : 100 - (y - 10);
      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillText(String(num), 6, sy - 3);
      ctx.textAlign = 'right';
      ctx.fillText(String(num), canvasW - 6, sy - 3);
      ctx.restore();
    }
    // hash marks
    if ((y - 10) % 5 === 0) {
      ctx.beginPath();
      ctx.moveTo(canvasW * 0.36, sy);
      ctx.lineTo(canvasW * 0.36 + 0.5 * s, sy);
      ctx.moveTo(canvasW * 0.64 - 0.5 * s, sy);
      ctx.lineTo(canvasW * 0.64, sy);
      ctx.stroke();
    }
  }

  // LOS + first down markers during offensive possession
  if (game.phase === 'presnap' || game.phase === 'live' || game.phase === 'playcall') {
    const losY = 10 + (100 - game.yardsToGoal);
    const fdY = Math.min(110, losY + game.toGo);
    ctx.strokeStyle = 'rgba(80,140,255,0.85)';
    ctx.lineWidth = Math.max(1.5, 0.2 * s);
    line(ctx, 0, fy(cam, losY, canvasH), canvasW, fy(cam, losY, canvasH));
    ctx.strokeStyle = 'rgba(255,214,60,0.9)';
    line(ctx, 0, fy(cam, fdY, canvasH), canvasW, fy(cam, fdY, canvasH));
  }

  // players
  if (game.phase === 'presnap' || game.phase === 'live') {
    for (const e of game.ents) {
      const px = e.x * s;
      const py = fy(cam, e.y, canvasH);
      const team = e.side === 'off'
        ? game.possession === 'user' ? game.userTeam : game.cpuTeam
        : game.possession === 'user' ? game.cpuTeam : game.userTeam;
      const radius = 1.05 * s;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = e.stunTimer > 0 ? hexWithAlpha(team.colors[0], 0.45) : team.colors[0];
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.14 * s);
      ctx.strokeStyle = e === game.carrier ? '#ffe14b' : team.colors[1];
      ctx.stroke();
      // jersey number
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${1.05 * s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(e.player.jersey), px, py);
    }
    // control indicator
    if (game.carrier) {
      const c = game.carrier;
      ctx.beginPath();
      ctx.arc(c.x * s, fy(cam, c.y, canvasH), 1.6 * s, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,225,75,0.9)';
      ctx.lineWidth = Math.max(1, 0.16 * s);
      ctx.stroke();
    }
  }

  // ball
  if (game.phase === 'live' || game.phase === 'presnap') {
    const bx = game.ball.x * s;
    let by = fy(cam, game.ball.y, canvasH);
    if (game.ball.inFlight) {
      // arc: lift the ball visually mid-flight
      const t = Math.min(1, game.ball.flightT / game.ball.flightDur);
      const lift = Math.sin(t * Math.PI) * 2.2 * s;
      by -= lift;
    }
    ctx.beginPath();
    ctx.ellipse(bx, by, 0.55 * s, 0.38 * s, 0.6, 0, Math.PI * 2);
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

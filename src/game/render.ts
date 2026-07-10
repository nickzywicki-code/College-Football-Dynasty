// Landscape canvas renderer: horizontal field (offense drives left → right),
// pixel-art player sprites with run/throw/reach animations.
//
// Engine coordinates: x = field width (0..53.3), y = field length (0..120,
// offense attacks +y). Screen mapping: engine y → screen X, engine x → screen Y.

import type { ArcadeGame, Ent } from './arcade';
import { FIELD_LEN, FIELD_W } from './arcade';
import { getSprite, runPose, skinFor, Pose, SPRITE_GRID } from './sprites';

/** Yards of field width visible vertically (zoom level). */
const VIEW_W = 34;

export interface Camera {
  l: number; // engine y (length) at left edge of viewport
  w: number; // engine x (width) at top edge of viewport
  scale: number; // pixels per yard
}

export function updateCamera(cam: Camera, game: ArcadeGame, canvasW: number, canvasH: number, dt: number): void {
  cam.scale = canvasH / VIEW_W;
  const viewL = canvasW / cam.scale;
  // ball sits ~38% from the left so the player sees downfield
  const targetL = Math.max(0, Math.min(FIELD_LEN - viewL, game.ball.y - viewL * 0.38));
  const targetW = Math.max(0, Math.min(FIELD_W - VIEW_W, game.ball.x - VIEW_W / 2));
  const k = Math.min(1, dt * 5);
  cam.l += (targetL - cam.l) * k;
  cam.w += (targetW - cam.w) * k;
}

const sx = (cam: Camera, ey: number) => (ey - cam.l) * cam.scale;
const sy = (cam: Camera, ex: number) => (ex - cam.w) * cam.scale;

export function render(
  ctx: CanvasRenderingContext2D,
  game: ArcadeGame,
  cam: Camera,
  canvasW: number,
  canvasH: number,
): void {
  const s = cam.scale;
  ctx.imageSmoothingEnabled = false;

  // out-of-view backdrop
  ctx.fillStyle = '#0a1e10';
  ctx.fillRect(0, 0, canvasW, canvasH);

  const topY = sy(cam, 0);
  const botY = sy(cam, FIELD_W);
  // turf
  ctx.fillStyle = '#1f8a44';
  ctx.fillRect(0, topY, canvasW, botY - topY);
  // mow stripes every 5 yards along the length
  for (let y = 0; y < FIELD_LEN; y += 10) {
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    ctx.fillRect(sx(cam, y + 5), topY, 5 * s, botY - topY);
  }

  // end zones: left = user's own goal, right = the end zone being attacked
  ctx.fillStyle = hexWithAlpha(game.userTeam.colors[0], 0.6);
  ctx.fillRect(sx(cam, 0), topY, 10 * s, botY - topY);
  ctx.fillStyle = hexWithAlpha(game.cpuTeam.colors[0], 0.6);
  ctx.fillRect(sx(cam, 110), topY, 10 * s, botY - topY);

  // end zone lettering (vertical stack reads fine rotated 90)
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `${2.6 * s}px PixelDisplay, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const midY = (topY + botY) / 2;
  ctx.save();
  ctx.translate(sx(cam, 5), midY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(game.userTeam.name.toUpperCase(), 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(sx(cam, 115), midY);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(game.cpuTeam.name.toUpperCase(), 0, 0);
  ctx.restore();
  ctx.restore();

  // sidelines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(2, 0.22 * s);
  line(ctx, 0, topY, canvasW, topY);
  line(ctx, 0, botY, canvasW, botY);

  // yard lines (vertical) + numbers
  ctx.lineWidth = Math.max(1, 0.12 * s);
  ctx.font = `${1.6 * s}px PixelDisplay, monospace`;
  ctx.textAlign = 'center';
  for (let y = 10; y <= 110; y += 5) {
    const x = sx(cam, y);
    if (x < -20 || x > canvasW + 20) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    line(ctx, x, topY, x, botY);
    if ((y - 10) % 10 === 0 && y > 10 && y < 110) {
      const num = y - 10 <= 50 ? y - 10 : 100 - (y - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(String(num), x, Math.min(botY - 1.2 * s, topY + 2.6 * s));
      ctx.fillText(String(num), x, Math.max(topY + 1.2 * s, botY - 1.6 * s));
    }
    // hashes
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    line(ctx, x, sy(cam, FIELD_W * 0.37), x, sy(cam, FIELD_W * 0.37 + 0.6));
    line(ctx, x, sy(cam, FIELD_W * 0.63 - 0.6), x, sy(cam, FIELD_W * 0.63));
  }

  // LOS + first-down markers
  if (game.phase === 'presnap' || game.phase === 'live' || game.phase === 'playcall') {
    const losY = 10 + (100 - game.yardsToGoal);
    const fdY = Math.min(110, losY + game.toGo);
    ctx.strokeStyle = 'rgba(78,163,255,0.9)';
    ctx.lineWidth = Math.max(2, 0.24 * s);
    line(ctx, sx(cam, losY), topY, sx(cam, losY), botY);
    ctx.strokeStyle = 'rgba(255,207,64,0.95)';
    line(ctx, sx(cam, fdY), topY, sx(cam, fdY), botY);
  }

  // players (sorted by screen Y so lower players overlap upper — painter's order)
  if (game.phase === 'presnap' || game.phase === 'live') {
    const px = Math.max(2, Math.round((2.4 * s) / SPRITE_GRID.h));
    const ents = [...game.ents].sort((a, b) => a.x - b.x);
    for (const e of ents) {
      drawEnt(ctx, game, cam, e, px);
    }
    // control ring under carrier
    if (game.carrier) {
      const c = game.carrier;
      ctx.strokeStyle = 'rgba(255,225,75,0.95)';
      ctx.lineWidth = Math.max(2, 0.18 * s);
      ctx.beginPath();
      ctx.ellipse(sx(cam, c.y), sy(cam, c.x) + 1.0 * s, 1.3 * s, 0.55 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ball
  if (game.phase === 'live' || game.phase === 'presnap') {
    const bx = sx(cam, game.ball.y);
    let by = sy(cam, game.ball.x);
    if (game.ball.inFlight) {
      const t = Math.min(1, game.ball.flightT / game.ball.flightDur);
      by -= Math.sin(t * Math.PI) * 2.4 * s; // arc height
    } else {
      by -= 0.9 * s; // carried at waist height
    }
    ctx.fillStyle = '#8a5220';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bx, by, 0.55 * s, 0.36 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // lace
    ctx.strokeStyle = '#fff';
    line(ctx, bx - 0.2 * s, by, bx + 0.2 * s, by);
  }
}

function drawEnt(ctx: CanvasRenderingContext2D, game: ArcadeGame, cam: Camera, e: Ent, px: number): void {
  const team = e.side === 'off'
    ? game.possession === 'user' ? game.userTeam : game.cpuTeam
    : game.possession === 'user' ? game.cpuTeam : game.userTeam;
  const scheme = { primary: team.colors[0], secondary: team.colors[1], skin: skinFor(e.player.id) };

  let pose: Pose;
  const speed = Math.hypot(e.vx, e.vy);
  if (e.stunTimer > 0) pose = 'down';
  else if (game.ball.inFlight && game.ball.targetEnt === e) pose = 'reach';
  else if (e === game.qbEnt && e === game.carrier && game.play?.type === 'pass' && !game.passThrown && speed < 0.6) pose = 'throw';
  else if (speed > 0.6 || game.phase === 'live' && e.engagedWith) pose = runPose(game.playElapsed + e.player.id * 0.13);
  else pose = 'idle';

  const sprite = getSprite(scheme, pose, px);
  // facing: offense faces +y (screen right); defense faces -y; moving entities face velocity
  let faceRight = e.side === 'off';
  if (Math.abs(e.vy) > 0.4) faceRight = e.vy > 0;

  const cx = sx(cam, e.y);
  const cy = sy(cam, e.x);
  const w = sprite.width;
  const h = sprite.height;
  ctx.save();
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.46, w * 0.42, h * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(cx, cy);
  if (!faceRight) ctx.scale(-1, 1);
  ctx.drawImage(sprite, -w / 2, -h / 2);
  ctx.restore();
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

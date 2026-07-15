// Landscape canvas renderer: horizontal field (offense drives left → right),
// pixel-art player sprites with run/throw/reach animations.
//
// Engine coordinates: x = field width (0..53.3), y = field length (0..120,
// offense attacks +y). Screen mapping: engine y → screen X, engine x → screen Y.

import type { ArcadeGame, Ent } from './arcade';
import { FIELD_LEN, FIELD_W } from './arcade';
import { getSprite, runBob, runPose, skinFor, Pose, SPRITE_GRID } from './sprites';
import { getPlayerFrame, playersReady } from './realPlayers';
import { BALL_SPRITE } from './ballSheet';

// Hand-drawn football, preloaded once; getBallTex swaps to it when it decodes.
let ballImg: HTMLImageElement | null = null;
let ballImgReady = false;
if (typeof Image !== 'undefined') {
  ballImg = new Image();
  ballImg.onload = () => {
    ballImgReady = true;
    ballTex = null; // rebuild the cached texture from the loaded art
  };
  ballImg.src = BALL_SPRITE;
}

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
  const lead = game.carrier ? game.carrier.vy * 0.35 : 0;
  const targetL = Math.max(0, Math.min(FIELD_LEN - viewL, game.ball.y + lead - viewL * 0.38));
  const targetW = Math.max(0, Math.min(FIELD_W - VIEW_W, game.ball.x - VIEW_W / 2));
  const k = Math.min(1, dt * 7);
  cam.l += (targetL - cam.l) * k;
  cam.w += (targetW - cam.w) * k;
}

const sx = (cam: Camera, ey: number) => (ey - cam.l) * cam.scale;
const sy = (cam: Camera, ex: number) => (ex - cam.w) * cam.scale;

// pre-rendered crowd texture (random fan pixels on dark stands)
let crowdTex: HTMLCanvasElement | null = null;
function getCrowdTex(): HTMLCanvasElement {
  if (crowdTex) return crowdTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#141625';
  g.fillRect(0, 0, c.width, c.height);
  const fanColors = ['#c94f4f', '#4f7dc9', '#c9b44f', '#5dbb63', '#c9c9c9', '#9b6fc9', '#e0955f'];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = fanColors[(Math.random() * fanColors.length) | 0];
    g.globalAlpha = 0.55 + Math.random() * 0.45;
    g.fillRect((Math.random() * c.width) | 0, (Math.random() * c.height) | 0, 2, 2);
  }
  g.globalAlpha = 1;
  crowdTex = c;
  return c;
}

// pre-rendered 8-bit football, drawn from a pixel grid so it scales blocky
let ballTex: HTMLCanvasElement | null = null;
function getBallTex(): HTMLCanvasElement {
  if (ballTex) return ballTex;
  // Prefer the hand-drawn football once it has decoded.
  if (ballImgReady && ballImg) {
    const c = document.createElement('canvas');
    c.width = ballImg.width;
    c.height = ballImg.height;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(ballImg, 0, 0);
    ballTex = c;
    return c;
  }
  // legend: . transparent, K outline, B brown, S brown shade, H highlight, W white
  const rows = [
    '....KKKK....',
    '..KKBBBBKK..',
    '.KBBHBBBBSK.',
    'KBWBBBBBBSSK',
    'KBBWWWWWWBSK',
    'KBWBBBBBBSSK',
    '.KBBHBBBBSK.',
    '..KKSSSSKK..',
    '....KKKK....',
  ];
  const colors: Record<string, string> = {
    K: '#3a1e0a', B: '#9a5a24', S: '#7a4318', H: '#b9793c', W: '#f4efe2',
  };
  const cw = rows[0].length;
  const ch = rows.length;
  const scale = 4;
  const c = document.createElement('canvas');
  c.width = cw * scale;
  c.height = ch * scale;
  const g = c.getContext('2d')!;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const ch2 = rows[y][x];
      if (ch2 === '.') continue;
      g.fillStyle = colors[ch2];
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  ballTex = c;
  return c;
}

export function render(
  ctx: CanvasRenderingContext2D,
  game: ArcadeGame,
  cam: Camera,
  canvasW: number,
  canvasH: number,
): void {
  const s = cam.scale;
  ctx.imageSmoothingEnabled = false;
  // camera shake on big hits
  ctx.save();
  if (game.shake > 0.01) {
    const mag = game.shake * 0.5 * s;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // stands + crowd beyond the sidelines
  ctx.fillStyle = '#101221';
  ctx.fillRect(0, 0, canvasW, canvasH);
  const topY = sy(cam, 0);
  const botY = sy(cam, FIELD_W);
  const crowd = getCrowdTex();
  if (topY > 0) {
    for (let cxp = 0; cxp < canvasW; cxp += crowd.width) {
      ctx.drawImage(crowd, cxp, Math.max(-crowd.height, topY - 3.4 * s), crowd.width, 3.2 * s);
    }
  }
  if (botY < canvasH) {
    for (let cxp = 0; cxp < canvasW; cxp += crowd.width) {
      ctx.drawImage(crowd, cxp, botY + 0.2 * s, crowd.width, 3.2 * s);
    }
  }

  // turf: groomed 5-yard mow stripes (alternating shades) for a real pitch look
  const fieldH = botY - topY;
  ctx.fillStyle = '#1b7b3d';
  ctx.fillRect(0, topY, canvasW, fieldH);
  for (let y = 0; y < FIELD_LEN; y += 5) {
    ctx.fillStyle = (Math.floor(y / 5) % 2 === 0) ? '#1b7b3d' : '#218a46';
    ctx.fillRect(sx(cam, y), topY, 5 * s + 1, fieldH);
  }
  // groomed sheen: a faint lighter band across the middle third of the field
  {
    const sheen = ctx.createLinearGradient(0, topY, 0, botY);
    sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, topY, canvasW, fieldH);
  }

  // end zones: left = user's own goal, right = the end zone being attacked
  ctx.fillStyle = hexWithAlpha(game.userTeam.colors[0], 0.82);
  ctx.fillRect(sx(cam, 0), topY, 10 * s, botY - topY);
  ctx.fillStyle = hexWithAlpha(game.cpuTeam.colors[0], 0.82);
  ctx.fillRect(sx(cam, 110), topY, 10 * s, botY - topY);
  // goal-line borders + corner pylons
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(sx(cam, 10) - Math.max(1, 0.12 * s), topY, Math.max(2, 0.24 * s), botY - topY);
  ctx.fillRect(sx(cam, 110) - Math.max(1, 0.12 * s), topY, Math.max(2, 0.24 * s), botY - topY);
  ctx.fillStyle = '#ff7b00';
  for (const py of [10, 110]) {
    for (const pxx of [0, FIELD_W]) {
      ctx.fillRect(sx(cam, py) - 0.22 * s, sy(cam, pxx) - 0.22 * s, 0.44 * s, 0.44 * s);
    }
  }

  // goalposts at the back of each end zone (yellow uprights, top-down "H")
  {
    const cyc = (topY + botY) / 2;
    const half = 3.0 * s; // upright spacing
    ctx.strokeStyle = '#f2c500';
    ctx.lineWidth = Math.max(2, 0.28 * s);
    ctx.lineCap = 'round';
    for (const [backY, dir] of [[0, -1], [120, 1]] as const) {
      const gx = sx(cam, backY);
      if (gx < -6 * s || gx > canvasW + 6 * s) continue;
      // crossbar across the goal width
      line(ctx, gx, cyc - half, gx, cyc + half);
      // support post to the endline
      line(ctx, gx, cyc, gx + dir * 1.6 * s, cyc);
      // the two uprights rising off the crossbar
      line(ctx, gx, cyc - half, gx - dir * 1.9 * s, cyc - half);
      line(ctx, gx, cyc + half, gx - dir * 1.9 * s, cyc + half);
    }
    ctx.lineCap = 'butt';
  }

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
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = `${2.1 * s}px PixelDisplay, monospace`;
      const yTop = sy(cam, 8);
      const yBot = sy(cam, FIELD_W - 8);
      ctx.fillText(String(num), x, yTop);
      ctx.fillText(String(num), x, yBot);
      // arrows point toward the nearer goal line
      if (num !== 50) {
        const dir = y - 10 < 50 ? -1 : 1;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (const ay of [yTop - 0.8 * s, yBot - 0.8 * s]) {
          ctx.beginPath();
          ctx.moveTo(x + dir * 2.4 * s, ay);
          ctx.lineTo(x + dir * 3.1 * s, ay + 0.35 * s);
          ctx.lineTo(x + dir * 2.4 * s, ay + 0.7 * s);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.font = `${1.6 * s}px PixelDisplay, monospace`;
    }
    // hashes
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    line(ctx, x, sy(cam, FIELD_W * 0.37), x, sy(cam, FIELD_W * 0.37 + 0.6));
    line(ctx, x, sy(cam, FIELD_W * 0.63 - 0.6), x, sy(cam, FIELD_W * 0.63));
  }

  // midfield logo: home team's painted circle at the 50
  {
    const homeTeam = game.userIsHome ? game.userTeam : game.cpuTeam;
    const mx = sx(cam, 60);
    const my = (topY + botY) / 2;
    if (mx > -8 * s && mx < canvasW + 8 * s) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = homeTeam.colors[0];
      ctx.beginPath();
      ctx.arc(mx, my, 4.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, 0.35 * s);
      ctx.strokeStyle = homeTeam.colors[1];
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, 0.14 * s);
      ctx.beginPath();
      ctx.arc(mx, my, 3.6 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `${2.0 * s}px PixelDisplay, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(homeTeam.abbr, mx, my + 0.15 * s);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }
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

  // pre-snap route tree: bold, glowing, animated lines so reads are obvious
  if (game.phase === 'presnap' && game.possession === 'user') {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const pulse = 0.7 + 0.3 * Math.sin(now * 4); // gentle breathing on the arrowheads
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const e of game.ents) {
      if (e.side !== 'off' || e.route.length === 0) continue;
      const icon = (game.constructor as typeof ArcadeGame).RECV_ICONS[e.role as keyof typeof ArcadeGame.RECV_ICONS];
      const col = icon ? icon.color : '#ffffff';
      const pts = [{ x: e.x, y: e.y }, ...e.route];
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(sx(cam, pts[0].y), sy(cam, pts[0].x));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(cam, pts[i].y), sy(cam, pts[i].x));
      };

      // 1) dark casing underneath for contrast against the turf
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(6, 0.62 * s);
      path();
      ctx.stroke();

      // 2) glowing colored route with dashes that flow toward the break
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 0.7 * s;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(3, 0.34 * s);
      ctx.setLineDash([1.0 * s, 0.55 * s]);
      ctx.lineDashOffset = -now * 7 * s;
      path();
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([]);

      // 3) breakpoint dots where the route changes direction
      ctx.fillStyle = '#ffffff';
      for (let i = 1; i < e.route.length; i++) {
        const wp = e.route[i - 1];
        ctx.beginPath();
        ctx.arc(sx(cam, wp.y), sy(cam, wp.x), Math.max(2, 0.22 * s), 0, Math.PI * 2);
        ctx.fill();
      }

      // 4) chunky arrowhead at the route's end, breathing slightly
      const last = e.route[e.route.length - 1];
      const prev = e.route.length > 1 ? e.route[e.route.length - 2] : { x: e.x, y: e.y };
      const ax = sx(cam, last.y);
      const ay = sy(cam, last.x);
      const ang = Math.atan2(ay - sy(cam, prev.x), ax - sx(cam, prev.y));
      const ah = 1.15 * s * pulse;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 0.5 * s;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(ang) * 0.35 * s, ay + Math.sin(ang) * 0.35 * s);
      ctx.lineTo(ax - Math.cos(ang - 0.6) * ah, ay - Math.sin(ang - 0.6) * ah);
      ctx.lineTo(ax - Math.cos(ang + 0.6) * ah, ay - Math.sin(ang + 0.6) * ah);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // 5) receiver label chip at the route end (matches the throw button)
      if (icon) {
        const lx = ax + Math.cos(ang) * 1.4 * s;
        const ly = ay + Math.sin(ang) * 1.4 * s;
        const r = Math.max(9, 0.85 * s);
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(6,8,14,0.9)';
        ctx.lineWidth = Math.max(1.5, 0.12 * s);
        ctx.beginPath();
        ctx.arc(lx, ly, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0a0d16';
        ctx.font = `${icon.label.length > 1 ? r * 0.75 : r}px PixelDisplay, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon.label, lx, ly + r * 0.06);
        ctx.textBaseline = 'alphabetic';
      }
    }
    ctx.lineCap = 'butt';
  }

  // players (sorted by screen Y so lower players overlap upper — painter's order)
  if (game.phase === 'presnap' || game.phase === 'live' || game.phase === 'playover') {
    const px = Math.max(2, Math.round((3.0 * s) / SPRITE_GRID.h));
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

  // floating throw icons above eligible receivers (tap to throw)
  game.iconHits = [];
  if (
    game.phase === 'live' &&
    !game.passThrown &&
    game.play?.type === 'pass' &&
    game.carrier === game.qbEnt &&
    game.possession === 'user'
  ) {
    const icons = (game.constructor as typeof ArcadeGame).RECV_ICONS;
    for (const e of game.ents) {
      if (e.side !== 'off' || !game.play.routes?.[e.role as keyof typeof game.play.routes]) continue;
      const icon = icons[e.role as keyof typeof icons];
      if (!icon) continue;
      const ix = sx(cam, e.y);
      const iy = sy(cam, e.x) - 2.6 * s;
      const r = Math.max(13, 1.1 * s);
      // button bubble
      ctx.fillStyle = icon.color;
      ctx.strokeStyle = 'rgba(6,8,14,0.9)';
      ctx.lineWidth = Math.max(2, 0.14 * s);
      ctx.beginPath();
      ctx.arc(ix, iy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0d16';
      ctx.font = `${icon.label.length > 1 ? r * 0.7 : r * 0.95}px PixelDisplay, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon.label, ix, iy + r * 0.08);
      ctx.textBaseline = 'alphabetic';
      // generous tap target
      game.iconHits.push({ slot: e.role as (typeof game.iconHits)[number]['slot'], x: ix, y: iy, r: Math.max(26, r * 1.7) });
    }
  }

  // ball
  if (game.phase === 'live' || game.phase === 'presnap' || game.phase === 'playover' || game.phase === 'kickflight') {
    const bx = sx(cam, game.ball.y);
    let by = sy(cam, game.ball.x);
    let rot = 0;
    if (game.phase === 'kickflight' && game.kickAnim) {
      const t = Math.min(1, game.kickAnim.t / game.kickAnim.dur);
      by -= Math.sin(t * Math.PI) * 6.5 * s; // tall kick arc
      rot = t * Math.PI * 5; // end-over-end
    } else if (game.ball.inFlight) {
      const t = Math.min(1, game.ball.flightT / game.ball.flightDur);
      by -= Math.sin(t * Math.PI) * 2.4 * s; // arc height
      rot = t * Math.PI * 3; // spiral spin
    } else if (game.ball.loose) {
      rot = game.playElapsed * 9; // tumbling fumble
      by -= Math.abs(Math.sin(game.playElapsed * 8)) * 0.5 * s; // bouncing
    } else {
      by -= 0.9 * s; // carried at waist height
    }
    const tex = getBallTex();
    const bw = 1.7 * s;
    const bh = bw * (tex.height / tex.width);
    // planted shadow (does not spin with the ball)
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(bx, by + bh * 0.55, bw * 0.4, bh * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(rot);
    ctx.drawImage(tex, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  // particles: dust, confetti
  for (const f of game.fx) {
    const alpha = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    const px2 = sx(cam, f.y);
    const py2 = sy(cam, f.x);
    const sz = f.size * s;
    ctx.fillRect(px2 - sz / 2, py2 - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  // vignette: darken the edges for a stadium-broadcast sense of depth
  {
    const vg = ctx.createRadialGradient(
      canvasW / 2,
      canvasH / 2,
      Math.min(canvasW, canvasH) * 0.35,
      canvasW / 2,
      canvasH / 2,
      Math.max(canvasW, canvasH) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  ctx.restore(); // shake transform
}

function drawEnt(ctx: CanvasRenderingContext2D, game: ArcadeGame, cam: Camera, e: Ent, px: number): void {
  const team = e.side === 'off'
    ? game.possession === 'user' ? game.userTeam : game.cpuTeam
    : game.possession === 'user' ? game.cpuTeam : game.userTeam;
  const scheme = { primary: team.colors[0], secondary: team.colors[1], skin: skinFor(e.player.id) };

  let pose: Pose;
  const speed = Math.hypot(e.vx, e.vy);
  if (e.celebT > 0) pose = 'celebrate';
  else if (e.lungeT > 0) pose = 'tackle';
  else if (e.stunTimer > 0) pose = 'down';
  else if (game.ball.inFlight && game.ball.targetEnt === e) pose = 'reach';
  else if (e === game.qbEnt && game.releaseT > 0) pose = 'release';
  else if (e === game.qbEnt && e === game.carrier && game.play?.type === 'pass' && !game.passThrown && speed < 0.6) pose = 'throw';
  else if (e.engagedWith) pose = 'block';
  else if (speed > 0.6) pose = runPose(e.animPhase + e.player.id * 0.29);
  else pose = 'idle';

  // Prefer the generated hand-drawn animation frame when a sheet is present;
  // otherwise use the procedural sprite (default until art is dropped in).
  const sprite =
    (playersReady() && getPlayerFrame(pose, e.player.id, scheme.primary, scheme.secondary, px)) ||
    getSprite(scheme, pose, px);
  // facing: only commit a new direction when clearly moving, so idle players
  // don't rapidly flip (spin) on tiny physics jitter
  if (Math.abs(e.vy) > 1.2) e.faceRight = e.vy > 0;
  const faceRight = e.faceRight;

  const cx = sx(cam, e.y);
  const cy = sy(cam, e.x);
  const w = sprite.width;
  const h = sprite.height;
  // running bounce: bob the body, keep the shadow planted
  const speedNow = Math.hypot(e.vx, e.vy);
  const bob = pose.startsWith('run') ? runBob(e.animPhase + e.player.id * 0.29) * (h / SPRITE_GRID.h) : 0;
  ctx.save();
  // shadow squashes slightly as the body rises
  const squash = 1 - (bob / h) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.46, w * 0.40 * Math.max(0.7, squash), h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(cx, cy - bob);
  // subtle forward lean at speed
  if (speedNow > 4 && pose.startsWith('run')) {
    ctx.rotate((faceRight ? 1 : -1) * Math.min(0.1, speedNow * 0.011));
  }
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

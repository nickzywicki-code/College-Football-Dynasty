// Arcade game screen: canvas + HUD overlays + touch input.

import { useEffect, useRef, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { ArcadeGame, HudState } from '../../game/arcade';
import { Camera, render, updateCamera } from '../../game/render';
import { DEF_CALLS, OFFENSIVE_PLAYS } from '../../game/playbook';
import { applyGameResult } from '../../engine/sim/seasonSim';

export function GameScreen() {
  const league = useLeague();
  const nav = useStore((s) => s.nav);
  const back = useStore((s) => s.back);
  const touch = useStore((s) => s.touch);
  const persist = useStore((s) => s.persist);
  const gameId = nav[nav.length - 1].params?.gameId ?? -1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ArcadeGame | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [confirmSim, setConfirmSim] = useState(false);
  const appliedRef = useRef(false);

  // create engine once
  useEffect(() => {
    const g = league.schedule.find((x) => x.id === gameId);
    if (!g || g.played) return;
    const engine = new ArcadeGame(league, g);
    gameRef.current = engine;
    engine.onHud(setHud);
    engine.onEnded(() => {
      if (appliedRef.current) return;
      appliedRef.current = true;
      const box = engine.buildBoxScore();
      applyGameResult(league, g, box, []);
      touch();
      persist();
    });

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const cam: Camera = { l: 30, w: 10, scale: 10 };
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const wrap = wrapRef.current;
      if (wrap) {
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        engine.tick(dt);
        updateCamera(cam, engine, w, h, dt);
        render(ctx, engine, cam, w, h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // joystick: any touch drag on the canvas steers the carrier
    let touchStart: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent | MouseEvent) => {
      const pt = 'touches' in e ? e.touches[0] : e;
      touchStart = { x: pt.clientX, y: pt.clientY };
    };
    const onMove = (e: TouchEvent | MouseEvent) => {
      if (!touchStart) return;
      const pt = 'touches' in e ? e.touches[0] : e;
      // landscape mapping: drag right = downfield (+engine.y),
      // drag down-screen = toward the bottom sideline (+engine.x)
      const lenDir = (pt.clientX - touchStart.x) / 40;
      const widDir = (pt.clientY - touchStart.y) / 40;
      const mag = Math.hypot(lenDir, widDir);
      const capped = Math.min(1, mag);
      engine.setStick(mag > 0 ? (widDir / mag) * capped : 0, mag > 0 ? (lenDir / mag) * capped : 0);
      if ('touches' in e) e.preventDefault();
    };
    const onEnd = () => {
      touchStart = null;
      engine.setStick(0, 0);
    };
    const el = canvas;
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('mousedown', onStart);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const engine = gameRef.current;
  const g = league.schedule.find((x) => x.id === gameId);
  if (!g || (g.played && !engine)) {
    return (
      <div className="screen">
        <p className="empty">This game has already been played.</p>
        <button className="btn" onClick={back}>
          Back
        </button>
      </div>
    );
  }

  const fmtClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="screen no-pad">
      <div className="gamewrap" ref={wrapRef}>
        <canvas ref={canvasRef} />

        {hud && (
          <div className="hud-top">
            <span>
              {hud.userAbbr} {hud.userScore}
            </span>
            <span className="clock">
              Q{hud.quarter} {fmtClock(hud.clock)}
              <br />
              <span className="downdist">
                {hud.phase === 'cpu' || hud.phase === 'defcall'
                  ? `${hud.cpuAbbr} ball · ${nth(hud.down)} & ${hud.toGo}`
                  : hud.userHasBall
                    ? `${nth(hud.down)} & ${hud.toGo} · ${hud.yardsToGoal} to goal`
                    : ''}
              </span>
            </span>
            <span>
              {hud.cpuAbbr} {hud.cpuScore}
            </span>
          </div>
        )}

        {/* banner */}
        {hud?.banner && (
          <div className="banner">
            <div className="big">{hud.banner.big}</div>
            {hud.banner.small && <div className="small">{hud.banner.small}</div>}
          </div>
        )}

        {/* play call overlay */}
        {hud?.phase === 'playcall' && engine && (
          <div className="playcall">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b>
                {nth(hud.down)} & {hud.toGo} — {hud.yardsToGoal} yds to goal
              </b>
              <button className="btn secondary small" onClick={() => setConfirmSim(true)}>
                Sim ▸
              </button>
            </div>
            {hud.lastPlayText && (
              <p style={{ color: 'var(--dim)', fontSize: '0.75rem', marginTop: 6 }}>{hud.lastPlayText}</p>
            )}
            <h3>Runs</h3>
            <div className="playgrid">
              {OFFENSIVE_PLAYS.filter((p) => p.type === 'run').map((p) => (
                <button key={p.id} onClick={() => engine.callPlay(p)}>
                  <div className="pname">{p.name}</div>
                  <div className="pdesc">{p.desc}</div>
                </button>
              ))}
            </div>
            <h3>Passes</h3>
            <div className="playgrid">
              {OFFENSIVE_PLAYS.filter((p) => p.type === 'pass').map((p) => (
                <button key={p.id} onClick={() => engine.callPlay(p)}>
                  <div className="pname">{p.name}</div>
                  <div className="pdesc">{p.desc}</div>
                </button>
              ))}
            </div>
            {hud.down === 4 && (
              <>
                <h3>Special Teams</h3>
                <div className="playgrid">
                  <button onClick={() => engine.callFieldGoal()}>
                    <div className="pname">🥅 Field Goal</div>
                    <div className="pdesc">{hud.yardsToGoal + 17} yard attempt</div>
                  </button>
                  <button onClick={() => engine.callPunt()}>
                    <div className="pname">🦵 Punt</div>
                    <div className="pdesc">Flip the field</div>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* defensive call overlay */}
        {hud?.phase === 'defcall' && engine && (
          <div className="playcall">
            <b>
              {hud.cpuAbbr} has the ball — {nth(hud.down)} & {hud.toGo}
            </b>
            {hud.lastPlayText && (
              <p style={{ color: 'var(--dim)', fontSize: '0.75rem', marginTop: 6 }}>{hud.lastPlayText}</p>
            )}
            <h3>Call Your Defense</h3>
            <div className="playgrid">
              {DEF_CALLS.map((d) => (
                <button key={d.id} onClick={() => engine.callDefense(d.id)}>
                  <div className="pname">{d.name}</div>
                  <div className="pdesc">{d.desc}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn secondary" onClick={() => setConfirmSim(true)}>
                Sim Rest of Game ▸
              </button>
            </div>
          </div>
        )}

        {/* CPU drive skip */}
        {hud?.phase === 'cpu' && engine && (
          <div className="gamebtns">
            <button className="act" onClick={() => engine.skipCpuDrive()}>
              SKIP
              <br />
              DRIVE
            </button>
          </div>
        )}
        {hud?.phase === 'cpu' && hud.lastPlayText && (
          <div style={{ position: 'absolute', bottom: 90, left: 12, right: 90, zIndex: 3 }}>
            <p
              style={{
                background: 'rgba(4,10,7,0.8)',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: '0.78rem',
              }}
            >
              {hud.lastPlayText}
            </p>
          </div>
        )}

        {/* pre-snap */}
        {hud?.phase === 'presnap' && engine && (
          <div className="gamebtns">
            <button className="act" style={{ background: 'var(--accent)', color: '#06130b' }} onClick={() => engine.snap()}>
              SNAP
            </button>
          </div>
        )}

        {/* live: receiver buttons + juke */}
        {hud?.phase === 'live' && engine && (
          <>
            {hud.receivers.length > 0 && (
              <div className="recv-btns">
                {hud.receivers.map((r) => (
                  <button key={r.slot} onClick={() => engine.throwTo(r.slot)}>
                    {r.slot.startsWith('WR') ? r.slot.replace('WR', 'W') : r.slot}
                  </button>
                ))}
              </div>
            )}
            {hud.canJuke && hud.receivers.length === 0 && (
              <div className="gamebtns">
                <button className="act" onClick={() => engine.juke()}>
                  JUKE
                </button>
              </div>
            )}
          </>
        )}

        {/* PAT choice */}
        {hud?.phase === 'patchoice' && engine && (
          <div className="playcall" style={{ justifyContent: 'center' }}>
            <h3 style={{ textAlign: 'center' }}>Touchdown! Choose your try:</h3>
            <div className="playgrid">
              <button onClick={() => engine.choosePat('xp')}>
                <div className="pname">Kick XP</div>
                <div className="pdesc">+1, kick meter</div>
              </button>
              <button onClick={() => engine.choosePat('two')}>
                <div className="pname">Go for 2</div>
                <div className="pdesc">+2, one play from the 2</div>
              </button>
            </div>
          </div>
        )}

        {/* kick meter */}
        {hud?.meter && engine && (
          <>
            <div className="kickmeter">
              <div
                className="zone"
                style={{ left: `${hud.meter.zoneLo * 100}%`, width: `${(hud.meter.zoneHi - hud.meter.zoneLo) * 100}%` }}
              />
              <div className="needle" style={{ left: `${hud.meter.value * 100}%` }} />
            </div>
            <div className="gamebtns">
              <button className="act" style={{ background: 'var(--accent2)', color: '#241a02' }} onClick={() => engine.kickNow()}>
                KICK
              </button>
            </div>
          </>
        )}

        {/* game over */}
        {hud?.gameOver && (
          <div className="playcall" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div className="banner" style={{ position: 'static' }}>
              <div className="big">FINAL</div>
              <div className="small">
                {hud.userAbbr} {hud.userScore} — {hud.cpuAbbr} {hud.cpuScore}
              </div>
            </div>
            <p style={{ margin: '14px 0', fontSize: '1rem' }}>{hud.finalMsg}</p>
            <button className="btn" onClick={back}>
              Continue ➡️
            </button>
          </div>
        )}

        {/* sim confirm */}
        {confirmSim && engine && (
          <div className="playcall" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <h3>Sim the rest of this game?</h3>
            <div className="btnrow">
              <button className="btn secondary" onClick={() => setConfirmSim(false)}>
                Keep Playing
              </button>
              <button
                className="btn warn"
                onClick={() => {
                  setConfirmSim(false);
                  engine.simRestOfGame();
                }}
              >
                Sim to Final
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function nth(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : '4th';
}

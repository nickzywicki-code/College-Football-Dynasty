// Shared UI building blocks.

import React, { useEffect, useRef } from 'react';
import type { Player, Team } from '../engine/types';
import { useStore } from '../store/store';
import { getTeamLogo, LogoTeam } from '../game/logos';
import { getSprite, getHeadshot, skinFor, hairFor, SPRITE_GRID, HEADSHOT_GRID, Pose } from '../game/sprites';

export function ovrClass(o: number): string {
  if (o >= 88) return 'ovr elite';
  if (o >= 80) return 'ovr great';
  if (o >= 72) return 'ovr good';
  if (o >= 62) return 'ovr ok';
  return 'ovr bad';
}

export function TeamLogo({ team, size = 28 }: { team: LogoTeam; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const logo = getTeamLogo(team, Math.round(size * dpr));
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(logo, 0, 0, cv.width, cv.height);
  }, [team, size, dpr]);
  return (
    <canvas
      ref={ref}
      width={Math.round(size * dpr)}
      height={Math.round(size * dpr)}
      style={{ width: size, height: size, imageRendering: 'pixelated', flexShrink: 0 }}
      aria-label={`${team.abbr} logo`}
    />
  );
}

export function TeamDot({ team, size = 28 }: { team: Team; size?: number }) {
  return <TeamLogo team={team} size={size} />;
}

/** An 8-bit Madden-style helmet headshot in the team's colors. */
export function PlayerHeadshot({
  player,
  colors,
  size = 72,
}: {
  player: Player;
  colors: [string, string];
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const px = Math.max(1, Math.round((size * dpr) / HEADSHOT_GRID.h));
    const shot = getHeadshot({ primary: colors[0], secondary: colors[1], skin: skinFor(player.id) }, px, hairFor(player.id));
    const ox = Math.round((cv.width - shot.width) / 2);
    const oy = Math.round((cv.height - shot.height) / 2);
    ctx.drawImage(shot, ox, oy);
  }, [player.id, colors, size, dpr]);
  return (
    <canvas
      ref={ref}
      width={Math.round(size * dpr)}
      height={Math.round(size * dpr)}
      style={{ width: size, height: size, imageRendering: 'pixelated', flexShrink: 0, borderRadius: 6 }}
      aria-label="player headshot"
    />
  );
}

/** A pixel-art player model in the team's colors (idle pose by default). */
export function PlayerModel({
  player,
  colors,
  size = 72,
  pose = 'idle',
}: {
  player: Player;
  colors: [string, string];
  size?: number;
  pose?: Pose;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const px = Math.max(1, Math.round((size * dpr) / SPRITE_GRID.h));
    const sprite = getSprite(
      { primary: colors[0], secondary: colors[1], skin: skinFor(player.id) },
      pose,
      px,
    );
    // center the sprite in the square canvas
    const ox = Math.round((cv.width - sprite.width) / 2);
    const oy = Math.round((cv.height - sprite.height) / 2);
    ctx.drawImage(sprite, ox, oy);
  }, [player.id, colors, size, pose, dpr]);
  return (
    <canvas
      ref={ref}
      width={Math.round(size * dpr)}
      height={Math.round(size * dpr)}
      style={{ width: size, height: size, imageRendering: 'pixelated', flexShrink: 0 }}
      aria-label="player model"
    />
  );
}

export function TopBar({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  const goBack = useStore((s) => s.back);
  return (
    <div className="topbar">
      {back && (
        <button className="backbtn" onClick={goBack} aria-label="Back">
          ‹
        </button>
      )}
      <h1>
        {title}
        {sub && (
          <>
            {' '}
            <span className="sub">{sub}</span>
          </>
        )}
      </h1>
    </div>
  );
}

export function RatingBar({ label, value }: { label: string; value: number }) {
  const hue = Math.round((value / 99) * 120);
  return (
    <div className="ratingbar">
      <span className="lbl">{label}</span>
      <div className="track">
        <div className="fill" style={{ width: `${value}%`, background: `hsl(${hue} 65% 45%)` }} />
      </div>
      <span className="val">{value}</span>
    </div>
  );
}

export function PlayerRow({
  p,
  right,
  onClick,
  avatarColors,
}: {
  p: Player;
  right?: React.ReactNode;
  onClick?: () => void;
  avatarColors?: [string, string];
}) {
  return (
    <div className="list-item" onClick={onClick}>
      {avatarColors ? (
        <PlayerHeadshot player={p} colors={avatarColors} size={40} />
      ) : (
        <span className="pos-badge">{p.pos}</span>
      )}
      <div className="grow">
        <div className="name">
          {p.firstName} {p.lastName}
          {p.injuryWeeks > 0 && <span style={{ color: 'var(--danger)' }}> ✚{p.injuryWeeks}w</span>}
        </div>
        <div className="meta">
          {p.age} yrs · {p.contract ? `$${p.contract.salary}M × ${p.contract.yearsLeft}yr` : 'No contract'}
        </div>
      </div>
      {right ?? <span className={ovrClass(p.overall)}>{p.overall}</span>}
    </div>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.key} className={value === o.key ? 'active' : ''} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

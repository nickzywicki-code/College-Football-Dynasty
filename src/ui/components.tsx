// Shared UI building blocks.

import React from 'react';
import type { Player, Team } from '../engine/types';
import { useStore } from '../store/store';

export function ovrClass(o: number): string {
  if (o >= 88) return 'ovr elite';
  if (o >= 80) return 'ovr great';
  if (o >= 72) return 'ovr good';
  if (o >= 62) return 'ovr ok';
  return 'ovr bad';
}

export function TeamDot({ team, size }: { team: Team; size?: number }) {
  return (
    <div
      className="teamdot"
      style={{
        background: team.colors[0],
        color: '#fff',
        width: size,
        height: size,
        fontSize: size ? size * 0.28 : undefined,
      }}
    >
      {team.abbr}
    </div>
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
}: {
  p: Player;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="list-item" onClick={onClick}>
      <span className="pos-badge">{p.pos}</span>
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

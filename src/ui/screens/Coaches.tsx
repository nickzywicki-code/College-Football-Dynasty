// Coaching staff: head coach + coordinators with levels, XP, and unlocks.

import { useLeague, useStore } from '../../store/store';
import { TopBar } from '../components';
import { xpForNext, coachPerk } from '../../engine/franchise/coaches';
import type { Coach } from '../../engine/types';

function CoachCard({ coach }: { coach: Coach }) {
  const need = xpForNext(coach.level);
  const pct = coach.level >= 10 ? 100 : Math.min(100, Math.round((coach.xp / need) * 100));
  const roleName = coach.role === 'HC' ? 'Head Coach' : coach.role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';
  const icon = coach.role === 'HC' ? '👔' : coach.role === 'OC' ? '🎯' : '🛡️';
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: '1.6rem' }}>{icon}</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{coach.name}</div>
            <div style={{ color: 'var(--dim)', fontSize: '0.75rem' }}>{roleName} · {coach.archetype}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'PixelDisplay, monospace', color: 'var(--gold)', fontSize: '0.9rem' }}>LV {coach.level}</div>
        </div>
      </div>
      <div className="ratingbar" style={{ marginTop: 12 }}>
        <span className="lbl">XP</span>
        <div className="track">
          <div className="fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
        <span className="val">{coach.level >= 10 ? 'MAX' : `${coach.xp}/${need}`}</span>
      </div>
      <p style={{ fontSize: '0.76rem', color: 'var(--dim)', marginTop: 10 }}>{coachPerk(coach)}</p>
    </div>
  );
}

export function Coaches() {
  const league = useLeague();
  useStore((s) => s.rev);
  const team = league.teams[league.userTeamId];
  const staff = team.coaches;

  return (
    <>
      <TopBar title="Coaching Staff" sub={`${team.abbr} · earn XP by playing games`} back />
      <div className="screen">
        <div className="card">
          <p style={{ fontSize: '0.82rem', color: 'var(--dim)', margin: 0 }}>
            Your staff earns XP every game — more for wins, points scored, and stops. Leveling your
            coordinators unlocks new playbook concepts and defensive schemes you can call in-game.
          </p>
        </div>
        {staff ? (
          <div className="cardgrid">
            <CoachCard coach={staff.hc} />
            <CoachCard coach={staff.oc} />
            <CoachCard coach={staff.dc} />
          </div>
        ) : (
          <div className="card"><p className="empty">No staff on this save.</p></div>
        )}
      </div>
    </>
  );
}

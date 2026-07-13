// Title screen: continue/load saves + start a new league.

import { useEffect, useState } from 'react';
import { TEAM_IDENTITIES } from '../../engine/names';
import { useStore } from '../../store/store';
import { deleteSave, listSaves, loadLeague, SaveMeta } from '../../store/db';
import { TeamLogo } from '../components';

export function Title() {
  const newLeague = useStore((s) => s.newLeague);
  const setLeague = useStore((s) => s.setLeague);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [picking, setPicking] = useState(false);
  const [teamIdx, setTeamIdx] = useState<number | null>(null);

  const refresh = () => void listSaves().then(setSaves);
  useEffect(refresh, []);

  const load = async (slot: number) => {
    const league = await loadLeague(slot);
    if (league) setLeague(league, slot);
  };

  if (picking) {
    return (
      <div className="screen">
        <div className="title-hero" style={{ padding: '22px 0 14px' }}>
          <h1>Choose Your Team</h1>
          <p>You'll be the GM and head coach.</p>
        </div>
        <div className="teamgrid">
          {TEAM_IDENTITIES.map((t, i) => (
            <button
              key={t.abbr}
              className={teamIdx === i ? 'selected' : ''}
              onClick={() => setTeamIdx(i)}
            >
              <TeamLogo team={t} size={40} />
              <span>
                {t.city}
                <br />
                {t.name}
              </span>
            </button>
          ))}
        </div>
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setPicking(false)}>
            Back
          </button>
          <button className="btn" disabled={teamIdx === null} onClick={() => newLeague(teamIdx!)}>
            Start League
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen title-wrap">
      <div className="title-hero">
        <div className="logo">🏈</div>
        <h1>GRIDIRON LAND</h1>
        <p>Playable football. Deep franchise. Your dynasty.</p>
      </div>

      {saves.length > 0 && (
        <div className="card">
          <h2>Continue</h2>
          {saves.map((s) => (
            <div key={s.slot} className="list-item" onClick={() => void load(s.slot)}>
              <div className="grow">
                <div className="name">{s.teamName}</div>
                <div className="meta">
                  Season {s.season} · Week {s.week} · {s.record} · {s.phase}
                </div>
              </div>
              <button
                className="btn danger small"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteSave(s.slot).then(refresh);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="btn" onClick={() => setPicking(true)}>
        🏆 New Franchise
      </button>
      <p className="empty">
        32 fictional teams · full seasons, playoffs & draft · playable arcade games
      </p>
      <p className="empty" style={{ padding: '4px 10px', fontSize: '0.62rem', opacity: 0.55 }}>
        build {__BUILD_TAG__}
      </p>
    </div>
  );
}

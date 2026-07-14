// Team roster with position filtering, depth order, and management actions.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { PlayerRow, Seg, TopBar } from '../components';
import { POSITIONS, Position, teamName } from '../../engine/types';
import { teamPayroll } from '../../engine/league';
import { capRoom } from '../../engine/franchise/contracts';

type Filter = 'ALL' | 'OFF' | 'DEF' | 'ST';

const GROUPS: Record<Filter, Position[]> = {
  ALL: POSITIONS,
  OFF: ['QB', 'RB', 'WR', 'TE', 'OL'],
  DEF: ['DL', 'LB', 'CB', 'S'],
  ST: ['K', 'P'],
};

export function Roster() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const [filter, setFilter] = useState<Filter>('ALL');

  const team = league.teams[league.userTeamId];

  return (
    <>
      <TopBar
        title={`${teamName(team)} Roster`}
        sub={`$${teamPayroll(team, league.players)}M · $${capRoom(league, team)}M room`}
      />
      <div className="screen">
        <Seg<Filter>
          options={[
            { key: 'ALL', label: 'All' },
            { key: 'OFF', label: 'Offense' },
            { key: 'DEF', label: 'Defense' },
            { key: 'ST', label: 'Kicking' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="btnrow" style={{ marginTop: 0, marginBottom: 12 }}>
          <button className="btn secondary small" onClick={() => navigate('trade')}>
            🔁 Trade Center
          </button>
          <button className="btn secondary small" onClick={() => navigate('coaches')}>
            🎓 Coaching Staff
          </button>
        </div>
        <div className="cardgrid">
        {GROUPS[filter].map((pos) => {
          const ids = team.depthChart[pos];
          if (!ids.length) return null;
          return (
            <div className="card" key={pos}>
              <h2>{pos}</h2>
              {ids.map((id, depth) => {
                const p = league.players[id];
                if (!p) return null;
                return (
                  <PlayerRow
                    key={id}
                    p={p}
                    avatarColors={team.colors}
                    onClick={() => navigate('player', { playerId: id })}
                    right={
                      <span className="row" style={{ gap: 6 }}>
                        {depth === 0 && <span style={{ fontSize: '0.65rem', color: 'var(--accent2)' }}>★</span>}
                        <span className={`ovr ${p.overall >= 88 ? 'elite' : p.overall >= 80 ? 'great' : p.overall >= 72 ? 'good' : p.overall >= 62 ? 'ok' : 'bad'}`}>
                          {p.overall}
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </div>
          );
        })}
        </div>
      </div>
    </>
  );
}

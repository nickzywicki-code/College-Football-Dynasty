// League standings by division + playoff seeds.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TeamDot, TopBar } from '../components';
import { conferenceSeeds, divisionStandings, winPct } from '../../engine/sim/seasonSim';
import { CONFERENCE_NAMES, DIVISION_NAMES } from '../../engine/names';

export function Standings() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const [conf, setConf] = useState<'0' | '1'>('0');
  const c = Number(conf);

  return (
    <>
      <TopBar title="Standings" sub={`Season ${league.season}`} />
      <div className="screen">
        <Seg<'0' | '1'>
          options={[
            { key: '0', label: CONFERENCE_NAMES[0] },
            { key: '1', label: CONFERENCE_NAMES[1] },
          ]}
          value={conf}
          onChange={setConf}
        />
        {[0, 1, 2, 3].map((d) => (
          <div className="card" key={d}>
            <h2>
              {CONFERENCE_NAMES[c]} {DIVISION_NAMES[d]}
            </h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>T</th>
                  <th>PCT</th>
                  <th>PF</th>
                  <th>PA</th>
                </tr>
              </thead>
              <tbody>
                {divisionStandings(league, c, d).map((t) => (
                  <tr key={t.id} className={t.id === league.userTeamId ? 'me' : ''}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <TeamDot team={t} size={20} />
                        {t.abbr}
                      </span>
                    </td>
                    <td>{t.wins}</td>
                    <td>{t.losses}</td>
                    <td>{t.ties}</td>
                    <td>{winPct(t).toFixed(3).replace(/^0/, '')}</td>
                    <td>{t.ptsFor}</td>
                    <td>{t.ptsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="card">
          <h2>Playoff Seeds — {CONFERENCE_NAMES[c]}</h2>
          {conferenceSeeds(league, c).map((t, i) => (
            <div key={t.id} className="list-item" style={{ cursor: 'default' }}>
              <span style={{ width: 20, color: 'var(--dim)', fontWeight: 700 }}>{i + 1}</span>
              <TeamDot team={t} size={24} />
              <div className="grow name" style={{ fontSize: '0.85rem' }}>
                {t.city} {t.name}
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--dim)' }}>
                {t.wins}-{t.losses}
                {t.ties ? `-${t.ties}` : ''}
              </span>
            </div>
          ))}
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => navigate('history')}>
            🏆 League History ›
          </button>
        </div>
      </div>
    </>
  );
}

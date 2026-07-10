// League stat leaders by category.

import { useMemo, useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TopBar } from '../components';
import type { Player, SeasonStats } from '../../engine/types';

type Cat = 'pass' | 'rush' | 'rec' | 'def' | 'kick';

interface LeaderDef {
  label: string;
  cols: { h: string; get: (s: SeasonStats) => string | number }[];
  sort: (s: SeasonStats) => number;
  filter?: (p: Player, s: SeasonStats) => boolean;
}

const CATS: Record<Cat, LeaderDef> = {
  pass: {
    label: 'Passing',
    cols: [
      { h: 'YDS', get: (s) => s.passYds },
      { h: 'TD', get: (s) => s.passTd },
      { h: 'INT', get: (s) => s.passInt },
      { h: 'CMP%', get: (s) => (s.passAtt ? `${((s.passCmp / s.passAtt) * 100).toFixed(1)}` : '0') },
    ],
    sort: (s) => s.passYds,
    filter: (_p, s) => s.passAtt > 40,
  },
  rush: {
    label: 'Rushing',
    cols: [
      { h: 'ATT', get: (s) => s.rushAtt },
      { h: 'YDS', get: (s) => s.rushYds },
      { h: 'TD', get: (s) => s.rushTd },
      { h: 'AVG', get: (s) => (s.rushAtt ? (s.rushYds / s.rushAtt).toFixed(1) : '0') },
    ],
    sort: (s) => s.rushYds,
  },
  rec: {
    label: 'Receiving',
    cols: [
      { h: 'REC', get: (s) => s.rec },
      { h: 'YDS', get: (s) => s.recYds },
      { h: 'TD', get: (s) => s.recTd },
    ],
    sort: (s) => s.recYds,
  },
  def: {
    label: 'Defense',
    cols: [
      { h: 'TKL', get: (s) => s.tackles },
      { h: 'SACK', get: (s) => s.sacks },
      { h: 'INT', get: (s) => s.defInt },
    ],
    sort: (s) => s.tackles * 0.5 + s.sacks * 4 + s.defInt * 5,
  },
  kick: {
    label: 'Kicking',
    cols: [
      { h: 'FG', get: (s) => `${s.fgm}/${s.fga}` },
      { h: 'LONG', get: (s) => s.fgLong },
      { h: 'XP', get: (s) => `${s.xpm}/${s.xpa}` },
    ],
    sort: (s) => s.fgm * 3 + s.xpm,
    filter: (_p, s) => s.fga > 0,
  },
};

export function StatsScreen() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const [cat, setCat] = useState<Cat>('pass');

  const leaders = useMemo(() => {
    const def = CATS[cat];
    const rows: { p: Player; s: SeasonStats }[] = [];
    for (const p of Object.values(league.players)) {
      const s = p.stats.find((x) => x.season === league.season);
      if (!s || s.gamesPlayed === 0) continue;
      if (def.filter && !def.filter(p, s)) continue;
      rows.push({ p, s });
    }
    rows.sort((a, b) => def.sort(b.s) - def.sort(a.s));
    return rows.slice(0, 25);
  }, [league, cat, league.week]);

  const def = CATS[cat];

  return (
    <>
      <TopBar title="Stat Leaders" sub={`Season ${league.season}`} />
      <div className="screen">
        <Seg<Cat>
          options={(Object.keys(CATS) as Cat[]).map((k) => ({ key: k, label: CATS[k].label }))}
          value={cat}
          onChange={setCat}
        />
        <div className="card">
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Player</th>
                  {def.cols.map((c) => (
                    <th key={c.h}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leaders.map(({ p, s }) => (
                  <tr
                    key={p.id}
                    className={p.teamId === league.userTeamId ? 'me' : ''}
                    onClick={() => navigate('player', { playerId: p.id })}
                  >
                    <td>
                      {p.pos} {p.firstName[0]}. {p.lastName}{' '}
                      <span style={{ color: 'var(--dim)' }}>{s.teamAbbr}</span>
                    </td>
                    {def.cols.map((c) => (
                      <td key={c.h}>{c.get(s)}</td>
                    ))}
                  </tr>
                ))}
                {leaders.length === 0 && (
                  <tr>
                    <td colSpan={def.cols.length + 1} className="empty">
                      No qualified players yet — play some games!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

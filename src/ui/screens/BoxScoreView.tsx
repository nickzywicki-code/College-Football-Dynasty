// Box score: quarter line, team totals, player stat groups, play-by-play.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TeamDot, TopBar } from '../components';
import type { BoxScore, GameStatLine, Team } from '../../engine/types';

function StatGroup({
  title,
  lines,
  cols,
  playerName,
  onTap,
}: {
  title: string;
  lines: GameStatLine[];
  cols: { h: string; get: (l: GameStatLine) => string | number }[];
  playerName: (id: number) => string;
  onTap: (id: number) => void;
}) {
  if (!lines.length) return null;
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Player</th>
              {cols.map((c) => (
                <th key={c.h}>{c.h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.playerId} onClick={() => onTap(l.playerId)}>
                <td>{playerName(l.playerId)}</td>
                {cols.map((c) => (
                  <td key={c.h}>{c.get(l)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamStats({ box, side, team }: { box: BoxScore; side: 'home' | 'away'; team: Team }) {
  const league = useLeague();
  const navigate = useStore((s) => s.navigate);
  const stats = side === 'home' ? box.homeStats : box.awayStats;
  const name = (id: number) => {
    const p = league.players[id];
    return p ? `${p.pos} ${p.firstName[0]}. ${p.lastName}` : '—';
  };
  const tap = (id: number) => navigate('player', { playerId: id });

  const passers = stats.filter((l) => (l.passAtt ?? 0) > 0);
  const rushers = stats
    .filter((l) => (l.rushAtt ?? 0) > 0)
    .sort((a, b) => (b.rushYds ?? 0) - (a.rushYds ?? 0));
  const receivers = stats
    .filter((l) => (l.targets ?? 0) > 0)
    .sort((a, b) => (b.recYds ?? 0) - (a.recYds ?? 0));
  const defenders = stats
    .filter((l) => (l.tackles ?? 0) > 0 || (l.sacks ?? 0) > 0 || (l.defInt ?? 0) > 0)
    .sort((a, b) => (b.tackles ?? 0) - (a.tackles ?? 0))
    .slice(0, 8);
  const kickers = stats.filter((l) => (l.fga ?? 0) > 0 || (l.xpa ?? 0) > 0);

  return (
    <>
      <div className="card">
        <h2>{team.abbr} Team Totals</h2>
        {(() => {
          const t = side === 'home' ? box.homeTeamTotals : box.awayTeamTotals;
          const rows: [string, string][] = [
            ['Total Yards', `${t.totalYds}`],
            ['Passing / Rushing', `${t.passYds} / ${t.rushYds}`],
            ['First Downs', `${t.firstDowns}`],
            ['3rd Down', `${t.thirdDownConv}/${t.thirdDownAtt}`],
            ['Turnovers', `${t.turnovers}`],
            ['Possession', `${Math.floor(t.timeOfPossession / 60)}:${String(Math.floor(t.timeOfPossession % 60)).padStart(2, '0')}`],
          ];
          return rows.map(([k, v]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
              <span style={{ color: 'var(--dim)', fontSize: '0.8rem' }}>{k}</span>
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{v}</span>
            </div>
          ));
        })()}
      </div>
      <StatGroup
        title="Passing"
        lines={passers}
        playerName={name}
        onTap={tap}
        cols={[
          { h: 'C/A', get: (l) => `${l.passCmp ?? 0}/${l.passAtt ?? 0}` },
          { h: 'YDS', get: (l) => l.passYds ?? 0 },
          { h: 'TD', get: (l) => l.passTd ?? 0 },
          { h: 'INT', get: (l) => l.passInt ?? 0 },
        ]}
      />
      <StatGroup
        title="Rushing"
        lines={rushers}
        playerName={name}
        onTap={tap}
        cols={[
          { h: 'ATT', get: (l) => l.rushAtt ?? 0 },
          { h: 'YDS', get: (l) => l.rushYds ?? 0 },
          { h: 'TD', get: (l) => l.rushTd ?? 0 },
        ]}
      />
      <StatGroup
        title="Receiving"
        lines={receivers}
        playerName={name}
        onTap={tap}
        cols={[
          { h: 'REC', get: (l) => `${l.rec ?? 0}/${l.targets ?? 0}` },
          { h: 'YDS', get: (l) => l.recYds ?? 0 },
          { h: 'TD', get: (l) => l.recTd ?? 0 },
        ]}
      />
      <StatGroup
        title="Defense"
        lines={defenders}
        playerName={name}
        onTap={tap}
        cols={[
          { h: 'TKL', get: (l) => l.tackles ?? 0 },
          { h: 'SACK', get: (l) => l.sacks ?? 0 },
          { h: 'INT', get: (l) => l.defInt ?? 0 },
        ]}
      />
      <StatGroup
        title="Kicking"
        lines={kickers}
        playerName={name}
        onTap={tap}
        cols={[
          { h: 'FG', get: (l) => `${l.fgm ?? 0}/${l.fga ?? 0}` },
          { h: 'XP', get: (l) => `${l.xpm ?? 0}/${l.xpa ?? 0}` },
        ]}
      />
    </>
  );
}

export function BoxScoreView() {
  const league = useLeague();
  const nav = useStore((s) => s.nav);
  const gameId = nav[nav.length - 1].params?.gameId ?? -1;
  const box = league.boxScores[gameId];
  const [tab, setTab] = useState<'away' | 'home' | 'plays'>('away');

  if (!box) {
    return (
      <>
        <TopBar title="Box Score" back />
        <div className="screen empty">Box score unavailable (game from a previous season).</div>
      </>
    );
  }
  const home = league.teams[box.homeId];
  const away = league.teams[box.awayId];

  return (
    <>
      <TopBar title={`${away.abbr} ${box.awayScore} @ ${home.abbr} ${box.homeScore}`} sub={`Week ${box.week}`} back />
      <div className="screen">
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>1</th>
                <th>2</th>
                <th>3</th>
                <th>4</th>
                <th>T</th>
              </tr>
            </thead>
            <tbody>
              {(['away', 'home'] as const).map((side) => {
                const t = side === 'home' ? home : away;
                const qs = box.quarterScores[side === 'home' ? 0 : 1];
                const total = side === 'home' ? box.homeScore : box.awayScore;
                return (
                  <tr key={side}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <TeamDot team={t} size={20} /> {t.abbr}
                      </span>
                    </td>
                    {[0, 1, 2, 3].map((q) => (
                      <td key={q}>{qs[q] ?? 0}</td>
                    ))}
                    <td style={{ fontWeight: 800 }}>{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Seg<'away' | 'home' | 'plays'>
          options={[
            { key: 'away', label: away.abbr },
            { key: 'home', label: home.abbr },
            { key: 'plays', label: 'Plays' },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab !== 'plays' && <TeamStats box={box} side={tab} team={tab === 'home' ? home : away} />}
        {tab === 'plays' && (
          <div className="card news">
            <h2>{box.playByPlay.length > 40 ? 'Play by Play' : 'Key Plays'}</h2>
            {box.playByPlay.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
            {box.playByPlay.length === 0 && <p className="empty">No log kept for this game.</p>}
          </div>
        )}
      </div>
    </>
  );
}

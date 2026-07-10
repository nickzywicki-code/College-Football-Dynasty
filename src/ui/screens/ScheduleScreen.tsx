// Schedule: my team's season or full league week-by-week.

import { useState } from 'react';
import { useLeague, useStore } from '../../store/store';
import { Seg, TeamDot, TopBar } from '../components';
import { REGULAR_SEASON_WEEKS } from '../../engine/types';

export function ScheduleScreen() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const [mode, setMode] = useState<'mine' | 'week'>('mine');
  const [week, setWeek] = useState(league.week);

  const team = league.teams[league.userTeamId];
  const myGames = league.schedule
    .filter((g) => g.homeId === team.id || g.awayId === team.id)
    .sort((a, b) => a.week - b.week);
  const weekGames = league.schedule.filter((g) => g.week === week);
  const maxWeek = Math.max(...league.schedule.map((g) => g.week));

  const renderGame = (g: (typeof league.schedule)[number], showWeek: boolean) => {
    const home = league.teams[g.homeId];
    const away = league.teams[g.awayId];
    const mine = g.homeId === team.id || g.awayId === team.id;
    let result = '';
    if (g.played && mine) {
      const myScore = g.homeId === team.id ? g.homeScore : g.awayScore;
      const oppScore = g.homeId === team.id ? g.awayScore : g.homeScore;
      result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'T';
    }
    return (
      <div
        key={g.id}
        className="scorebox"
        onClick={() => g.played && navigate('boxscore', { gameId: g.id })}
        style={mine && mode === 'week' ? { background: 'var(--card2)', borderRadius: 8 } : undefined}
      >
        <div className="team">
          {showWeek && (
            <span style={{ color: 'var(--dim)', fontSize: '0.68rem', width: 30 }}>
              {g.tag || `W${g.week}`}
            </span>
          )}
          <TeamDot team={away} size={24} />
          <span style={{ fontSize: '0.8rem' }}>{away.abbr}</span>
          <span className="pts">{g.played ? g.awayScore : ''}</span>
        </div>
        <span style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>
          {g.played ? (result || 'F') : '@'}
        </span>
        <div className="team" style={{ justifyContent: 'flex-end' }}>
          <span className="pts">{g.played ? g.homeScore : ''}</span>
          <span style={{ fontSize: '0.8rem' }}>{home.abbr}</span>
          <TeamDot team={home} size={24} />
        </div>
      </div>
    );
  };

  return (
    <>
      <TopBar title="Schedule" sub={`Season ${league.season}`} back />
      <div className="screen">
        <Seg<'mine' | 'week'>
          options={[
            { key: 'mine', label: 'My Season' },
            { key: 'week', label: 'By Week' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'mine' && (
          <div className="card">
            {myGames.length === 0 && <p className="empty">No games scheduled.</p>}
            {myGames.map((g) => renderGame(g, true))}
          </div>
        )}
        {mode === 'week' && (
          <>
            <div className="seg" style={{ overflowX: 'auto' }}>
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => (
                <button
                  key={w}
                  className={week === w ? 'active' : ''}
                  style={{ minWidth: 44, flex: '0 0 auto' }}
                  onClick={() => setWeek(w)}
                >
                  {w <= REGULAR_SEASON_WEEKS ? `W${w}` : 'PO'}
                </button>
              ))}
            </div>
            <div className="card">
              {weekGames.length === 0 && <p className="empty">No games this week.</p>}
              {weekGames.map((g) => renderGame(g, false))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

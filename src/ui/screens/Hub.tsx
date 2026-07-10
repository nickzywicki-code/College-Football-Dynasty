// Franchise hub: phase-aware home screen with next game, advance, news.

import { useLeague, useStore } from '../../store/store';
import { TeamDot, TopBar } from '../components';
import { gamesForWeek, userGameForWeek, weekComplete, conferenceSeeds } from '../../engine/sim/seasonSim';
import { teamPayroll, teamOverall } from '../../engine/league';
import { REGULAR_SEASON_WEEKS, teamName } from '../../engine/types';
import { CONFERENCE_NAMES } from '../../engine/names';

function phaseLabel(phase: string, week: number): string {
  switch (phase) {
    case 'regularSeason':
      return `Week ${week}`;
    case 'playoffs':
      return 'Playoffs';
    case 'offseason':
      return 'Offseason';
    case 'draft':
      return 'Draft';
    case 'freeAgency':
      return 'Free Agency';
    default:
      return phase;
  }
}

export function Hub() {
  const league = useLeague();
  useStore((s) => s.rev);
  const navigate = useStore((s) => s.navigate);
  const simRestOfWeek = useStore((s) => s.simRestOfWeek);
  const simUserGame = useStore((s) => s.simUserGame);
  const advance = useStore((s) => s.advance);
  const continueOffseason = useStore((s) => s.continueOffseason);

  const team = league.teams[league.userTeamId];
  const inSeason = league.phase === 'regularSeason' || league.phase === 'playoffs';
  const myGame = inSeason ? userGameForWeek(league, league.week) : null;
  const weekDone = inSeason && weekComplete(league);
  const opp = myGame ? league.teams[myGame.homeId === team.id ? myGame.awayId : myGame.homeId] : null;

  const playoffAlive =
    league.phase !== 'playoffs' ||
    league.playoffTeams.includes(team.id) === false ||
    myGame !== null;
  void playoffAlive;

  return (
    <>
      <TopBar title={teamName(team)} sub={`S${league.season} · ${phaseLabel(league.phase, league.week)}`} />
      <div className="screen"><div className="cardgrid">
        <div className="card">
          <div className="row">
            <TeamDot team={team} size={46} />
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                {team.wins}-{team.losses}
                {team.ties ? `-${team.ties}` : ''}
              </div>
              <div className="meta" style={{ color: 'var(--dim)', fontSize: '0.78rem' }}>
                Team OVR {teamOverall(team, league.players)} · Payroll ${teamPayroll(team, league.players)}M / $
                {league.salaryCap}M
              </div>
            </div>
          </div>
        </div>

        {inSeason && myGame && !myGame.played && opp && (
          <div className="card">
            <h2>
              {league.phase === 'playoffs' ? `Playoffs — ${myGame.tag}` : `Week ${league.week} Matchup`}
            </h2>
            <div className="row" style={{ justifyContent: 'center', gap: 18, padding: '6px 0 12px' }}>
              <div style={{ textAlign: 'center' }}>
                <TeamDot team={league.teams[myGame.awayId]} size={44} />
                <div style={{ fontSize: '0.7rem', marginTop: 4 }}>{league.teams[myGame.awayId].abbr}</div>
              </div>
              <span style={{ color: 'var(--dim)', fontWeight: 700 }}>@</span>
              <div style={{ textAlign: 'center' }}>
                <TeamDot team={league.teams[myGame.homeId]} size={44} />
                <div style={{ fontSize: '0.7rem', marginTop: 4 }}>{league.teams[myGame.homeId].abbr}</div>
              </div>
            </div>
            <button className="btn" onClick={() => navigate('game', { gameId: myGame.id })}>
              🎮 Play Game
            </button>
            <div className="btnrow">
              <button className="btn secondary" onClick={simUserGame}>
                Quick Sim My Game
              </button>
            </div>
          </div>
        )}

        {inSeason && myGame?.played && (
          <div className="card">
            <h2>Final</h2>
            <div
              className="list-item"
              onClick={() => navigate('boxscore', { gameId: myGame.id })}
              style={{ borderBottom: 'none' }}
            >
              <div className="grow">
                <div className="name">
                  {league.teams[myGame.awayId].abbr} {myGame.awayScore} @ {league.teams[myGame.homeId].abbr}{' '}
                  {myGame.homeScore}
                </div>
                <div className="meta">Tap for box score</div>
              </div>
              <span
                style={{
                  fontWeight: 800,
                  color:
                    (myGame.homeId === team.id) === myGame.homeScore > myGame.awayScore &&
                    myGame.homeScore !== myGame.awayScore
                      ? 'var(--accent)'
                      : 'var(--danger)',
                }}
              >
                {myGame.homeScore === myGame.awayScore
                  ? 'T'
                  : (myGame.homeId === team.id) === myGame.homeScore > myGame.awayScore
                    ? 'W'
                    : 'L'}
              </span>
            </div>
          </div>
        )}

        {inSeason && (
          <div className="card">
            <h2>League Week</h2>
            {!weekDone ? (
              <button className="btn warn" onClick={() => simRestOfWeek(false)}>
                ⏩ {myGame && !myGame.played ? 'Sim Full Week' : 'Sim Rest of Week'}
              </button>
            ) : (
              <button className="btn" onClick={advance}>
                {league.phase === 'regularSeason' && league.week >= REGULAR_SEASON_WEEKS
                  ? '🏆 Start Playoffs'
                  : '➡️ Advance to Next Week'}
              </button>
            )}
            <div style={{ marginTop: 12 }}>
              {gamesForWeek(league, league.week)
                .slice(0, 6)
                .map((g) => (
                  <div
                    key={g.id}
                    className="scorebox"
                    onClick={() => g.played && navigate('boxscore', { gameId: g.id })}
                  >
                    <div className="team">
                      <TeamDot team={league.teams[g.awayId]} size={24} />
                      <span style={{ fontSize: '0.8rem' }}>{league.teams[g.awayId].abbr}</span>
                      <span className="pts">{g.played ? g.awayScore : ''}</span>
                    </div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>{g.played ? 'F' : '@'}</span>
                    <div className="team" style={{ justifyContent: 'flex-end' }}>
                      <span className="pts">{g.played ? g.homeScore : ''}</span>
                      <span style={{ fontSize: '0.8rem' }}>{league.teams[g.homeId].abbr}</span>
                      <TeamDot team={league.teams[g.homeId]} size={24} />
                    </div>
                  </div>
                ))}
              <button className="btn secondary small" style={{ marginTop: 10 }} onClick={() => navigate('schedule')}>
                Full schedule ›
              </button>
            </div>
          </div>
        )}

        {league.phase === 'offseason' && (
          <div className="card">
            <h2>Season {league.season} Complete</h2>
            {league.history.find((h) => h.season === league.season) ? null : (
              <p style={{ fontSize: '0.85rem', color: 'var(--dim)', marginBottom: 10 }}>
                The champion has been crowned. Time for awards, retirements, player development — then the draft.
              </p>
            )}
            <button className="btn" onClick={continueOffseason}>
              🏅 Continue to Offseason
            </button>
            <div className="btnrow">
              <button className="btn secondary" onClick={() => navigate('history')}>
                Season History
              </button>
            </div>
          </div>
        )}

        {league.phase === 'draft' && (
          <div className="card">
            <h2>Draft Day</h2>
            <button className="btn" onClick={() => navigate('draft')}>
              📋 Enter Draft Room
            </button>
          </div>
        )}

        {league.phase === 'freeAgency' && (
          <div className="card">
            <h2>Free Agency — Day {Math.min(league.freeAgency?.day ?? 1, 7)}</h2>
            <button className="btn" onClick={() => navigate('freeAgency')}>
              💰 Open Free Agency
            </button>
          </div>
        )}

        {league.phase === 'playoffs' && !myGame && (
          <div className="card">
            <h2>Playoff Picture</h2>
            <p style={{ fontSize: '0.83rem', color: 'var(--dim)' }}>
              {league.playoffTeams.includes(team.id)
                ? 'You have a bye or your run has ended — sim the league forward.'
                : 'Your season is over. Watch the playoffs play out.'}
            </p>
            {[0, 1].map((c) => (
              <p key={c} style={{ fontSize: '0.78rem', marginTop: 6, color: 'var(--dim)' }}>
                <b style={{ color: 'var(--text)' }}>{CONFERENCE_NAMES[c]}:</b>{' '}
                {conferenceSeeds(league, c)
                  .map((t) => t.abbr)
                  .join(' · ')}
              </p>
            ))}
          </div>
        )}

        <div className="card news">
          <h2>League News</h2>
          {league.news.slice(0, 8).map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      </div></div>
    </>
  );
}

import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import { Button, Card, Pill, SectionTitle } from '../components/Basics'
import { TeamCrest } from '../layout/TopBar'

export function HomeHub() {
  const navigate = useNavigate()
  const dynasty = useGameStore((s) => s.dynasty)
  const currentUserGame = useGameStore((s) => s.currentUserGame())
  const advanceWeekNoUserGame = useGameStore((s) => s.advanceWeekNoUserGame)
  if (!dynasty) return null

  const team = dynasty.teams[dynasty.userTeamId]
  const opponentId = currentUserGame
    ? (currentUserGame.homeTeamId === dynasty.userTeamId ? currentUserGame.awayTeamId : currentUserGame.homeTeamId)
    : null
  const opponent = opponentId ? dynasty.teams[opponentId] : null
  const isHome = currentUserGame?.homeTeamId === dynasty.userTeamId

  return (
    <div className="flex flex-col gap-4 py-2">
      {dynasty.pendingJobOffers.length > 0 && (
        <Card className="border-gold-500/60 bg-gold-500/5">
          <SectionTitle>Coaching Carousel</SectionTitle>
          <p className="text-sm text-parchment-200/80 mb-2">You have {dynasty.pendingJobOffers.length} job offer(s) waiting.</p>
          <Button variant="secondary" onClick={() => navigate('/coach')} className="w-full">Review Offers</Button>
        </Card>
      )}

      {dynasty.phase === 'offseason' && (
        <Card className="border-gold-500/60 bg-gold-500/5">
          <SectionTitle>Offseason</SectionTitle>
          <p className="text-sm text-parchment-200/80 mb-2">The season has ended. Manage the program before kicking off {dynasty.year + 1}.</p>
          <Button onClick={() => navigate('/offseason')} className="w-full">Go to Offseason Hub</Button>
        </Card>
      )}

      {dynasty.phase !== 'offseason' && (
        <Card>
          <SectionTitle>{dynasty.phase === 'postseason' ? 'Postseason' : `Week ${dynasty.week}`}</SectionTitle>
          {currentUserGame && opponent ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamCrest primary={opponent.colors.primary} secondary={opponent.colors.secondary} abbr={opponent.abbr} size={44} />
                  <div>
                    <p className="font-display text-base text-parchment-100">{isHome ? 'vs' : '@'} {opponent.name} {opponent.mascot}</p>
                    <p className="text-xs text-parchment-200/60">
                      {opponent.wins}-{opponent.losses}{opponent.rank ? ` · #${opponent.rank}` : ''} · Prestige {opponent.prestige}
                      {currentUserGame.bowlName ? ` · ${currentUserGame.bowlName}` : currentUserGame.isPlayoff ? ' · Playoff' : ''}
                    </p>
                  </div>
                </div>
                {currentUserGame.isConference && <Pill tone="warn">Conf</Pill>}
              </div>
              <Button onClick={() => navigate('/game')} className="w-full py-3">Play the Game</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-parchment-200/70">
                {dynasty.phase === 'postseason' ? 'No game this round — sit back and watch the results roll in.' : 'Bye week. Use the time to recruit and refine your game plan.'}
              </p>
              <Button variant="secondary" onClick={advanceWeekNoUserGame} className="w-full">Advance to Next Week</Button>
            </div>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle>Program Snapshot</SectionTitle>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Record" value={`${team.wins}-${team.losses}`} />
          <Stat label="Rank" value={team.rank ? `#${team.rank}` : 'NR'} />
          <Stat label="Prestige" value={String(team.prestige)} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <QuickLink label="Depth Chart" onClick={() => navigate('/roster')} />
        <QuickLink label="Recruiting Board" onClick={() => navigate('/recruiting')} />
        <QuickLink label="Game Plan" onClick={() => navigate('/gameplan')} />
        <QuickLink label="Standings" onClick={() => navigate('/schedule')} />
        <QuickLink label="Coach Career" onClick={() => navigate('/coach')} />
        <QuickLink label={`Team: ${team.name}`} onClick={() => navigate(`/team/${team.id}`)} />
      </div>

      <div>
        <SectionTitle>Around the League</SectionTitle>
        <div className="flex flex-col gap-2">
          {dynasty.news.slice(0, 8).map((n) => (
            <Card key={n.id} className="!p-3">
              <p className="text-sm text-parchment-100 font-medium">{n.headline}</p>
              <p className="text-xs text-parchment-200/60 mt-0.5">{n.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-lg text-parchment-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-parchment-200/50">{label}</p>
    </div>
  )
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-4 text-left font-display text-sm text-parchment-100 hover:border-gold-600/50">
      {label}
    </button>
  )
}

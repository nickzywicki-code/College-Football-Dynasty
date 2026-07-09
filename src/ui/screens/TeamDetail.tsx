import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import { fullName } from '../../engine/player'
import { Card, OverallBadge, Pill, SectionTitle, Stars } from '../components/Basics'
import { TeamCrest } from '../layout/TopBar'

export function TeamDetail() {
  const { teamId } = useParams()
  const dynasty = useGameStore((s) => s.dynasty)
  const navigate = useNavigate()
  if (!dynasty || !teamId) return null
  const team = dynasty.teams[teamId]
  if (!team) return <p className="text-center text-parchment-200/60 py-10">Team not found.</p>

  const conf = dynasty.conferences.find((c) => c.id === team.conferenceId)
  const topPlayers = team.rosterIds
    .map((id) => dynasty.players[id])
    .filter(Boolean)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 10)

  return (
    <div className="flex flex-col gap-4 py-2">
      <button onClick={() => navigate(-1)} className="text-xs text-parchment-200/60">&larr; Back</button>

      <Card className="!p-4" style={{ borderColor: team.colors.primary }}>
        <div className="flex items-center gap-3">
          <TeamCrest primary={team.colors.primary} secondary={team.colors.secondary} abbr={team.abbr} size={52} />
          <div className="flex-1">
            <p className="font-display text-lg text-parchment-100">{team.name} {team.mascot}</p>
            <p className="text-xs text-parchment-200/60">{conf?.name} · Coach {team.headCoachName}</p>
          </div>
          {team.rank && <Pill tone="gold">#{team.rank}</Pill>}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <Stat label="Record" value={`${team.wins}-${team.losses}`} />
          <Stat label="Conf" value={`${team.confWins}-${team.confLosses}`} />
          <Stat label="Prestige" value={String(team.prestige)} />
          <Stat label="PF-PA" value={`${team.pointsFor}-${team.pointsAgainst}`} />
        </div>
      </Card>

      <div>
        <SectionTitle>Top Players</SectionTitle>
        <div className="flex flex-col gap-1.5">
          {topPlayers.map((p) => (
            <Card key={p.id} className="!p-2.5 flex items-center gap-3">
              <span className="text-[11px] w-8 text-parchment-200/50">{p.position}</span>
              <div className="flex-1">
                <p className="text-sm text-parchment-100">{fullName(p)}</p>
                <p className="text-[11px] text-parchment-200/60 flex items-center gap-1.5">
                  <span>{p.classYear}</span><Stars count={p.stars} />
                </p>
              </div>
              <OverallBadge value={p.overall} />
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
      <p className="font-display text-sm text-parchment-100">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-parchment-200/50">{label}</p>
    </div>
  )
}

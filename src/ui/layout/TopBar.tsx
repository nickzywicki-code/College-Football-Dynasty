import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'

export function TopBar() {
  const dynasty = useGameStore((s) => s.dynasty)
  const navigate = useNavigate()
  if (!dynasty) return null
  const team = dynasty.teams[dynasty.userTeamId]
  if (!team) return null

  const phaseLabel = dynasty.phase === 'regular' ? `Week ${dynasty.week}`
    : dynasty.phase === 'postseason' ? `Postseason Wk ${dynasty.week}`
    : dynasty.phase === 'offseason' ? 'Offseason'
    : dynasty.phase

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-700 px-4 py-3 backdrop-blur"
      style={{ background: `linear-gradient(135deg, ${team.colors.primary}dd, var(--color-ink-900))` }}
    >
      <button onClick={() => navigate('/hub')} className="flex items-center gap-2 text-left">
        <TeamCrest primary={team.colors.primary} secondary={team.colors.secondary} abbr={team.abbr} />
        <div>
          <p className="font-display text-sm leading-tight text-parchment-100">{team.name} {team.mascot}</p>
          <p className="text-[11px] text-parchment-200/70">{team.wins}-{team.losses} · {phaseLabel} · {dynasty.year}</p>
        </div>
      </button>
      {team.rank && team.rank <= 25 && (
        <div className="font-display text-xs text-gold-400 border border-gold-600/40 rounded-full px-2 py-1">#{team.rank}</div>
      )}
    </header>
  )
}

export function TeamCrest({ primary, secondary, abbr, size = 36 }: { primary: string; secondary: string; abbr: string; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full font-display shrink-0 border"
      style={{ width: size, height: size, background: primary, color: secondary, borderColor: secondary, fontSize: size * 0.32 }}
    >
      {abbr.slice(0, 3)}
    </span>
  )
}

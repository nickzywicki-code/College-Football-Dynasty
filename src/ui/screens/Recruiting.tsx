import { useMemo, useState } from 'react'
import { useGameStore } from '../../state/store'
import { POSITIONS, type Position, type Recruit } from '../../state/types'
import { RECRUIT_ACTION_COSTS } from '../../engine/recruiting'
import { Button, Card, Pill, SectionTitle, Stars } from '../components/Basics'

export function Recruiting() {
  const dynasty = useGameStore((s) => s.dynasty)
  const scoutRecruit = useGameStore((s) => s.scoutRecruit)
  const contactRecruit = useGameStore((s) => s.contactRecruit)
  const offerRecruit = useGameStore((s) => s.offerRecruit)
  const visitRecruit = useGameStore((s) => s.visitRecruit)
  const [filter, setFilter] = useState<Position | 'ALL' | 'BOARD'>('ALL')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!dynasty) return null
  const board = dynasty.recruitingBoard
  const userTeamId = dynasty.userTeamId

  const list = useMemo(() => {
    let recruits = board.recruits.filter((r) => !r.signed)
    if (filter === 'BOARD') recruits = recruits.filter((r) => r.offers.includes(userTeamId) || r.committedTeamId === userTeamId)
    else if (filter !== 'ALL') recruits = recruits.filter((r) => r.position === filter)
    return recruits
      .sort((a, b) => (b.interest[userTeamId] ?? 0) - (a.interest[userTeamId] ?? 0) || b.stars - a.stars)
      .slice(0, 60)
  }, [board.recruits, filter, userTeamId])

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-parchment-100">Recruiting</h1>
        <Pill tone="gold">{board.weeklyPoints} pts</Pill>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(['ALL', 'BOARD', ...POSITIONS] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-display border ${
              filter === f ? 'border-gold-500 text-gold-400 bg-gold-500/10' : 'border-ink-700 text-parchment-200/60'
            }`}
          >
            {f === 'BOARD' ? 'My Board' : f}
          </button>
        ))}
      </div>

      <SectionTitle right={<span className="text-xs text-parchment-200/50">{list.length} shown</span>}>Prospects</SectionTitle>

      <div className="flex flex-col gap-2">
        {list.map((r) => (
          <RecruitCard
            key={r.id}
            recruit={r}
            userTeamId={userTeamId}
            weeklyPoints={board.weeklyPoints}
            expanded={expandedId === r.id}
            onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
            onScout={() => scoutRecruit(r.id)}
            onContact={() => contactRecruit(r.id)}
            onOffer={() => offerRecruit(r.id)}
            onVisit={() => visitRecruit(r.id)}
          />
        ))}
        {list.length === 0 && <p className="text-sm text-parchment-200/50 text-center py-8">No prospects match this filter.</p>}
      </div>
    </div>
  )
}

function RecruitCard({
  recruit, userTeamId, weeklyPoints, expanded, onToggle, onScout, onContact, onOffer, onVisit,
}: {
  recruit: Recruit
  userTeamId: string
  weeklyPoints: number
  expanded: boolean
  onToggle: () => void
  onScout: () => void
  onContact: () => void
  onOffer: () => void
  onVisit: () => void
}) {
  const interest = Math.round(recruit.interest[userTeamId] ?? 0)
  const scouted = recruit.scouted[userTeamId] ?? 0
  const offered = recruit.offers.includes(userTeamId)
  const committed = recruit.committedTeamId === userTeamId
  const overallDisplay = scouted >= 40 ? recruit.overall : '??'

  return (
    <Card className="!p-3">
      <button className="flex w-full items-center gap-3 text-left" onClick={onToggle}>
        <div className="flex-1">
          <p className="text-sm font-medium text-parchment-100">{recruit.firstName} {recruit.lastName}</p>
          <p className="text-[11px] text-parchment-200/60 flex items-center gap-1.5">
            <span>{recruit.position}</span><Stars count={recruit.stars} /><span>{recruit.homeState}</span>
          </p>
        </div>
        <span className="font-display text-lg text-parchment-100/80">{overallDisplay}</span>
        {committed && <Pill tone="good">Committed</Pill>}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3 border-t border-ink-700 pt-3">
          <div>
            <div className="flex items-center justify-between text-xs text-parchment-200/70 mb-1">
              <span>Interest in you</span><span className="tabular-nums text-parchment-100">{interest}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-ink-700 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-glow" style={{ width: `${interest}%` }} />
            </div>
          </div>
          <p className="text-[11px] text-parchment-200/60">
            Priorities: {recruit.priority} / {recruit.secondaryPriority} · {recruit.offers.length} offer(s)
          </p>
          {!committed && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={weeklyPoints < RECRUIT_ACTION_COSTS.scout} onClick={onScout}>
                Scout ({RECRUIT_ACTION_COSTS.scout})
              </Button>
              <Button variant="secondary" disabled={weeklyPoints < RECRUIT_ACTION_COSTS.contact} onClick={onContact}>
                Contact ({RECRUIT_ACTION_COSTS.contact})
              </Button>
              <Button variant={offered ? 'ghost' : 'primary'} disabled={weeklyPoints < RECRUIT_ACTION_COSTS.offer && !offered} onClick={onOffer}>
                {offered ? 'Offered' : `Offer (${RECRUIT_ACTION_COSTS.offer})`}
              </Button>
              <Button variant="secondary" disabled={weeklyPoints < RECRUIT_ACTION_COSTS.hostVisit} onClick={onVisit}>
                Host Visit ({RECRUIT_ACTION_COSTS.hostVisit})
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

import { useState } from 'react'
import { useGameStore } from '../../state/store'
import { POSITIONS, STARTER_SLOTS, type Player, type Position } from '../../state/types'
import { fullName } from '../../engine/player'
import { Button, Card, OverallBadge, Pill, SectionTitle, Stars, StatBar } from '../components/Basics'

const KEY_RATINGS: Record<Position, (keyof Player['ratings'])[]> = {
  QB: ['throwing', 'awareness', 'speed'],
  RB: ['speed', 'agility', 'blocking'],
  WR: ['catching', 'speed', 'agility'],
  TE: ['catching', 'blocking', 'speed'],
  OL: ['blocking', 'strength', 'awareness'],
  DL: ['passRush', 'strength', 'tackling'],
  LB: ['tackling', 'coverage', 'passRush'],
  CB: ['coverage', 'speed', 'awareness'],
  S: ['coverage', 'tackling', 'speed'],
  K: ['kicking', 'awareness'],
  P: ['kicking', 'awareness'],
}

export function Roster() {
  const dynasty = useGameStore((s) => s.dynasty)
  const setDepthChartOrder = useGameStore((s) => s.setDepthChartOrder)
  const autoOptimizeDepthChart = useGameStore((s) => s.autoOptimizeDepthChart)
  const [position, setPosition] = useState<Position>('QB')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!dynasty) return null
  const team = dynasty.teams[dynasty.userTeamId]
  const order = team.depthChart[position] ?? []
  const players = order.map((id) => dynasty.players[id]).filter(Boolean) as Player[]
  const starterCount = STARTER_SLOTS[position]

  function move(idx: number, dir: -1 | 1) {
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setDepthChartOrder(position, next)
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-parchment-100">Roster</h1>
        <Button variant="secondary" onClick={autoOptimizeDepthChart}>Auto-Set Best XI</Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-display border ${
              position === p ? 'border-gold-500 text-gold-400 bg-gold-500/10' : 'border-ink-700 text-parchment-200/60'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <SectionTitle right={<span className="text-xs text-parchment-200/50">{players.length} on roster</span>}>
        {position} Depth Chart
      </SectionTitle>

      <div className="flex flex-col gap-2">
        {players.map((p, idx) => (
          <Card key={p.id} className="!p-3">
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1 w-6">
                <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-parchment-200/50 disabled:opacity-20">▲</button>
                <button disabled={idx === players.length - 1} onClick={() => move(idx, 1)} className="text-parchment-200/50 disabled:opacity-20">▼</button>
              </div>

              <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                <div className={`flex h-9 w-9 items-center justify-center rounded-md font-display text-xs shrink-0 ${idx < starterCount ? 'bg-gold-500/20 text-gold-400' : 'bg-ink-700 text-parchment-200/50'}`}>
                  {idx < starterCount ? 'ST' : idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-parchment-100">{fullName(p)}</p>
                  <p className="text-[11px] text-parchment-200/60 flex items-center gap-1.5">
                    <span>{p.classYear}</span><Stars count={p.stars} /><span>{p.devTrait}</span>
                  </p>
                </div>
                <OverallBadge value={p.overall} />
              </button>
            </div>

            {expandedId === p.id && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-ink-700 pt-3">
                {KEY_RATINGS[position].map((key) => (
                  <StatBar key={key} label={ratingLabel(key)} value={p.ratings[key]} />
                ))}
                <div className="flex items-center justify-between mt-1 text-[11px] text-parchment-200/60">
                  <span>Potential {p.potential}</span>
                  <span>From {p.homeState}</span>
                  {p.injuryWeeksLeft > 0 ? <Pill tone="bad">Injured {p.injuryWeeksLeft}wk</Pill> : <Pill tone="good">Healthy</Pill>}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function ratingLabel(key: keyof Player['ratings']): string {
  const labels: Record<string, string> = {
    speed: 'Speed', strength: 'Strength', agility: 'Agility', awareness: 'Awareness',
    throwing: 'Throwing', catching: 'Catching', blocking: 'Blocking', passRush: 'Pass Rush',
    coverage: 'Coverage', tackling: 'Tackling', kicking: 'Kicking',
  }
  return labels[key] ?? key
}

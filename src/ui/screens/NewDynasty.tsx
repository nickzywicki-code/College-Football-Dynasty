import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import { generateWorld } from '../../engine/world'
import { makeSeed } from '../../engine/rng'
import type { CoachArchetype } from '../../state/types'
import { Button, Card, Pill } from '../components/Basics'
import { TeamCrest } from '../layout/TopBar'

const ARCHETYPES: { id: CoachArchetype; label: string; blurb: string }[] = [
  { id: 'Recruiter', label: 'Recruiter', blurb: '+Recruiting pull, faster class turnaround.' },
  { id: 'Strategist', label: 'Strategist', blurb: '+Game plan effectiveness on both sides of the ball.' },
  { id: 'Motivator', label: 'Motivator', blurb: '+Player morale, fewer upset losses.' },
  { id: 'Developer', label: 'Developer', blurb: '+Player development speed each offseason.' },
]

export function NewDynasty() {
  const navigate = useNavigate()
  const newDynasty = useGameStore((s) => s.newDynasty)
  const [seed] = useState(() => makeSeed())
  const world = useMemo(() => generateWorld(seed), [seed])

  const [step, setStep] = useState<'coach' | 'team'>('coach')
  const [coachName, setCoachName] = useState('')
  const [alma, setAlma] = useState('')
  const [archetype, setArchetype] = useState<CoachArchetype>('Recruiter')
  const [confId, setConfId] = useState(world.conferences[0]?.id ?? '')
  const [teamId, setTeamId] = useState<string | null>(null)

  const teamsInConf = world.conferences.find((c) => c.id === confId)?.teamIds.map((id) => world.teams[id]) ?? []

  function begin() {
    if (!teamId) return
    newDynasty({ coachName: coachName.trim() || 'Coach', alma: alma.trim() || 'State University', archetype, teamId, seed, world })
    navigate('/hub')
  }

  if (step === 'coach') {
    return (
      <div className="flex flex-col gap-5 py-4">
        <h1 className="font-display text-2xl text-parchment-100">Create Your Coach</h1>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-parchment-200/60">Coach Name</span>
          <input
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
            placeholder="e.g. Marcus Reyes"
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-parchment-100 outline-none focus:border-gold-500"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-parchment-200/60">Alma Mater (flavor only)</span>
          <input
            value={alma}
            onChange={(e) => setAlma(e.target.value)}
            placeholder="e.g. Redstone University"
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-parchment-100 outline-none focus:border-gold-500"
          />
        </label>

        <div>
          <p className="text-xs text-parchment-200/60 mb-2">Coaching Identity</p>
          <div className="grid grid-cols-2 gap-2">
            {ARCHETYPES.map((a) => (
              <button
                key={a.id}
                onClick={() => setArchetype(a.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  archetype === a.id ? 'border-gold-500 bg-gold-500/10' : 'border-ink-700 bg-ink-850'
                }`}
              >
                <p className="font-display text-sm text-parchment-100">{a.label}</p>
                <p className="text-[11px] text-parchment-200/60 mt-0.5">{a.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => setStep('team')} className="mt-2 w-full py-3">Choose Your Program</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <button onClick={() => setStep('coach')} className="text-xs text-parchment-200/60 mb-2">&larr; Back</button>
        <h1 className="font-display text-2xl text-parchment-100">Choose Your Program</h1>
        <p className="text-sm text-parchment-200/60 mt-1">Take over a blue-blood, or build a nobody into a champion.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {world.conferences.map((c) => (
          <button
            key={c.id}
            onClick={() => setConfId(c.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-display whitespace-nowrap border ${
              confId === c.id ? 'border-gold-500 text-gold-400 bg-gold-500/10' : 'border-ink-700 text-parchment-200/60'
            }`}
          >
            {c.abbr}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 pb-16">
        {teamsInConf.map((t) => (
          <Card
            key={t.id}
            className={`flex items-center gap-3 cursor-pointer ${teamId === t.id ? 'border-gold-500' : ''}`}
          >
            <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setTeamId(t.id)}>
              <TeamCrest primary={t.colors.primary} secondary={t.colors.secondary} abbr={t.abbr} />
              <div className="flex-1">
                <p className="font-display text-sm text-parchment-100">{t.name} {t.mascot}</p>
                <p className="text-[11px] text-parchment-200/60">Prestige {t.prestige} · Coach {t.headCoachName}</p>
              </div>
              {t.prestige >= 75 && <Pill tone="gold">Blue Blood</Pill>}
              {t.prestige < 40 && <Pill>Rebuild</Pill>}
            </button>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-2 pt-2 -mx-4 px-4 bg-gradient-to-t from-ink-900 via-ink-900 to-transparent">
        <Button onClick={begin} disabled={!teamId} className="w-full py-3">
          Sign the Contract
        </Button>
      </div>
    </div>
  )
}

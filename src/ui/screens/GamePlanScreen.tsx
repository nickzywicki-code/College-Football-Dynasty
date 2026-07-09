import { useGameStore } from '../../state/store'
import { DEFENSIVE_SCHEMES, OFFENSIVE_SCHEMES, type PracticeFocus } from '../../state/types'
import { Card, SectionTitle } from '../components/Basics'

const PRACTICE_FOCUS: PracticeFocus[] = ['Balanced', 'Offense', 'Defense', 'Conditioning', 'Discipline']

export function GamePlanScreen() {
  const dynasty = useGameStore((s) => s.dynasty)
  const updateGamePlan = useGameStore((s) => s.updateGamePlan)
  if (!dynasty) return null
  const team = dynasty.teams[dynasty.userTeamId]
  const plan = team.gamePlan

  return (
    <div className="flex flex-col gap-4 py-2">
      <h1 className="font-display text-xl text-parchment-100">Game Plan</h1>

      <Card>
        <SectionTitle>Offensive Scheme</SectionTitle>
        <ChipRow options={OFFENSIVE_SCHEMES} value={plan.offensiveScheme} onChange={(v) => updateGamePlan({ offensiveScheme: v })} />
      </Card>

      <Card>
        <SectionTitle>Defensive Scheme</SectionTitle>
        <ChipRow options={DEFENSIVE_SCHEMES} value={plan.defensiveScheme} onChange={(v) => updateGamePlan({ defensiveScheme: v })} />
      </Card>

      <Card>
        <SectionTitle>Play Calling</SectionTitle>
        <div className="flex flex-col gap-4">
          <Slider
            label="Run ↔ Pass Balance"
            value={plan.runPassBalance}
            leftLabel="Run Heavy" rightLabel="Pass Heavy"
            onChange={(v) => updateGamePlan({ runPassBalance: v })}
          />
          <Slider
            label="Tempo"
            value={plan.tempo}
            leftLabel="Methodical" rightLabel="Hurry-Up"
            onChange={(v) => updateGamePlan({ tempo: v })}
          />
          <Slider
            label="Aggressiveness"
            value={plan.aggressiveness}
            leftLabel="Conservative" rightLabel="Deep Shots / Blitz"
            onChange={(v) => updateGamePlan({ aggressiveness: v })}
          />
          <Slider
            label="4th Down Aggressiveness"
            value={plan.fourthDownAggressiveness}
            leftLabel="Always Punt/Kick" rightLabel="Always Go For It"
            onChange={(v) => updateGamePlan({ fourthDownAggressiveness: v })}
          />
        </div>
      </Card>

      <Card>
        <SectionTitle>Weekly Practice Focus</SectionTitle>
        <p className="text-xs text-parchment-200/60 mb-2">Shapes which players develop fastest during the offseason.</p>
        <ChipRow options={PRACTICE_FOCUS} value={plan.practiceFocus} onChange={(v) => updateGamePlan({ practiceFocus: v })} />
      </Card>
    </div>
  )
}

function ChipRow<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-full px-3 py-1.5 text-xs font-display border ${
            value === opt ? 'border-gold-500 text-gold-400 bg-gold-500/10' : 'border-ink-700 text-parchment-200/60'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, leftLabel, rightLabel, onChange }: {
  label: string; value: number; leftLabel: string; rightLabel: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-parchment-200/70 mb-1">
        <span>{label}</span>
        <span className="tabular-nums text-parchment-100">{value}</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-parchment-200/40 mt-0.5">
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
    </div>
  )
}

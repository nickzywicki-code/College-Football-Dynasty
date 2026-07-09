import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import type { Facilities } from '../../state/types'
import { Button, Card, Pill, SectionTitle } from '../components/Basics'

const FACILITY_LABELS: Record<keyof Facilities, string> = {
  stadium: 'Stadium', training: 'Training Center', academics: 'Academic Center', recruitingHub: 'Recruiting Hub',
}

export function Offseason() {
  const dynasty = useGameStore((s) => s.dynasty)
  const lastOffseasonReport = useGameStore((s) => s.lastOffseasonReport)
  const processOffseason = useGameStore((s) => s.processOffseason)
  const upgradeFacility = useGameStore((s) => s.upgradeFacility)
  const startNewSeason = useGameStore((s) => s.startNewSeason)
  const navigate = useNavigate()
  if (!dynasty) return null

  const team = dynasty.teams[dynasty.userTeamId]
  const processed = lastOffseasonReport !== null
  const hasOffers = dynasty.pendingJobOffers.length > 0

  return (
    <div className="flex flex-col gap-4 py-2">
      <h1 className="font-display text-xl text-parchment-100">Offseason — {dynasty.year}</h1>

      {!processed ? (
        <Card>
          <SectionTitle>Wrap Up the Season</SectionTitle>
          <p className="text-sm text-parchment-200/70 mb-3">
            Process graduation, the draft, signing day, and program growth. This locks in your final roster for {dynasty.year + 1}.
          </p>
          <Button onClick={processOffseason} className="w-full py-3">Run Offseason</Button>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Offseason Report</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm text-parchment-200/80">
            {lastOffseasonReport!.map((line, i) => <li key={i}>• {line}</li>)}
          </ul>
        </Card>
      )}

      {hasOffers && (
        <Card className="border-gold-500/60 bg-gold-500/5">
          <SectionTitle>Coaching Carousel</SectionTitle>
          <p className="text-sm text-parchment-200/70 mb-2">Resolve your job offers before kicking off next season.</p>
          <Button variant="secondary" onClick={() => navigate('/coach')} className="w-full">Review Offers</Button>
        </Card>
      )}

      {processed && (
        <Card>
          <SectionTitle right={<Pill tone="gold">${team.boosterFunds.toLocaleString()}</Pill>}>Facility Upgrades</SectionTitle>
          <div className="flex flex-col gap-2">
            {(Object.keys(FACILITY_LABELS) as (keyof Facilities)[]).map((key) => {
              const level = team.facilities[key]
              const cost = (level + 1) * 40000
              return (
                <div key={key} className="flex items-center justify-between rounded-lg border border-ink-700 px-3 py-2">
                  <div>
                    <p className="text-sm text-parchment-100">{FACILITY_LABELS[key]}</p>
                    <p className="text-[11px] text-parchment-200/60">Level {level} / 10</p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={level >= 10 || team.boosterFunds < cost}
                    onClick={() => upgradeFacility(key)}
                  >
                    Upgrade (${cost.toLocaleString()})
                  </Button>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {processed && (
        <Button onClick={() => { startNewSeason(); navigate('/hub') }} disabled={hasOffers} className="w-full py-3">
          {hasOffers ? 'Resolve Offers First' : `Start the ${dynasty.year + 1} Season`}
        </Button>
      )}
    </div>
  )
}

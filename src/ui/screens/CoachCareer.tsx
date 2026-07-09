import { useGameStore } from '../../state/store'
import { Button, Card, Pill, SectionTitle, StatBar } from '../components/Basics'

export function CoachCareer() {
  const dynasty = useGameStore((s) => s.dynasty)
  const acceptJobOffer = useGameStore((s) => s.acceptJobOffer)
  const declineJobOffers = useGameStore((s) => s.declineJobOffers)
  if (!dynasty) return null
  const coach = dynasty.coach

  return (
    <div className="flex flex-col gap-4 py-2">
      <h1 className="font-display text-xl text-parchment-100">{coach.name}</h1>
      <p className="text-sm text-parchment-200/60 -mt-3">{coach.archetype} · Alma mater: {coach.alma}</p>

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-display text-lg text-parchment-100">{coach.careerWins}-{coach.careerLosses}</p>
            <p className="text-[10px] uppercase tracking-wider text-parchment-200/50">Career Record</p>
          </div>
          <div>
            <p className="font-display text-lg text-parchment-100">{coach.history.filter((h) => h.nationalChampion).length}</p>
            <p className="text-[10px] uppercase tracking-wider text-parchment-200/50">Titles</p>
          </div>
          <div>
            <p className="font-display text-lg text-parchment-100">{coach.history.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-parchment-200/50">Seasons</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <StatBar label="Hot Seat" value={Math.round(coach.hotSeat)} />
          <StatBar label="Reputation" value={Math.round(coach.reputation)} />
        </div>
      </Card>

      {dynasty.pendingJobOffers.length > 0 && (
        <Card className="border-gold-500/60 bg-gold-500/5">
          <SectionTitle>Job Offers</SectionTitle>
          <div className="flex flex-col gap-2">
            {dynasty.pendingJobOffers.map((offer) => {
              const t = dynasty.teams[offer.teamId]
              if (!t) return null
              return (
                <div key={offer.teamId} className="flex items-center justify-between rounded-lg border border-ink-700 px-3 py-2">
                  <div>
                    <p className="text-sm text-parchment-100">{t.name} {t.mascot}</p>
                    <p className="text-[11px] text-parchment-200/60">Prestige {t.prestige}</p>
                  </div>
                  <Button onClick={() => acceptJobOffer(offer.teamId)}>Accept</Button>
                </div>
              )
            })}
            <Button variant="ghost" onClick={declineJobOffers}>Stay Put</Button>
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>Season History</SectionTitle>
        <div className="flex flex-col gap-1.5">
          {[...coach.history].reverse().map((h, i) => (
            <Card key={i} className="!p-2.5 flex items-center justify-between">
              <span className="text-sm text-parchment-100">{h.year} · {dynasty.teams[h.teamId]?.name ?? 'Unknown'}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-parchment-200/60">{h.wins}-{h.losses}</span>
                {h.nationalChampion && <Pill tone="gold">Champs</Pill>}
                {!h.nationalChampion && h.confChampion && <Pill tone="good">Conf Champ</Pill>}
                {!h.confChampion && h.madePlayoff && <Pill tone="warn">Playoff</Pill>}
              </div>
            </Card>
          ))}
          {coach.history.length === 0 && <p className="text-sm text-parchment-200/50 text-center py-6">No completed seasons yet.</p>}
        </div>
      </div>
    </div>
  )
}

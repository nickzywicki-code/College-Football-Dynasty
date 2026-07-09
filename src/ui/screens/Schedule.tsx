import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import { Card, Pill, SectionTitle } from '../components/Basics'

type Tab = 'schedule' | 'rankings' | 'standings'

export function Schedule() {
  const dynasty = useGameStore((s) => s.dynasty)
  const [tab, setTab] = useState<Tab>('schedule')
  const navigate = useNavigate()
  if (!dynasty) return null

  const userGames = dynasty.schedule
    .filter((g) => g.homeTeamId === dynasty.userTeamId || g.awayTeamId === dynasty.userTeamId)
    .sort((a, b) => a.week - b.week)

  return (
    <div className="flex flex-col gap-4 py-2">
      <h1 className="font-display text-xl text-parchment-100">Schedule & Standings</h1>

      <div className="flex gap-2">
        {(['schedule', 'rankings', 'standings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-display capitalize border ${
              tab === t ? 'border-gold-500 text-gold-400 bg-gold-500/10' : 'border-ink-700 text-parchment-200/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'schedule' && (
        <div className="flex flex-col gap-2">
          {userGames.map((g) => {
            const isHome = g.homeTeamId === dynasty.userTeamId
            const oppId = isHome ? g.awayTeamId : g.homeTeamId
            const opp = dynasty.teams[oppId]
            const userScore = isHome ? g.homeScore : g.awayScore
            const oppScore = isHome ? g.awayScore : g.homeScore
            const won = g.played && userScore > oppScore
            return (
              <Card key={g.id} className="!p-3 flex items-center justify-between">
                <button className="text-left" onClick={() => navigate(`/team/${oppId}`)}>
                  <p className="text-sm text-parchment-100">Wk {g.week} {isHome ? 'vs' : '@'} {opp?.name} {opp?.mascot}</p>
                  <p className="text-[11px] text-parchment-200/60">{g.bowlName ?? (g.isPlayoff ? 'Playoff' : g.isConference ? 'Conference' : 'Non-Conference')}</p>
                </button>
                {g.played ? (
                  <Pill tone={won ? 'good' : 'bad'}>{won ? 'W' : 'L'} {userScore}-{oppScore}</Pill>
                ) : (
                  <Pill>Upcoming</Pill>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'rankings' && (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>Top 25</SectionTitle>
          {dynasty.pollTop25.slice(0, 25).map((id, idx) => {
            const t = dynasty.teams[id]
            if (!t) return null
            return (
              <button key={id} onClick={() => navigate(`/team/${id}`)} className="w-full">
                <Card className={`!p-2.5 flex items-center gap-3 ${id === dynasty.userTeamId ? 'border-gold-500' : ''}`}>
                  <span className="font-display text-sm w-6 text-parchment-200/60">{idx + 1}</span>
                  <span className="flex-1 text-left text-sm text-parchment-100">{t.name} {t.mascot}</span>
                  <span className="text-xs text-parchment-200/60">{t.wins}-{t.losses}</span>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'standings' && (
        <div className="flex flex-col gap-4">
          {dynasty.conferences.map((conf) => (
            <div key={conf.id}>
              <SectionTitle>{conf.name}</SectionTitle>
              <div className="flex flex-col gap-1.5">
                {conf.teamIds
                  .map((id) => dynasty.teams[id])
                  .sort((a, b) => (b.confWins - b.confLosses) - (a.confWins - a.confLosses) || b.rankingScore - a.rankingScore)
                  .map((t) => (
                    <button key={t.id} onClick={() => navigate(`/team/${t.id}`)} className="w-full">
                      <Card className={`!p-2 flex items-center justify-between ${t.id === dynasty.userTeamId ? 'border-gold-500' : ''}`}>
                        <span className="text-sm text-parchment-100">{t.name} {t.mascot}</span>
                        <span className="text-xs text-parchment-200/60">{t.confWins}-{t.confLosses} ({t.wins}-{t.losses})</span>
                      </Card>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, type LiveGameView } from '../../state/store'
import { Button, Card } from '../components/Basics'
import { TeamCrest } from '../layout/TopBar'

export function GameSim() {
  const navigate = useNavigate()
  const dynasty = useGameStore((s) => s.dynasty)
  const liveGame = useGameStore((s) => s.liveGame)
  const startUserGame = useGameStore((s) => s.startUserGame)
  const revealPlays = useGameStore((s) => s.revealPlays)
  const revealAllPlays = useGameStore((s) => s.revealAllPlays)
  const commitUserGameAndAdvance = useGameStore((s) => s.commitUserGameAndAdvance)
  const [playing, setPlaying] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!liveGame) startUserGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!playing || !liveGame) return
    if (liveGame.revealIndex >= liveGame.playLog.length) { setPlaying(false); return }
    const t = setTimeout(() => revealPlays(1), 550)
    return () => clearTimeout(t)
  }, [playing, liveGame, revealPlays])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [liveGame?.revealIndex])

  if (!dynasty || !liveGame) {
    return <div className="py-10 text-center text-parchment-200/60">Warming up the offense…</div>
  }

  const home = dynasty.teams[liveGame.homeTeamId]
  const away = dynasty.teams[liveGame.awayTeamId]
  const done = liveGame.revealIndex >= liveGame.playLog.length
  const visibleLog = liveGame.playLog.slice(0, liveGame.revealIndex)

  return (
    <div className="flex flex-col gap-4 py-2">
      <Card className="!p-4">
        <div className="flex items-center justify-between">
          <TeamColumn team={away} score={done ? liveGame.awayScore : '–'} />
          <div className="flex flex-col items-center px-2">
            <p className="font-display text-[10px] tracking-widest text-parchment-200/40">{done ? 'FINAL' : 'LIVE'}</p>
            <p className="font-display text-xl text-parchment-100">@</p>
          </div>
          <TeamColumn team={home} score={done ? liveGame.homeScore : '–'} reverse />
        </div>
      </Card>

      <Card className="flex-1 !p-0 overflow-hidden">
        <div ref={scrollRef} className="max-h-[46vh] overflow-y-auto p-3 flex flex-col gap-1.5">
          {visibleLog.map((line, i) => (
            <p key={i} className={`text-xs leading-relaxed ${line.includes('TOUCHDOWN') || line.includes('INTERCEPTED') || line.includes('field goal') ? 'text-gold-400 font-medium' : 'text-parchment-200/80'}`}>
              {line}
            </p>
          ))}
          {!done && <p className="text-xs text-parchment-200/30 animate-pulse-glow">● live</p>}
        </div>
      </Card>

      {!done ? (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Resume'}</Button>
          <Button variant="secondary" onClick={() => revealPlays(5)}>+5 Plays</Button>
          <Button onClick={revealAllPlays}>Skip to Final</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <BoxScoreSummary liveGame={liveGame} homeName={`${home?.name} ${home?.mascot}`} awayName={`${away?.name} ${away?.mascot}`} />
          <Button onClick={() => { commitUserGameAndAdvance(); navigate('/hub') }} className="w-full py-3">
            Continue
          </Button>
        </div>
      )}
    </div>
  )
}

function TeamColumn({ team, score, reverse }: { team: { name: string; mascot: string; abbr: string; colors: { primary: string; secondary: string } } | undefined; score: number | string; reverse?: boolean }) {
  if (!team) return <div />
  return (
    <div className={`flex flex-1 items-center gap-2 ${reverse ? 'flex-row-reverse text-right' : ''}`}>
      <TeamCrest primary={team.colors.primary} secondary={team.colors.secondary} abbr={team.abbr} size={40} />
      <div>
        <p className="text-xs text-parchment-200/70 leading-tight">{team.name}</p>
        <p className="font-display text-2xl text-parchment-100 leading-tight">{score}</p>
      </div>
    </div>
  )
}

function BoxScoreSummary({ liveGame, homeName, awayName }: { liveGame: LiveGameView; homeName: string; awayName: string }) {
  const box = liveGame.boxScore
  if (!box) return null
  return (
    <Card>
      <p className="font-display text-xs text-gold-400 mb-2">Box Score</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-parchment-200/50">
            <th className="text-left font-normal"> </th>
            <th className="text-right font-normal">{awayName}</th>
            <th className="text-right font-normal">{homeName}</th>
          </tr>
        </thead>
        <tbody className="text-parchment-100">
          <Row label="Total Yards" a={box.away.totalYards} b={box.home.totalYards} />
          <Row label="Pass Yards" a={box.away.passYards} b={box.home.passYards} />
          <Row label="Rush Yards" a={box.away.rushYards} b={box.home.rushYards} />
          <Row label="Turnovers" a={box.away.turnovers} b={box.home.turnovers} />
          <Row label="1st Downs" a={box.away.firstDowns} b={box.home.firstDowns} />
        </tbody>
      </table>
    </Card>
  )
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <tr className="border-t border-ink-700/60">
      <td className="py-1 text-parchment-200/60">{label}</td>
      <td className="py-1 text-right tabular-nums">{a}</td>
      <td className="py-1 text-right tabular-nums">{b}</td>
    </tr>
  )
}

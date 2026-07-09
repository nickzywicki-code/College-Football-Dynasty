import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/store'
import { Button, Card, EmptyState } from '../components/Basics'

export function MainMenu() {
  const navigate = useNavigate()
  const saveSlots = useGameStore((s) => s.saveSlots)
  const refreshSaveSlots = useGameStore((s) => s.refreshSaveSlots)
  const loadDynasty = useGameStore((s) => s.loadDynasty)
  const deleteDynasty = useGameStore((s) => s.deleteDynasty)

  useEffect(() => { refreshSaveSlots() }, [refreshSaveSlots])

  return (
    <div className="flex min-h-[calc(100dvh-1.5rem)] flex-col justify-center gap-8 py-10">
      <div className="text-center">
        <p className="font-display text-xs tracking-[0.3em] text-gold-500">EST. THIS SEASON</p>
        <h1 className="font-display text-4xl text-parchment-100 mt-1">GRIDIRON<br /><span className="text-gold-400">LEGACY</span></h1>
        <p className="mt-3 text-sm text-parchment-200/70">Build a college football dynasty from the ground up.</p>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={() => navigate('/new')} className="w-full py-3">Start a New Dynasty</Button>
      </div>

      <div>
        <p className="font-display text-xs tracking-wider text-parchment-200/50 mb-2 px-1">CONTINUE</p>
        {saveSlots.length === 0 && (
          <Card><EmptyState title="No saves yet" body="Start a new dynasty to begin building your legacy." /></Card>
        )}
        <div className="flex flex-col gap-2">
          {saveSlots.map((slot) => (
            <Card key={slot.saveId} className="flex items-center justify-between">
              <button className="text-left flex-1" onClick={async () => { await loadDynasty(slot.saveId); navigate('/hub') }}>
                <p className="font-display text-sm text-parchment-100">{slot.teamName}</p>
                <p className="text-xs text-parchment-200/60">Coach {slot.coachName} · Year {slot.year}, Wk {slot.week} · {slot.wins}-{slot.losses}</p>
              </button>
              <button
                className="text-xs text-crimson-500/80 px-2 py-1 hover:text-crimson-500"
                onClick={() => deleteDynasty(slot.saveId)}
                aria-label="Delete save"
              >
                Delete
              </button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

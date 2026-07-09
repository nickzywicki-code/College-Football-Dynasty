import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useGameStore } from './state/store'
import { TopBar } from './ui/layout/TopBar'
import { BottomNav } from './ui/layout/BottomNav'
import { MainMenu } from './ui/screens/MainMenu'
import { NewDynasty } from './ui/screens/NewDynasty'
import { HomeHub } from './ui/screens/HomeHub'
import { Roster } from './ui/screens/Roster'
import { GamePlanScreen } from './ui/screens/GamePlanScreen'
import { Recruiting } from './ui/screens/Recruiting'
import { Schedule } from './ui/screens/Schedule'
import { GameSim } from './ui/screens/GameSim'
import { Offseason } from './ui/screens/Offseason'
import { CoachCareer } from './ui/screens/CoachCareer'
import { TeamDetail } from './ui/screens/TeamDetail'

const NAV_ROUTES = new Set(['/hub', '/roster', '/gameplan', '/recruiting', '/schedule'])

function Shell() {
  const dynasty = useGameStore((s) => s.dynasty)
  const location = useLocation()
  const showChrome = Boolean(dynasty)
  const showNav = showChrome && NAV_ROUTES.has(location.pathname)

  return (
    <div className="flex min-h-dvh flex-col">
      {showChrome && <TopBar />}
      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/new" element={<NewDynasty />} />
          <Route path="/hub" element={<RequireDynasty><HomeHub /></RequireDynasty>} />
          <Route path="/roster" element={<RequireDynasty><Roster /></RequireDynasty>} />
          <Route path="/gameplan" element={<RequireDynasty><GamePlanScreen /></RequireDynasty>} />
          <Route path="/recruiting" element={<RequireDynasty><Recruiting /></RequireDynasty>} />
          <Route path="/schedule" element={<RequireDynasty><Schedule /></RequireDynasty>} />
          <Route path="/game" element={<RequireDynasty><GameSim /></RequireDynasty>} />
          <Route path="/offseason" element={<RequireDynasty><Offseason /></RequireDynasty>} />
          <Route path="/coach" element={<RequireDynasty><CoachCareer /></RequireDynasty>} />
          <Route path="/team/:teamId" element={<RequireDynasty><TeamDetail /></RequireDynasty>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showNav && <BottomNav />}
    </div>
  )
}

function RequireDynasty({ children }: { children: ReactNode }) {
  const dynasty = useGameStore((s) => s.dynasty)
  if (!dynasty) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

export default App

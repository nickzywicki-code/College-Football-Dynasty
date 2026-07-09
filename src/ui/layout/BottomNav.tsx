import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/hub', label: 'Hub', icon: '⌂' },
  { to: '/roster', label: 'Roster', icon: '☰' },
  { to: '/gameplan', label: 'Game Plan', icon: '⚙' },
  { to: '/recruiting', label: 'Recruits', icon: '★' },
  { to: '/schedule', label: 'Standings', icon: '▦' },
]

export function BottomNav() {
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-ink-700 bg-ink-900/95 backdrop-blur px-1 pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-display tracking-wide transition-colors ${
              isActive ? 'text-gold-400' : 'text-parchment-200/50'
            }`
          }
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

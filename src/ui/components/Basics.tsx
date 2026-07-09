import type { CSSProperties, ReactNode } from 'react'

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-850/80 p-4 shadow-lg shadow-black/20 ${className}`} style={style}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="font-display text-sm tracking-wider text-gold-400">{children}</h2>
      {right}
    </div>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn' | 'gold' }) {
  const tones: Record<string, string> = {
    default: 'bg-ink-700 text-parchment-200',
    good: 'bg-emerald-glow/20 text-emerald-glow',
    bad: 'bg-crimson-600/25 text-red-300',
    warn: 'bg-gold-600/25 text-gold-400',
    gold: 'bg-gold-500/20 text-gold-400 border border-gold-600/40',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function Button({
  children, onClick, variant = 'primary', className = '', disabled = false, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const variants: Record<string, string> = {
    primary: 'bg-gold-500 text-ink-950 hover:bg-gold-400 active:bg-gold-600',
    secondary: 'bg-ink-700 text-parchment-100 hover:bg-ink-600',
    ghost: 'bg-transparent text-parchment-200 border border-ink-600 hover:bg-ink-800',
    danger: 'bg-crimson-600 text-parchment-100 hover:bg-crimson-500',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-display text-sm tracking-wide rounded-lg px-4 py-2.5 transition-colors disabled:opacity-40 disabled:pointer-events-none ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function StatBar({ label, value, max = 99 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100))
  const color = value >= 85 ? 'bg-gold-500' : value >= 70 ? 'bg-emerald-glow' : value >= 55 ? 'bg-ink-500' : 'bg-crimson-600'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-parchment-200/70">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-ink-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right tabular-nums text-parchment-100">{value}</span>
    </div>
  )
}

export function OverallBadge({ value }: { value: number }) {
  const color = value >= 88 ? 'text-gold-400' : value >= 75 ? 'text-emerald-glow' : value >= 60 ? 'text-parchment-100' : 'text-parchment-200/50'
  return <span className={`font-display text-lg tabular-nums ${color}`}>{value}</span>
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="text-gold-400 text-xs tracking-tight">
      {'★'.repeat(count)}<span className="text-ink-600">{'★'.repeat(5 - count)}</span>
    </span>
  )
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center text-parchment-200/60">
      <p className="font-display text-sm">{title}</p>
      <p className="text-xs max-w-56">{body}</p>
    </div>
  )
}

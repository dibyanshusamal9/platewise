import type { ReactNode } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { MACROS, fmtGrams, fmtKcal } from '../lib/nutrition'

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin`} aria-hidden />
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-critical-wash px-3 py-2.5 text-sm text-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Small colored dot that carries macro identity next to text (text itself stays in ink colors). */
export function Swatch({ color, className = 'size-2.5' }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />
}

/** "P 32 · C 40 · F 12" — compact macro readout used in meal rows. */
export function MacroInline({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const values = { protein, carbs, fat }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
      {MACROS.map((m) => (
        <span key={m.key} className="inline-flex items-center gap-1.5">
          <Swatch color={m.color} className="size-2" />
          <span className="sr-only">{m.label}</span>
          <span aria-hidden className="text-muted">{m.short}</span>
          <span className="num">{fmtGrams(values[m.key])}g</span>
        </span>
      ))}
    </span>
  )
}

/** Calorie progress ring. Past 100% the overflow wraps around in the critical color. */
export function CalorieRing({ consumed, target, size = 176 }: { consumed: number; target: number | null; size?: number }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = target ? consumed / target : 0
  const main = Math.min(ratio, 1)
  const overflow = Math.min(Math.max(ratio - 1, 0), 1)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={
          target
            ? `${fmtKcal(consumed)} of ${fmtKcal(target)} kilocalories eaten`
            : `${fmtKcal(consumed)} kilocalories eaten`
        }
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--energy-track)" strokeWidth={stroke} />
        {main > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--energy)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${main * c} ${c}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        )}
        {overflow > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--critical)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${overflow * c} ${c}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[28px] font-semibold leading-none tracking-tight">{fmtKcal(consumed)}</span>
        <span className="mt-1.5 text-xs text-muted">
          {target ? <>of {fmtKcal(target)} kcal</> : 'kcal eaten'}
        </span>
      </div>
    </div>
  )
}

/** Horizontal meter for one macro. Track is a lighter step of the macro's own hue. */
export function MacroMeter({
  label,
  color,
  track,
  value,
  target,
}: {
  label: string
  color: string
  track: string
  value: number
  target: number | null
}) {
  const pct = target ? Math.min(value / target, 1) * 100 : 0
  const over = target ? value - target : 0
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Swatch color={color} />
          {label}
        </span>
        <span className="text-sm text-ink-2">
          <span className="num font-semibold text-ink">{fmtGrams(value)}</span>
          {target ? <span className="num"> / {fmtGrams(target)} g</span> : ' g'}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: track }}
        role="meter"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={target ?? 0}
        aria-valuenow={Math.round(value)}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {!target ? (
          'No target set'
        ) : over > 0 ? (
          <span className="inline-flex items-center gap-1 text-critical">
            <TriangleAlert className="size-3" aria-hidden />
            {fmtGrams(over)} g over target
          </span>
        ) : (
          <>{fmtGrams(target - value)} g to go</>
        )}
      </p>
    </div>
  )
}

export function StatTile({ label, value, unit, detail }: { label: string; value: string; unit?: string; detail?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </p>
      {detail && <p className="mt-1 text-xs text-ink-2">{detail}</p>}
    </div>
  )
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`shimmer rounded-xl ${className}`} aria-hidden />
}

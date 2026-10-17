import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  MACROS,
  dateFromKey,
  energySplit,
  fmtDayLabel,
  fmtGrams,
  fmtKcal,
  fmtPct,
  fmtSigned,
  goalForDay,
  lastSevenDayKeys,
  summarizeDays,
  type DaySummary,
  type Totals,
} from '../lib/nutrition'
import { useGoals, useMealsBetween, useTodayKey } from '../lib/queries'
import { MealList } from './MealTimeline'
import { ErrorNote, SectionHeading, Skeleton, StatTile, Swatch } from './ui'

const KCAL_PER_KG_FAT = 7700

export function WeeklyReport() {
  const todayKey = useTodayKey()
  const dayKeys = useMemo(() => lastSevenDayKeys(todayKey), [todayKey])
  const goals = useGoals()
  const meals = useMealsBetween(dayKeys[0], todayKey)

  const days = useMemo(
    () => {
      if (!goals.data || !meals.data) return []
      // Score every day against the CURRENT targets, so changing your TDEE or calorie
      // target immediately recalculates the whole week (averages, deficit, days on target).
      const current = goalForDay(goals.data, todayKey)
      return summarizeDays(dayKeys, meals.data, current ? [current] : [])
    },
    [dayKeys, goals.data, meals.data, todayKey],
  )

  if (goals.isPending || meals.isPending) return <ReportSkeleton />
  if (goals.isError || meals.isError) {
    return <ErrorNote>Couldn't load this week: {(goals.error ?? meals.error)?.message}</ErrorNote>
  }

  const rangeLabel = `${dateFromKey(dayKeys[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${dateFromKey(
    todayKey,
  ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Weekly report</h1>
        <p className="mt-0.5 text-sm text-muted">Last 7 days · {rangeLabel}</p>
      </header>

      <KeyMetrics days={days} />

      <section className="card p-5 sm:p-6">
        <DailyCaloriesChart days={days} todayKey={todayKey} />
      </section>

      <section className="card p-5 sm:p-6">
        <MacroDistribution days={days} />
      </section>

      <section className="card p-5 sm:p-6">
        <SectionHeading title="Meal timeline" subtitle="Edit or delete anything logged this week" />
        <div className="space-y-6">
          {[...days].reverse().map((day) => (
            <div key={day.key}>
              <div className="sticky top-[calc(3.5rem+var(--safe-top))] z-[1] -mx-2 flex items-baseline justify-between rounded-lg bg-surface/95 px-2 py-1.5 backdrop-blur sm:top-[calc(4rem+var(--safe-top))]">
                <h3 className="text-sm font-semibold">{fmtDayLabel(day.key, todayKey)}</h3>
                <p className="text-[13px] text-muted">
                  <span className="num font-medium text-ink-2">{fmtKcal(day.totals.calories)}</span>
                  {day.goal ? <> / {fmtKcal(day.goal.calorie_target_kcal)} kcal</> : ' kcal'}
                </p>
              </div>
              <MealList meals={day.meals} emptyText="Nothing logged." />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─── Key metrics ────────────────────────────────────────────────────────────

function KeyMetrics({ days }: { days: DaySummary[] }) {
  const logged = days.filter((d) => d.logged)
  const withGoal = logged.filter((d) => d.goal)
  const n = logged.length

  const avgIntake = n ? logged.reduce((s, d) => s + d.totals.calories, 0) / n : 0
  const avgTarget = withGoal.length
    ? withGoal.reduce((s, d) => s + d.goal!.calorie_target_kcal, 0) / withGoal.length
    : null
  // Energy balance vs maintenance, only for days that were actually logged.
  const balance = withGoal.reduce((s, d) => s + d.totals.calories - d.goal!.tdee_kcal, 0)
  const onTarget = withGoal.filter(
    (d) => Math.abs(d.totals.calories - d.goal!.calorie_target_kcal) <= d.goal!.calorie_target_kcal * 0.1,
  ).length
  const mealCount = logged.reduce((s, d) => s + d.meals.length, 0)

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Avg daily intake"
        value={n ? fmtKcal(avgIntake) : '—'}
        unit={n ? 'kcal' : undefined}
        detail={
          avgTarget !== null ? (
            <>
              vs {fmtKcal(avgTarget)} target · <span className="num">{fmtSigned(avgIntake - avgTarget)}</span>
            </>
          ) : (
            'No target set'
          )
        }
      />
      <StatTile
        label={withGoal.length === 0 ? 'Weekly balance' : balance <= 0 ? 'Weekly deficit' : 'Weekly surplus'}
        value={withGoal.length ? fmtKcal(Math.abs(balance)) : '—'}
        unit={withGoal.length ? 'kcal' : undefined}
        detail={
          withGoal.length
            ? `≈ ${fmtGrams(Math.abs(balance) / KCAL_PER_KG_FAT)} kg · vs TDEE over ${withGoal.length} logged day${withGoal.length === 1 ? '' : 's'}`
            : 'Set targets to track this'
        }
      />
      <StatTile
        label="Days on target"
        value={withGoal.length ? `${onTarget}/${withGoal.length}` : '—'}
        detail="Within ±10% of calorie target"
      />
      <StatTile label="Days logged" value={`${n}/7`} detail={`${mealCount} meal${mealCount === 1 ? '' : 's'} this week`} />
    </div>
  )
}

// ─── Daily calories vs target (bar + target step line) ──────────────────────

interface ChartRow {
  key: string
  label: string
  eaten: number
  target: number | null
  tdee: number | null
  isToday: boolean
}

function DailyCaloriesChart({ days, todayKey }: { days: DaySummary[]; todayKey: string }) {
  const data: ChartRow[] = days.map((d) => ({
    key: d.key,
    label: d.date.toLocaleDateString(undefined, { weekday: 'short' }),
    eaten: Math.round(d.totals.calories),
    target: d.goal?.calorie_target_kcal ?? null,
    tdee: d.goal?.tdee_kcal ?? null,
    isToday: d.key === todayKey,
  }))
  const hasTarget = data.some((d) => d.target !== null)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">Daily calories vs target</h2>
          <p className="mt-0.5 text-sm text-muted">kcal per day</p>
        </div>
        <ul className="flex items-center gap-4 text-[13px] text-ink-2" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-2.5 rounded-t-[3px] bg-energy" />
            Eaten
          </li>
          {hasTarget && (
            <li className="flex items-center gap-1.5">
              <svg aria-hidden width="18" height="4" className="overflow-visible">
                <line x1="0" y1="2" x2="18" y2="2" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              Target
            </li>
          )}
        </ul>
      </div>

      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              dy={6}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 12 }}
              tickFormatter={(v: number) => fmtKcal(v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as ChartRow | undefined
                return active && row ? <ChartTooltip row={row} /> : null
              }}
            />
            <Bar dataKey="eaten" name="Eaten" fill="var(--energy)" radius={[4, 4, 0, 0]} maxBarSize={24}>
              <LabelList
                position="top"
                offset={8}
                fill="var(--ink-2)"
                fontSize={12}
                fontWeight={600}
                // Label only today's bar — the axis, tooltip and table carry the rest.
                // (Recharts skips zero-height bars, so match on the row, not the index.)
                valueAccessor={(entry) => {
                  const row = entry.payload as ChartRow
                  return row.isToday && row.eaten > 0 ? fmtKcal(row.eaten) : undefined
                }}
              />
            </Bar>
            {hasTarget && (
              <Line
                dataKey="target"
                name="Target"
                type="step"
                stroke="var(--ink-2)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <details className="group mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 hover:text-ink">
          <span className="group-open:hidden">Show as table</span>
          <span className="hidden group-open:inline">Hide table</span>
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="num w-full min-w-[420px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Day</th>
                <th className="py-2 pr-3 text-right font-medium">Eaten</th>
                <th className="py-2 pr-3 text-right font-medium">Target</th>
                <th className="py-2 pr-3 text-right font-medium">vs target</th>
                <th className="py-2 text-right font-medium">vs TDEE</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3">{fmtDayLabel(row.key, todayKey)}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmtKcal(row.eaten)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">{row.target === null ? '—' : fmtKcal(row.target)}</td>
                  <td className="py-2 pr-3 text-right text-ink-2">
                    {row.target === null || row.eaten === 0 ? '—' : fmtSigned(row.eaten - row.target)}
                  </td>
                  <td className="py-2 text-right text-ink-2">
                    {row.tdee === null || row.eaten === 0 ? '—' : fmtSigned(row.eaten - row.tdee)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

function ChartTooltip({ row }: { row: ChartRow }) {
  const diff = row.target === null ? null : row.eaten - row.target
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-lg">
      <p className="mb-1.5 font-semibold">
        {dateFromKey(row.key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
      </p>
      <p className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-ink-2">
          <Swatch color="var(--energy)" className="size-2" /> Eaten
        </span>
        <span className="num font-medium">{fmtKcal(row.eaten)} kcal</span>
      </p>
      {row.target !== null && (
        <p className="flex items-center justify-between gap-4">
          <span className="text-ink-2">Target</span>
          <span className="num">{fmtKcal(row.target)} kcal</span>
        </p>
      )}
      {diff !== null && row.eaten > 0 && (
        <p className="mt-1 border-t border-line pt-1 text-xs text-muted">
          {diff > 0 ? `${fmtKcal(diff)} kcal over target` : `${fmtKcal(-diff)} kcal under target`}
        </p>
      )}
    </div>
  )
}

// ─── Macro distribution ─────────────────────────────────────────────────────

function MacroDistribution({ days }: { days: DaySummary[] }) {
  const logged = days.filter((d) => d.logged)
  const n = logged.length

  if (n === 0) {
    return (
      <>
        <SectionHeading title="Average macro distribution" />
        <p className="text-sm text-muted">Log a meal to see your macro split.</p>
      </>
    )
  }

  const avg: Totals = {
    calories: logged.reduce((s, d) => s + d.totals.calories, 0) / n,
    protein: logged.reduce((s, d) => s + d.totals.protein, 0) / n,
    carbs: logged.reduce((s, d) => s + d.totals.carbs, 0) / n,
    fat: logged.reduce((s, d) => s + d.totals.fat, 0) / n,
  }
  const withGoal = logged.filter((d) => d.goal)
  const avgGoal = withGoal.length
    ? {
        protein: withGoal.reduce((s, d) => s + d.goal!.protein_g, 0) / withGoal.length,
        carbs: withGoal.reduce((s, d) => s + d.goal!.carbs_g, 0) / withGoal.length,
        fat: withGoal.reduce((s, d) => s + d.goal!.fat_g, 0) / withGoal.length,
      }
    : null

  const actualSplit = energySplit(avg)
  const targetSplit = avgGoal ? energySplit(avgGoal) : null

  return (
    <>
      <SectionHeading
        title="Average macro distribution"
        subtitle={`Share of calories per day, averaged over ${n} logged day${n === 1 ? '' : 's'}`}
      />

      <div className="space-y-3">
        <SplitBar label="You" split={actualSplit} />
        {targetSplit && <SplitBar label="Target" split={targetSplit} />}
      </div>

      <table className="num mt-5 w-full text-left text-[13px]">
        <thead className="text-muted">
          <tr className="border-b border-line">
            <th className="py-2 font-medium">Macro</th>
            <th className="py-2 text-right font-medium">Avg / day</th>
            <th className="py-2 text-right font-medium">Target</th>
            <th className="py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {MACROS.map((m) => (
            <tr key={m.key} className="border-b border-line last:border-0">
              <td className="py-2">
                <span className="inline-flex items-center gap-2">
                  <Swatch color={m.color} />
                  {m.label}
                </span>
              </td>
              <td className="py-2 text-right font-medium">{fmtGrams(avg[m.key])} g</td>
              <td className="py-2 text-right text-ink-2">{avgGoal ? `${fmtGrams(avgGoal[m.key])} g` : '—'}</td>
              <td className="py-2 text-right text-ink-2">
                {fmtPct(actualSplit[m.key])}
                {targetSplit && <span className="text-muted"> / {fmtPct(targetSplit[m.key])}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** 100% stacked bar; a 2px surface-colored gap separates the segments. */
function SplitBar({ label, split }: { label: string; split: { protein: number; carbs: number; fat: number } }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[13px] text-ink-2">{label}</span>
      <div
        className="flex h-3 flex-1 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${label}: ${MACROS.map((m) => `${m.label} ${fmtPct(split[m.key])}`).join(', ')}`}
      >
        {MACROS.map((m) =>
          split[m.key] > 0 ? (
            <div
              key={m.key}
              className="h-full transition-[flex-grow] duration-700"
              style={{ flexGrow: split[m.key], flexBasis: 0, background: m.color }}
              title={`${m.label} ${fmtPct(split[m.key])}`}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading weekly report">
      <Skeleton className="h-12 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-56" />
    </div>
  )
}

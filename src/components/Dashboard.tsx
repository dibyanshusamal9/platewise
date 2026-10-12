import { Link } from '@tanstack/react-router'
import { ArrowRight, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { MACROS, fmtKcal, goalForDay, sumMeals } from '../lib/nutrition'
import { useGoals, useMealsBetween, useTodayKey } from '../lib/queries'
import { MealList } from './MealTimeline'
import { CalorieRing, ErrorNote, MacroMeter, SectionHeading, Skeleton } from './ui'

/** Today at a glance: calories vs target, balance vs TDEE, macro meters, and today's meals. */
export function Dashboard() {
  const todayKey = useTodayKey()
  const goals = useGoals()
  const meals = useMealsBetween(todayKey, todayKey)

  if (goals.isPending || meals.isPending) return <DashboardSkeleton />
  if (goals.isError || meals.isError) {
    return <ErrorNote>Couldn't load today's data: {(goals.error ?? meals.error)?.message}</ErrorNote>
  }

  const goal = goalForDay(goals.data, todayKey)
  const totals = sumMeals(meals.data)
  const target = goal?.calorie_target_kcal ?? null
  const remaining = target === null ? null : target - totals.calories
  // Negative balance = eating below maintenance (deficit); positive = surplus.
  const balance = goal ? totals.calories - goal.tdee_kcal : null

  return (
    <div className="space-y-4">
      {!goal && <SetTargetsCallout />}

      <div className="grid gap-4 lg:grid-cols-5">
        <section aria-label="Calories today" className="card p-5 sm:p-6 lg:col-span-3">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
            <CalorieRing consumed={totals.calories} target={target} />
            <div className="w-full min-w-0 flex-1">
              {remaining === null ? (
                <>
                  <p className="text-sm text-muted">Eaten today</p>
                  <p className="mt-1 text-5xl font-semibold tracking-tight">
                    {fmtKcal(totals.calories)}
                    <span className="ml-1.5 text-lg font-medium text-muted">kcal</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">{remaining >= 0 ? 'Remaining today' : 'Over today’s target'}</p>
                  <p className={`mt-1 text-5xl font-semibold tracking-tight ${remaining < 0 ? 'text-critical' : ''}`}>
                    {fmtKcal(Math.abs(remaining))}
                    <span className="ml-1.5 text-lg font-medium text-muted">kcal</span>
                  </p>
                </>
              )}

              <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <Figure label="Eaten" value={fmtKcal(totals.calories)} />
                <Figure label="Target" value={target === null ? '—' : fmtKcal(target)} />
                {balance === null ? (
                  <Figure label="Balance" value="—" />
                ) : (
                  <Figure
                    label={balance <= 0 ? 'Deficit' : 'Surplus'}
                    value={fmtKcal(Math.abs(balance))}
                    icon={balance <= 0 ? TrendingDown : TrendingUp}
                    hint={`vs ${fmtKcal(goal!.tdee_kcal)} TDEE`}
                  />
                )}
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="macros-heading" className="card p-5 sm:p-6 lg:col-span-2">
          <h2 id="macros-heading" className="mb-5 text-[15px] font-semibold">
            Macros
          </h2>
          <div className="space-y-5">
            {MACROS.map((m) => (
              <MacroMeter
                key={m.key}
                label={m.label}
                color={m.color}
                track={m.track}
                value={totals[m.key]}
                target={goal ? goal[m.goalKey] : null}
              />
            ))}
          </div>
        </section>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionHeading
          title="Today’s meals"
          subtitle={meals.data.length ? `${meals.data.length} logged` : undefined}
          action={
            <Link to="/weekly" className="btn-ghost -mr-2 px-2.5 py-1.5 text-[13px]">
              This week <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        <MealList meals={meals.data} emptyText="No meals yet today. Describe your first one above." />
      </section>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  icon?: typeof TrendingDown
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">
        {value}
        {value !== '—' && <span className="ml-0.5 text-xs font-normal text-muted">kcal</span>}
      </dd>
      {hint && <dd className="truncate text-[11px] text-muted">{hint}</dd>}
    </div>
  )
}

function SetTargetsCallout() {
  return (
    <Link
      to="/goals"
      className="card flex items-center gap-4 border-energy/30 bg-energy-track/60 p-4 transition hover:bg-energy-track"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-energy text-page">
        <Target className="size-5" aria-hidden />
      </div>
      <div className="flex-1">
        <p className="font-semibold">Set your daily targets</p>
        <p className="text-sm text-ink-2">Add your TDEE and macro goals to see what’s left and your deficit.</p>
      </div>
      <ArrowRight className="size-5 text-ink-2" aria-hidden />
    </Link>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-60 lg:col-span-3" />
        <Skeleton className="h-60 lg:col-span-2" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

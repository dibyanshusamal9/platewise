import { useState, type FormEvent } from 'react'
import { Calculator, Check } from 'lucide-react'
import type { ActivityLevel, Sex } from '../lib/database.types'
import {
  ACTIVITY_LEVELS,
  KCAL_PER_GRAM,
  MACROS,
  bmr,
  energySplit,
  fmtKcal,
  fmtPct,
  goalForDay,
  suggestTargets,
  tdee,
  type DailyGoal,
  type Profile,
  type WeightGoal,
} from '../lib/nutrition'
import { useGoals, useProfile, useSaveGoals, useTodayKey } from '../lib/queries'
import { AppUpdatesCard } from './UpdateNotices'
import { GeminiKeySettings } from './GeminiKeySettings'
import { ErrorNote, Skeleton, Spinner, Swatch } from './ui'

/** Limits mirror the CHECK constraints in supabase/schema.sql. */
const LIMITS = {
  tdee: [1000, 6000],
  calories: [800, 6000],
  protein: [0, 500],
  carbs: [0, 1000],
  fat: [0, 400],
} as const

type TargetsForm = Record<keyof typeof LIMITS, string>

export function GoalsSetup() {
  const todayKey = useTodayKey()
  const goals = useGoals()
  const profile = useProfile()

  if (goals.isPending || profile.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    )
  }
  if (goals.isError || profile.isError) {
    return <ErrorNote>Couldn't load your targets: {(goals.error ?? profile.error)?.message}</ErrorNote>
  }

  return <GoalsEditor current={goalForDay(goals.data, todayKey)} profile={profile.data} todayKey={todayKey} />
}

function GoalsEditor({ current, profile, todayKey }: { current: DailyGoal | null; profile: Profile | null; todayKey: string }) {
  const [form, setForm] = useState<TargetsForm>({
    tdee: current ? String(current.tdee_kcal) : '',
    calories: current ? String(current.calorie_target_kcal) : '',
    protein: current ? String(current.protein_g) : '',
    carbs: current ? String(current.carbs_g) : '',
    fat: current ? String(current.fat_g) : '',
  })
  const [bodyMetricsToSave, setBodyMetricsToSave] = useState<BodyForm | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const save = useSaveGoals()

  const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? NaN : Number(v)])) as Record<
    keyof TargetsForm,
    number
  >
  const errors = (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).filter((k) => {
    const v = values[k]
    return !Number.isFinite(v) || v < LIMITS[k][0] || v > LIMITS[k][1]
  })
  const macroKcal =
    (values.protein || 0) * KCAL_PER_GRAM.protein +
    (values.carbs || 0) * KCAL_PER_GRAM.carbs +
    (values.fat || 0) * KCAL_PER_GRAM.fat
  const macroGap = Number.isFinite(values.calories) ? macroKcal - values.calories : 0
  const split = energySplit({ protein: values.protein || 0, carbs: values.carbs || 0, fat: values.fat || 0 })

  function set(key: keyof TargetsForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setSavedAt(null)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (errors.length) return
    save.mutate(
      {
        goal: {
          effective_from: todayKey,
          tdee_kcal: Math.round(values.tdee),
          calorie_target_kcal: Math.round(values.calories),
          protein_g: Math.round(values.protein),
          carbs_g: Math.round(values.carbs),
          fat_g: Math.round(values.fat),
        },
        profile: bodyMetricsToSave
          ? {
              sex: bodyMetricsToSave.sex,
              age_years: Number(bodyMetricsToSave.age),
              height_cm: Number(bodyMetricsToSave.height),
              weight_kg: Number(bodyMetricsToSave.weight),
              activity_level: bodyMetricsToSave.activity,
            }
          : undefined,
      },
      { onSuccess: () => setSavedAt(Date.now()) },
    )
  }

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Daily targets</h1>
        <p className="mt-0.5 text-sm text-muted">
          Changes apply from today. Earlier days keep the targets they had, so past reports stay accurate.
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <form onSubmit={submit} className="card p-5 sm:p-6" noValidate>
          <h2 className="mb-4 text-[15px] font-semibold">Energy</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="tdee"
              label="TDEE (maintenance)"
              unit="kcal"
              value={form.tdee}
              onChange={(v) => set('tdee', v)}
              invalid={form.tdee !== '' && errors.includes('tdee')}
              hint="Calories you burn per day"
            />
            <NumberField
              id="calories"
              label="Calorie target"
              unit="kcal"
              value={form.calories}
              onChange={(v) => set('calories', v)}
              invalid={form.calories !== '' && errors.includes('calories')}
              hint={
                Number.isFinite(values.tdee) && Number.isFinite(values.calories)
                  ? `${fmtKcal(Math.abs(values.tdee - values.calories))} kcal ${
                      values.calories <= values.tdee ? 'daily deficit' : 'daily surplus'
                    }`
                  : 'What you aim to eat'
              }
            />
          </div>

          <h2 className="mt-6 mb-4 text-[15px] font-semibold">Macros</h2>
          <div className="grid grid-cols-3 gap-3">
            {MACROS.map((m) => (
              <NumberField
                key={m.key}
                id={m.key}
                label={m.label}
                unit="g"
                color={m.color}
                value={form[m.key]}
                onChange={(v) => set(m.key, v)}
                invalid={form[m.key] !== '' && errors.includes(m.key)}
              />
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-surface-2 p-3">
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-line" aria-hidden>
              {MACROS.map((m) =>
                split[m.key] > 0 ? (
                  <div key={m.key} style={{ flexGrow: split[m.key], flexBasis: 0, background: m.color }} />
                ) : null,
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
              <span className="flex gap-3">
                {MACROS.map((m) => (
                  <span key={m.key} className="inline-flex items-center gap-1.5">
                    <Swatch color={m.color} className="size-2" />
                    {m.label} {fmtPct(split[m.key])}
                  </span>
                ))}
              </span>
              <span className="num">
                = {fmtKcal(macroKcal)} kcal
                {Number.isFinite(values.calories) && Math.abs(macroGap) > 50 && (
                  <span className="text-muted">
                    {' '}
                    ({fmtKcal(Math.abs(macroGap))} {macroGap > 0 ? 'over' : 'under'} target)
                  </span>
                )}
              </span>
            </div>
          </div>

          {errors.length > 0 && Object.values(form).some((v) => v !== '') && (
            <p className="mt-3 text-xs text-muted">
              Ranges: TDEE 1,000–6,000 · target 800–6,000 kcal · protein ≤ 500 g · carbs ≤ 1,000 g · fat ≤ 400 g.
            </p>
          )}
          {save.isError && (
            <div className="mt-3">
              <ErrorNote>{save.error.message}</ErrorNote>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={errors.length > 0 || save.isPending}>
              {save.isPending && <Spinner />}
              Save targets
            </button>
            {savedAt && (
              <span className="inline-flex items-center gap-1.5 text-sm text-good" role="status">
                <Check className="size-4" aria-hidden /> Saved
              </span>
            )}
          </div>
        </form>

        <TdeeCalculator
          profile={profile}
          onApply={(suggestion, body) => {
            setForm({
              tdee: String(suggestion.tdee),
              calories: String(suggestion.calories),
              protein: String(suggestion.protein),
              carbs: String(suggestion.carbs),
              fat: String(suggestion.fat),
            })
            setBodyMetricsToSave(body)
            setSavedAt(null)
          }}
        />
      </div>

      <GeminiKeySettings variant="settings" />
      <AppUpdatesCard />
    </div>
  )
}


function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  invalid,
  hint,
  color,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  hint?: string
  color?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-1.5">
        {color && <Swatch color={color} className="size-2" />}
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={`field num pr-12 ${invalid ? 'border-critical focus:border-critical' : ''}`}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{unit}</span>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

// ─── TDEE calculator ────────────────────────────────────────────────────────

interface BodyForm {
  sex: Sex | null
  age: string
  height: string
  weight: string
  activity: ActivityLevel
  goal: WeightGoal
}

function TdeeCalculator({
  profile,
  onApply,
}: {
  profile: Profile | null
  onApply: (
    suggestion: { tdee: number; calories: number; protein: number; carbs: number; fat: number },
    body: BodyForm & { sex: Sex },
  ) => void
}) {
  const [body, setBody] = useState<BodyForm>({
    sex: profile?.sex ?? null,
    age: profile?.age_years ? String(profile.age_years) : '',
    height: profile?.height_cm ? String(profile.height_cm) : '',
    weight: profile?.weight_kg ? String(profile.weight_kg) : '',
    activity: profile?.activity_level ?? 'light',
    goal: 'maintain',
  })
  const set = <K extends keyof BodyForm>(key: K, value: BodyForm[K]) => setBody((b) => ({ ...b, [key]: value }))

  const age = Number(body.age)
  const height = Number(body.height)
  const weight = Number(body.weight)
  const complete =
    body.sex !== null && age >= 13 && age <= 120 && height >= 100 && height <= 250 && weight >= 30 && weight <= 400

  const metrics = complete
    ? { sex: body.sex!, age, heightCm: height, weightKg: weight, activity: body.activity }
    : null
  const tdeeKcal = metrics ? tdee(metrics) : null
  const suggestion = metrics && tdeeKcal ? { tdee: tdeeKcal, ...suggestTargets(tdeeKcal, weight, body.goal) } : null

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="calc-heading">
      <div className="mb-4 flex items-center gap-2">
        <Calculator className="size-4 text-energy" aria-hidden />
        <h2 id="calc-heading" className="text-[15px] font-semibold">
          Not sure? Estimate your TDEE
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <fieldset className="col-span-2">
          <legend className="label">Sex (used by the BMR formula)</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['female', 'male'] as const).map((s) => (
              <label
                key={s}
                className={`cursor-pointer rounded-lg py-2 text-center text-sm font-medium capitalize transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-energy ${
                  body.sex === s ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="sex"
                  value={s}
                  checked={body.sex === s}
                  onChange={() => set('sex', s)}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>

        <SimpleNumber id="age" label="Age" unit="yrs" value={body.age} onChange={(v) => set('age', v)} />
        <SimpleNumber id="weight" label="Weight" unit="kg" value={body.weight} onChange={(v) => set('weight', v)} />
        <SimpleNumber id="height" label="Height" unit="cm" value={body.height} onChange={(v) => set('height', v)} />
        <div>
          <label htmlFor="goal" className="label">
            Goal
          </label>
          <select
            id="goal"
            value={body.goal}
            onChange={(e) => set('goal', e.target.value as WeightGoal)}
            className="field"
          >
            <option value="lose">Lose weight</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Build muscle</option>
          </select>
        </div>

        <div className="col-span-2">
          <label htmlFor="activity" className="label">
            Activity level
          </label>
          <select
            id="activity"
            value={body.activity}
            onChange={(e) => set('activity', e.target.value as ActivityLevel)}
            className="field"
          >
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label} — {a.hint}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line p-4">
        {suggestion && metrics ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Estimated TDEE</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {fmtKcal(suggestion.tdee)}
                  <span className="ml-1 text-sm font-medium text-muted">kcal/day</span>
                </p>
              </div>
              <p className="text-right text-xs text-muted">
                BMR {fmtKcal(bmr(metrics))} kcal
                <br />
                Mifflin-St Jeor
              </p>
            </div>
            <p className="mt-3 text-sm text-ink-2">
              Suggested: <span className="font-semibold text-ink">{fmtKcal(suggestion.calories)} kcal</span> ·{' '}
              {suggestion.protein} g protein · {suggestion.carbs} g carbs · {suggestion.fat} g fat
            </p>
            <button
              type="button"
              className="btn-secondary mt-4 w-full"
              onClick={() => onApply(suggestion, { ...body, sex: body.sex! })}
            >
              Use these numbers
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Fill in your details to get a maintenance estimate and suggested macros.</p>
        )}
      </div>
    </section>
  )
}

function SimpleNumber({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field num pr-12"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">{unit}</span>
      </div>
    </div>
  )
}

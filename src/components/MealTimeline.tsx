import { useState, type FormEvent } from 'react'
import { Pencil, Sparkles, Trash2 } from 'lucide-react'
import type { MealType } from '../lib/database.types'
import {
  MACROS,
  MEAL_TYPES,
  fmtKcal,
  fmtTime,
  toDateTimeLocal,
  type Meal,
} from '../lib/nutrition'
import { useDeleteMeal, useEstimateMeal, useUpdateMeal } from '../lib/queries'
import { ErrorNote, MacroInline, Spinner } from './ui'

export function MealList({ meals, emptyText = 'Nothing logged yet.' }: { meals: Meal[]; emptyText?: string }) {
  if (meals.length === 0) {
    return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{emptyText}</p>
  }
  return (
    <ul className="divide-y divide-line">
      {meals.map((meal) => (
        <MealRow key={meal.id} meal={meal} />
      ))}
    </ul>
  )
}

function MealRow({ meal }: { meal: Meal }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const deleteMeal = useDeleteMeal()

  if (mode === 'edit') {
    return (
      <li className="py-3">
        <MealEditor meal={meal} onClose={() => setMode('view')} />
      </li>
    )
  }

  return (
    <li className="group flex gap-3 py-3.5">
      <div className="w-14 shrink-0 pt-0.5 text-xs text-muted">
        <p className="num">{fmtTime(meal.eaten_at)}</p>
        <p className="mt-0.5 capitalize">{meal.meal_type}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 gap-3">
            {meal.photo_thumb && (
              <img
                src={meal.photo_thumb}
                alt=""
                loading="lazy"
                className="size-11 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="font-medium leading-snug">{meal.meal_name}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{meal.description}</p>
            </div>
          </div>
          <p className="shrink-0 text-sm font-semibold">
            <span className="num">{fmtKcal(meal.calories)}</span>
            <span className="ml-0.5 text-xs font-normal text-muted">kcal</span>
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <MacroInline protein={meal.protein_g} carbs={meal.carbs_g} fat={meal.fat_g} />

          {mode === 'confirm-delete' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-ink-2">Delete this meal?</span>
              <button type="button" className="btn-ghost px-2.5 py-1 text-[13px]" onClick={() => setMode('view')}>
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-critical px-2.5 py-1 text-[13px] text-page"
                disabled={deleteMeal.isPending}
                onClick={() => deleteMeal.mutate(meal.id)}
              >
                {deleteMeal.isPending && <Spinner className="size-3.5" />}
                Delete
              </button>
            </div>
          ) : (
            <div className="-my-1 -mr-2 flex items-center opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <button type="button" className="icon-btn" aria-label={`Edit ${meal.meal_name}`} onClick={() => setMode('edit')}>
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn hover:text-critical"
                aria-label={`Delete ${meal.meal_name}`}
                onClick={() => setMode('confirm-delete')}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
        {deleteMeal.isError && (
          <div className="mt-2">
            <ErrorNote>{deleteMeal.error.message}</ErrorNote>
          </div>
        )}
      </div>
    </li>
  )
}

interface Draft {
  description: string
  meal_name: string
  meal_type: MealType
  eaten_at: string // datetime-local value
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

function MealEditor({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>({
    description: meal.description,
    meal_name: meal.meal_name,
    meal_type: meal.meal_type,
    eaten_at: toDateTimeLocal(meal.eaten_at),
    calories: String(meal.calories),
    protein_g: String(meal.protein_g),
    carbs_g: String(meal.carbs_g),
    fat_g: String(meal.fat_g),
  })
  const [items, setItems] = useState(meal.items)
  const update = useUpdateMeal()
  const estimate = useEstimateMeal()

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const numbers = [draft.calories, draft.protein_g, draft.carbs_g, draft.fat_g].map(Number)
  const numbersValid = numbers.every((n) => Number.isFinite(n) && n >= 0) && numbers[0] <= 10000
  const valid = draft.description.trim().length >= 2 && draft.meal_name.trim().length > 0 && numbersValid && draft.eaten_at

  function reestimate() {
    estimate.mutate(draft.description.trim(), {
      onSuccess: (result) => {
        setDraft((d) => ({
          ...d,
          meal_name: result.mealName,
          calories: String(result.calories),
          protein_g: String(result.protein),
          carbs_g: String(result.carbs),
          fat_g: String(result.fat),
        }))
        setItems(result.items)
      },
    })
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    const numbersChanged =
      Number(draft.calories) !== meal.calories ||
      Number(draft.protein_g) !== meal.protein_g ||
      Number(draft.carbs_g) !== meal.carbs_g ||
      Number(draft.fat_g) !== meal.fat_g
    update.mutate(
      {
        id: meal.id,
        patch: {
          description: draft.description.trim(),
          meal_name: draft.meal_name.trim(),
          meal_type: draft.meal_type,
          eaten_at: new Date(draft.eaten_at).toISOString(),
          calories: Math.round(Number(draft.calories)),
          protein_g: Number(draft.protein_g),
          carbs_g: Number(draft.carbs_g),
          fat_g: Number(draft.fat_g),
          items,
          // A fresh AI estimate keeps source 'ai'; hand-tuned numbers are flagged as edited.
          source: numbersChanged && items === meal.items ? 'edited' : meal.source,
        },
      },
      { onSuccess: onClose },
    )
  }

  const numberFields = [
    { key: 'calories' as const, label: 'Calories', unit: 'kcal', color: 'var(--energy)' },
    ...MACROS.map((m) => ({
      key: m.goalKey,
      label: m.label,
      unit: 'g',
      color: m.color,
    })),
  ]

  return (
    <form onSubmit={save} className="rounded-2xl border border-line bg-surface-2/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`desc-${meal.id}`}>
            What you ate
          </label>
          <textarea
            id={`desc-${meal.id}`}
            rows={2}
            maxLength={500}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            className="field resize-none bg-surface"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`name-${meal.id}`}>
            Title
          </label>
          <input
            id={`name-${meal.id}`}
            maxLength={80}
            value={draft.meal_name}
            onChange={(e) => set('meal_name', e.target.value)}
            className="field bg-surface"
          />
        </div>
        <div>
          <label className="label" htmlFor={`type-${meal.id}`}>
            Meal
          </label>
          <select
            id={`type-${meal.id}`}
            value={draft.meal_type}
            onChange={(e) => set('meal_type', e.target.value as MealType)}
            className="field bg-surface"
          >
            {MEAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`time-${meal.id}`}>
            Eaten at
          </label>
          <input
            id={`time-${meal.id}`}
            type="datetime-local"
            value={draft.eaten_at}
            onChange={(e) => set('eaten_at', e.target.value)}
            className="field bg-surface"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numberFields.map((f) => (
          <div key={f.key}>
            <label className="label flex items-center gap-1.5" htmlFor={`${f.key}-${meal.id}`}>
              <span aria-hidden className="size-2 rounded-full" style={{ background: f.color }} />
              {f.label}
            </label>
            <div className="relative">
              <input
                id={`${f.key}-${meal.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={f.unit === 'kcal' ? 1 : 0.1}
                value={draft[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                className="field num bg-surface pr-11"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
                {f.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {(update.isError || estimate.isError) && (
        <div className="mt-3">
          <ErrorNote>{(update.error ?? estimate.error)?.message}</ErrorNote>
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="btn-secondary"
          onClick={reestimate}
          disabled={estimate.isPending || draft.description.trim().length < 2}
        >
          {estimate.isPending ? <Spinner /> : <Sparkles className="size-4 text-energy" aria-hidden />}
          Re-estimate with AI
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={!valid || update.isPending}>
            {update.isPending && <Spinner />}
            Save changes
          </button>
        </div>
      </div>
    </form>
  )
}

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUp, Check, ChevronDown, KeyRound, RotateCw, Sparkles, Undo2 } from 'lucide-react'
import type { Json, MealType } from '../lib/database.types'
import { MEAL_TYPES, fmtGrams, fmtKcal, fmtTime, mealTypeForTime, type Meal } from '../lib/nutrition'
import { useDeleteMeal, useLogMeal, useLogPhotoMeal } from '../lib/queries'
import { AttachButtons, PhotoStrip, usePhotoAttachments } from './PhotoAttach'
import { ErrorNote, MacroInline, Skeleton, Spinner } from './ui'

const EXAMPLES = [
  'Two scrambled eggs and a slice of buttered whole wheat toast',
  'Chicken burrito bowl with rice, black beans and guacamole',
  'Large oat milk latte and a banana',
  'Paneer butter masala with two rotis',
]

/**
 * One box, two ways in:
 *  - type what you ate → Gemini estimates from text
 *  - scan your plate: 1–4 photos (camera or gallery), optionally with a note → Gemini vision.
 *    Several photos are either one meal (plate + drink) or one meal per photo.
 * Either way meals are estimated, validated and saved without typing any numbers.
 */
export function SmartMealInput() {
  const [text, setText] = useState('')
  const [mealType, setMealType] = useState<MealType>(() => mealTypeForTime(new Date()))
  const [mode, setMode] = useState<'together' | 'separate'>('together')
  const [lastLogged, setLastLogged] = useState<Meal[]>([])
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachments = usePhotoAttachments()
  const { photos } = attachments
  const logMeal = useLogMeal()
  const logPhoto = useLogPhotoMeal()

  const trimmed = text.trim()
  const pending = logMeal.isPending || logPhoto.isPending
  const canSubmit = !pending && !attachments.preparing && (photos.length > 0 || trimmed.length >= 2)
  const error = attachments.error ?? logPhoto.error?.message ?? logMeal.error?.message ?? null

  // Focus the note field once photos arrive.
  useEffect(() => {
    if (photos.length) textareaRef.current?.focus()
  }, [photos.length])

  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  function addPhotos(files: Iterable<File> | null | undefined) {
    logMeal.reset()
    logPhoto.reset()
    void attachments.add(files)
  }

  function onLogged(meals: Meal[]) {
    setLastLogged(meals)
    setText('')
    attachments.clear()
    setMode('together')
    requestAnimationFrame(resize)
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setLastLogged([])
    attachments.setError(null)
    logMeal.reset()
    logPhoto.reset()
    if (photos.length) {
      logPhoto.mutate(
        {
          photos: photos.map(({ base64, mimeType, thumbnail }) => ({ base64, mimeType, thumbnail })),
          mode,
          note: trimmed || undefined,
          mealType,
        },
        { onSuccess: onLogged },
      )
    } else {
      logMeal.mutate({ description: trimmed, mealType }, { onSuccess: (meal) => onLogged([meal]) })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (images.length) {
      e.preventDefault()
      addPhotos(images)
    }
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault()
    setDragging(false)
    addPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
  }

  const several = photos.length > 1

  return (
    <section aria-labelledby="log-meal-heading" className="space-y-3">
      <form
        onSubmit={submit}
        onDragOver={(e) => {
          if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition sm:p-5 ${dragging ? 'ring-2 ring-energy' : ''}`}
      >
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-energy" aria-hidden />
          <h2 id="log-meal-heading" className="text-[15px] font-semibold">
            What did you eat?
          </h2>
        </div>

        {attachments.inputs}

        <div className="rounded-xl border border-line bg-surface-2 transition focus-within:border-energy focus-within:bg-surface">
          {(photos.length > 0 || attachments.preparing) && (
            <div className="space-y-3 px-3 pt-3">
              <PhotoStrip attachments={attachments} disabled={pending} />
              {several ? (
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium text-ink-2">These {photos.length} photos are…</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                    {(
                      [
                        ['together', 'One meal'],
                        ['separate', 'One meal per photo'],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-lg py-1.5 text-center text-[13px] font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-energy ${
                          mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <input
                          type="radio"
                          name="photo-mode"
                          value={value}
                          checked={mode === value}
                          onChange={() => setMode(value)}
                          disabled={pending}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                photos.length === 1 && (
                  <p className="text-[13px] text-ink-2">
                    <span className="font-medium text-ink">Photo ready.</span> Add more angles or dishes, or a note for
                    anything the camera can’t see.
                  </p>
                )
              )}
            </div>
          )}

          <label htmlFor="meal-text" className="sr-only">
            {photos.length ? 'Optional note about the photos' : 'Describe your meal'}
          </label>
          <textarea
            id="meal-text"
            ref={textareaRef}
            rows={photos.length ? 1 : 2}
            value={text}
            maxLength={500}
            disabled={pending}
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={
              photos.length
                ? several && mode === 'separate'
                  ? 'Add a note for all photos (optional)'
                  : 'Add a note (optional)'
                : 'e.g. 2 scrambled eggs and buttered toast'
            }
            className="block w-full resize-none bg-transparent px-3 pt-3 text-base leading-relaxed text-ink outline-none placeholder:text-muted sm:text-[15px]"
          />

          <div className="flex items-center justify-between gap-2 p-2 pt-1">
            <AttachButtons attachments={attachments} disabled={pending} />
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={photos.length ? 'Analyze photos and log' : 'Log meal'}
              className="btn-primary size-10 shrink-0 rounded-full p-0"
            >
              {pending ? <Spinner /> : <ArrowUp className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Meal type</legend>
            {MEAL_TYPES.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-energy ${
                  mealType === t.value
                    ? 'border-ink bg-ink text-page'
                    : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name="meal-type"
                  value={t.value}
                  checked={mealType === t.value}
                  onChange={() => setMealType(t.value)}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </fieldset>
          <p className="hidden text-xs text-muted sm:block">Enter to log · up to 4 photos · paste or drop</p>
        </div>

        {!trimmed && !photos.length && !pending && !attachments.preparing && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-xs font-medium text-muted">Try one</p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setText(example)
                    requestAnimationFrame(() => {
                      resize()
                      textareaRef.current?.focus()
                    })
                  }}
                  className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-left text-[13px] text-ink-2 transition hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      <div aria-live="polite" className="space-y-3">
        {pending && (
          <EstimatingCard
            photoUrl={logPhoto.isPending ? photos[0]?.previewUrl : undefined}
            count={logPhoto.isPending && mode === 'separate' ? photos.length : 1}
          />
        )}
        {error && !pending && (
          <div className="space-y-2">
            <ErrorNote>{error}</ErrorNote>
            {/servers are busy/i.test(error) && canSubmit && (
              <button type="button" onClick={() => submit()} className="btn-secondary px-3 py-1.5 text-[13px]">
                <RotateCw className="size-4" aria-hidden />
                Try again
              </button>
            )}
            {/Gemini API key/i.test(error) && (
              <Link to="/goals" hash="gemini-key" className="btn-secondary px-3 py-1.5 text-[13px]">
                <KeyRound className="size-4" aria-hidden />
                Open key settings
              </Link>
            )}
          </div>
        )}
        {!pending &&
          lastLogged.map((meal) => (
            <LoggedCard
              key={meal.id}
              meal={meal}
              onUndone={() => setLastLogged((list) => list.filter((m) => m.id !== meal.id))}
            />
          ))}
      </div>
    </section>
  )
}

function EstimatingCard({ photoUrl, count }: { photoUrl?: string; count: number }) {
  // Count seconds so a long wait explains itself instead of looking frozen.
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const status =
    seconds >= 12 * Math.max(1, count)
      ? 'Still working. Gemini is very busy right now, trying a backup model…'
      : seconds >= 5 * Math.max(1, count)
        ? 'Taking longer than usual. Google’s servers may be busy…'
        : null

  return (
    <div className="card flex items-center gap-4 p-4">
      {photoUrl ? (
        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
          <img src={photoUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 animate-pulse bg-energy/25" />
        </div>
      ) : (
        <div className="flex size-10 items-center justify-center rounded-full bg-energy-track text-energy">
          <Sparkles className="size-5 animate-pulse" aria-hidden />
        </div>
      )}
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium">
          {photoUrl ? (count > 1 ? `Analyzing ${count} meals…` : 'Analyzing your plate…') : 'Estimating calories and macros…'}
        </p>
        {status ? <p className="text-xs text-muted">{status}</p> : <Skeleton className="h-2.5 w-2/3" />}
      </div>
    </div>
  )
}

interface ItemRow {
  name: string
  portion: string
  Calories: number
  Protein: number
  Carbs: number
  Fats: number
}

function asItems(items: Json): ItemRow[] {
  return Array.isArray(items) ? (items as unknown as ItemRow[]) : []
}

function LoggedCard({ meal, onUndone }: { meal: Meal; onUndone: () => void }) {
  const deleteMeal = useDeleteMeal()
  const items = asItems(meal.items)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {meal.photo_thumb ? (
          <img src={meal.photo_thumb} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-energy text-page">
            <Check className="size-4.5" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {meal.input_type === 'photo' ? 'Scanned from photo' : 'Logged'} as {meal.meal_type} · {fmtTime(meal.eaten_at)}
          </p>
          <p className="mt-0.5 font-semibold">{meal.meal_name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-sm font-semibold">
              <span className="num">{fmtKcal(meal.calories)}</span> kcal
            </span>
            <MacroInline protein={meal.protein_g} carbs={meal.carbs_g} fat={meal.fat_g} />
          </div>
          {meal.ai_notes && <p className="mt-2 text-xs text-muted">{meal.ai_notes}</p>}
        </div>
        <button
          type="button"
          className="btn-ghost -mr-1 shrink-0 px-2.5 py-1.5 text-[13px]"
          disabled={deleteMeal.isPending}
          onClick={() => deleteMeal.mutate(meal.id, { onSuccess: onUndone })}
        >
          {deleteMeal.isPending ? <Spinner className="size-3.5" /> : <Undo2 className="size-3.5" aria-hidden />}
          Undo
        </button>
      </div>

      {items.length > 0 && (
        <details className="group border-t border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:text-ink">
            {items.length} {items.length === 1 ? 'item' : 'items'} · {meal.confidence ?? 'medium'} confidence
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-line px-4 pb-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium">{item.name}</span>
                  {item.portion && <span className="block truncate text-muted">{item.portion}</span>}
                </span>
                <span className="num shrink-0 text-ink-2">
                  {fmtKcal(item.Calories)} kcal · {fmtGrams(item.Protein)}/{fmtGrams(item.Carbs)}/{fmtGrams(item.Fats)} g
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

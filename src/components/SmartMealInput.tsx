import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Camera, Check, ChevronDown, ImagePlus, Sparkles, Undo2, X } from 'lucide-react'
import type { Json, MealType } from '../lib/database.types'
import { PhotoError, preparePhoto, type PreparedPhoto } from '../lib/image'
import { MEAL_TYPES, fmtGrams, fmtKcal, fmtTime, mealTypeForTime, type Meal } from '../lib/nutrition'
import { useDeleteMeal, useLogMeal, useLogPhotoMeal } from '../lib/queries'
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
 *  - scan your plate (camera or gallery), optionally with a note → Gemini vision
 * Either way the meal is estimated, validated and saved without typing any numbers.
 */
export function SmartMealInput() {
  const [text, setText] = useState('')
  const [mealType, setMealType] = useState<MealType>(() => mealTypeForTime(new Date()))
  const [lastLogged, setLastLogged] = useState<Meal | null>(null)
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const logMeal = useLogMeal()
  const logPhoto = useLogPhotoMeal()

  const trimmed = text.trim()
  const pending = logMeal.isPending || logPhoto.isPending
  const canSubmit = !pending && !preparing && (photo !== null || trimmed.length >= 2)
  const error = photoError ?? logPhoto.error?.message ?? logMeal.error?.message ?? null

  // Free the preview's object URL when the photo is replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [photo])

  function resize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  async function attach(file: File | undefined | null) {
    if (!file) return
    setPhotoError(null)
    logMeal.reset()
    logPhoto.reset()
    setPreparing(true)
    try {
      setPhoto(await preparePhoto(file))
      requestAnimationFrame(() => textareaRef.current?.focus())
    } catch (err) {
      setPhotoError(err instanceof PhotoError ? err.message : 'Could not open that photo.')
    } finally {
      setPreparing(false)
    }
  }

  function clearPhoto() {
    setPhoto(null)
    setPhotoError(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
  }

  function onLogged(meal: Meal) {
    setLastLogged(meal)
    setText('')
    clearPhoto()
    requestAnimationFrame(resize)
  }

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setLastLogged(null)
    setPhotoError(null)
    logMeal.reset()
    logPhoto.reset()
    if (photo) {
      logPhoto.mutate(
        {
          imageBase64: photo.base64,
          mimeType: photo.mimeType,
          thumbnail: photo.thumbnail,
          note: trimmed || undefined,
          mealType,
        },
        { onSuccess: onLogged },
      )
    } else {
      logMeal.mutate({ description: trimmed, mealType }, { onSuccess: onLogged })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (image) {
      e.preventDefault()
      attach(image)
    }
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault()
    setDragging(false)
    attach([...e.dataTransfer.files].find((f) => f.type.startsWith('image/')))
  }

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

        {/* Hidden pickers: `capture` opens the rear camera on phones; the other opens the gallery. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => attach(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => attach(e.target.files?.[0])}
        />

        <div className="rounded-xl border border-line bg-surface-2 transition focus-within:border-energy focus-within:bg-surface">
          {(photo || preparing) && (
            <div className="flex items-center gap-3 px-3 pt-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-line">
                {photo ? (
                  <img src={photo.previewUrl} alt="Your meal photo" className="size-full object-cover" />
                ) : (
                  <div className="shimmer size-full" />
                )}
                {photo && !pending && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </div>
              <p className="text-[13px] text-ink-2">
                {preparing ? (
                  'Preparing photo…'
                ) : (
                  <>
                    <span className="font-medium text-ink">Photo ready.</span> Add a note for anything the camera
                    can’t see: portions, oil, what you didn’t finish.
                  </>
                )}
              </p>
            </div>
          )}

          <label htmlFor="meal-text" className="sr-only">
            {photo ? 'Optional note about the photo' : 'Describe your meal'}
          </label>
          <textarea
            id="meal-text"
            ref={textareaRef}
            rows={photo ? 1 : 2}
            value={text}
            maxLength={500}
            disabled={pending}
            onChange={(e) => {
              setText(e.target.value)
              resize()
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={photo ? 'Add a note (optional)' : 'e.g. 2 scrambled eggs and buttered toast'}
            className="block w-full resize-none bg-transparent px-3 pt-3 text-base leading-relaxed text-ink outline-none placeholder:text-muted sm:text-[15px]"
          />

          <div className="flex items-center justify-between gap-2 p-2 pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={pending || preparing}
                className="btn-ghost gap-1.5 px-2.5 py-2 text-[13px]"
              >
                <Camera className="size-4.5" aria-hidden />
                Scan plate
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                disabled={pending || preparing}
                aria-label="Choose a photo from your gallery"
                title="Choose from gallery"
                className="icon-btn"
              >
                <ImagePlus className="size-4.5" aria-hidden />
              </button>
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-label={photo ? 'Analyze photo and log meal' : 'Log meal'}
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
          <p className="hidden text-xs text-muted sm:block">Enter to log · paste or drop a photo</p>
        </div>

        {!trimmed && !photo && !pending && !preparing && (
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

      <div aria-live="polite">
        {pending && <EstimatingCard photoUrl={logPhoto.isPending ? photo?.previewUrl : undefined} />}
        {error && !pending && <ErrorNote>{error}</ErrorNote>}
        {lastLogged && !pending && <LoggedCard meal={lastLogged} onUndone={() => setLastLogged(null)} />}
      </div>
    </section>
  )
}

function EstimatingCard({ photoUrl }: { photoUrl?: string }) {
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
        <p className="text-sm font-medium">{photoUrl ? 'Analyzing your plate…' : 'Estimating calories and macros…'}</p>
        <Skeleton className="h-2.5 w-2/3" />
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

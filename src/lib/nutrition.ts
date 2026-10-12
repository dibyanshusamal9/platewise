import type { ActivityLevel, MealType, Sex, Tables } from './database.types'

export type Meal = Tables<'meals'>
export type DailyGoal = Tables<'daily_goals'>
export type Profile = Tables<'users'>

export interface Totals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export const ZERO_TOTALS: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0 }

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

export const MACROS = [
  { key: 'protein', label: 'Protein', short: 'P', goalKey: 'protein_g', color: 'var(--protein)', track: 'var(--protein-track)' },
  { key: 'carbs', label: 'Carbs', short: 'C', goalKey: 'carbs_g', color: 'var(--carbs)', track: 'var(--carbs-track)' },
  { key: 'fat', label: 'Fats', short: 'F', goalKey: 'fat_g', color: 'var(--fats)', track: 'var(--fats-track)' },
] as const

export const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

export function mealTypeForTime(date: Date): MealType {
  const h = date.getHours()
  if (h >= 4 && h < 11) return 'breakfast'
  if (h >= 11 && h < 16) return 'lunch'
  if (h >= 17 && h < 22) return 'dinner'
  return 'snack'
}

// ─── Local-calendar dates ───────────────────────────────────────────────────
// Meals are stored as absolute timestamps; "which day" is decided in the
// viewer's own time zone so a 11:30 pm snack lands on the right day.

/** YYYY-MM-DD in the browser's time zone. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local midnight for a YYYY-MM-DD key. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** The 7 local-day keys ending today, oldest first. */
export function lastSevenDayKeys(todayKey: string): string[] {
  const today = dateFromKey(todayKey)
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(today, i - 6)))
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export function sumMeals(meals: Meal[]): Totals {
  return meals.reduce<Totals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + Number(m.protein_g),
      carbs: acc.carbs + Number(m.carbs_g),
      fat: acc.fat + Number(m.fat_g),
    }),
    { ...ZERO_TOTALS },
  )
}

export function groupMealsByDay(meals: Meal[]): Map<string, Meal[]> {
  const byDay = new Map<string, Meal[]>()
  for (const meal of meals) {
    const key = dayKey(new Date(meal.eaten_at))
    const list = byDay.get(key)
    if (list) list.push(meal)
    else byDay.set(key, [meal])
  }
  return byDay
}

/**
 * Goals are versioned by `effective_from`. A day uses the newest version that
 * started on or before it; days before the first version fall back to it.
 * Expects `goals` sorted by effective_from ascending.
 */
export function goalForDay(goals: DailyGoal[], key: string): DailyGoal | null {
  if (goals.length === 0) return null
  let match: DailyGoal | null = null
  for (const goal of goals) {
    if (goal.effective_from <= key) match = goal
    else break
  }
  return match ?? goals[0]
}

export interface DaySummary {
  key: string
  date: Date
  meals: Meal[]
  totals: Totals
  goal: DailyGoal | null
  logged: boolean
}

export function summarizeDays(keys: string[], meals: Meal[], goals: DailyGoal[]): DaySummary[] {
  const byDay = groupMealsByDay(meals)
  return keys.map((key) => {
    const dayMeals = byDay.get(key) ?? []
    return {
      key,
      date: dateFromKey(key),
      meals: dayMeals,
      totals: sumMeals(dayMeals),
      goal: goalForDay(goals, key),
      logged: dayMeals.length > 0,
    }
  })
}

/** Share of energy from each macro (0–1), using 4/4/9 kcal per gram. */
export function energySplit(t: Pick<Totals, 'protein' | 'carbs' | 'fat'>) {
  const p = t.protein * KCAL_PER_GRAM.protein
  const c = t.carbs * KCAL_PER_GRAM.carbs
  const f = t.fat * KCAL_PER_GRAM.fat
  const total = p + c + f
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 }
  return { protein: p / total, carbs: c / total, fat: f / total }
}

// ─── TDEE calculator (Mifflin-St Jeor) ──────────────────────────────────────

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; hint: string; factor: number }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk job, little exercise', factor: 1.2 },
  { value: 'light', label: 'Lightly active', hint: 'Exercise 1–3 days a week', factor: 1.375 },
  { value: 'moderate', label: 'Moderately active', hint: 'Exercise 3–5 days a week', factor: 1.55 },
  { value: 'active', label: 'Very active', hint: 'Hard exercise 6–7 days a week', factor: 1.725 },
  { value: 'very_active', label: 'Athlete', hint: 'Physical job or twice-daily training', factor: 1.9 },
]

export type WeightGoal = 'lose' | 'maintain' | 'gain'

export interface BodyMetrics {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: ActivityLevel
}

export function bmr({ sex, age, heightCm, weightKg }: BodyMetrics): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)
}

export function tdee(metrics: BodyMetrics): number {
  const factor = ACTIVITY_LEVELS.find((a) => a.value === metrics.activity)?.factor ?? 1.2
  return Math.round(bmr(metrics) * factor)
}

/** Sensible starting targets: protein by body weight, ~27% fat, carbs fill the rest. */
export function suggestTargets(tdeeKcal: number, weightKg: number, goal: WeightGoal) {
  const adjustment = goal === 'lose' ? -500 : goal === 'gain' ? 300 : 0
  const calories = adjustment === 0 ? tdeeKcal : Math.max(1200, Math.round((tdeeKcal + adjustment) / 10) * 10)
  const protein = Math.round(weightKg * (goal === 'maintain' ? 1.6 : 2.0))
  const fat = Math.round((calories * 0.27) / KCAL_PER_GRAM.fat)
  const carbs = Math.max(
    0,
    Math.round((calories - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat) / KCAL_PER_GRAM.carbs),
  )
  return { calories, protein, carbs, fat }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

const intFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const gramFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export const fmtKcal = (n: number) => intFormat.format(Math.round(n))
export const fmtGrams = (n: number) => gramFormat.format(n)
export const fmtSigned = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + intFormat.format(Math.abs(Math.round(n)))
export const fmtPct = (fraction: number) => `${Math.round(fraction * 100)}%`

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function fmtDayLabel(key: string, todayKey: string) {
  if (key === todayKey) return 'Today'
  if (key === dayKey(addDays(dateFromKey(todayKey), -1))) return 'Yesterday'
  return dateFromKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** Value for <input type="datetime-local"> in local time. */
export function toDateTimeLocal(iso: string) {
  const d = new Date(iso)
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

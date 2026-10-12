import { createFileRoute } from '@tanstack/react-router'
import { SmartMealInput } from '../components/SmartMealInput'
import { Dashboard } from '../components/Dashboard'
import { GeminiKeySettings } from '../components/GeminiKeySettings'
import { useUser } from '../lib/auth'
import { useGeminiKey } from '../lib/gemini-key'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Today · Platewise' }] }),
  component: TodayPage,
})

function TodayPage() {
  const user = useUser()
  const geminiKey = useGeminiKey(user.id)
  return (
    <div className="space-y-6">
      {/* Logging needs the person's own Gemini key; until it's saved, show how to get one. */}
      {geminiKey ? <SmartMealInput /> : <GeminiKeySettings variant="setup" />}
      <Dashboard />
    </div>
  )
}

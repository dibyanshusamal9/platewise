import { createFileRoute } from '@tanstack/react-router'
import { SmartMealInput } from '../components/SmartMealInput'
import { Dashboard } from '../components/Dashboard'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Today · Platewise' }] }),
  component: TodayPage,
})

function TodayPage() {
  return (
    <div className="space-y-6">
      <SmartMealInput />
      <Dashboard />
    </div>
  )
}

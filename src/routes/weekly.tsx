import { createFileRoute } from '@tanstack/react-router'
import { WeeklyReport } from '../components/WeeklyReport'

export const Route = createFileRoute('/weekly')({
  head: () => ({ meta: [{ title: 'Weekly report · Platewise' }] }),
  component: WeeklyReport,
})

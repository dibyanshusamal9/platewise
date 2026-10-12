import { createFileRoute } from '@tanstack/react-router'
import { GoalsSetup } from '../components/GoalsSetup'

export const Route = createFileRoute('/goals')({
  head: () => ({ meta: [{ title: 'Settings · Platewise' }] }),
  component: GoalsSetup,
})

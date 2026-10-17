import { createFileRoute } from '@tanstack/react-router'
import { Coach } from '../components/Coach'

export const Route = createFileRoute('/coach')({
  head: () => ({ meta: [{ title: 'Saffron · Platewise' }] }),
  component: Coach,
})

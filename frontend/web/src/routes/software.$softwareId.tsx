import { createFileRoute } from '@tanstack/react-router'

import { SoftwareDetailsPage } from '@/features/software-center/details-page'

function SoftwareDetailRoute() {
  const { softwareId } = Route.useParams()
  return <SoftwareDetailsPage softwareId={softwareId} />
}
export const Route = createFileRoute('/software/$softwareId')({
  component: SoftwareDetailRoute,
})

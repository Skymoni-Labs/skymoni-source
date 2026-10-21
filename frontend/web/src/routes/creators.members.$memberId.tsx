import { createFileRoute } from '@tanstack/react-router'

import { CommunityMember } from '@/features/community/member'

export const Route = createFileRoute('/creators/members/$memberId')({
  component: Page,
})
function Page() {
  const { memberId } = Route.useParams()
  return <CommunityMember memberId={memberId} />
}

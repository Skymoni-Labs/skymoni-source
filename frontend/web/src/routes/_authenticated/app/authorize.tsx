import { createFileRoute } from '@tanstack/react-router'

import { AppAccountAuthorization } from '@/features/app-account/authorize'

export const Route = createFileRoute('/_authenticated/app/authorize')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === 'string' ? search.code.slice(0, 16) : '',
  }),
  component: AuthorizationPage,
})

function AuthorizationPage() {
  const { code } = Route.useSearch()
  return <AppAccountAuthorization initialCode={code} />
}

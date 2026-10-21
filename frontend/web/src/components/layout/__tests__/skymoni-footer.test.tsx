import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { Footer } from '../components/footer'

let client: QueryClient
const initialConfig = useSystemConfigStore.getState().config
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], {
    system_name: 'skymoni',
    user_agreement_enabled: true,
  })
  useSystemConfigStore
    .getState()
    .setConfig({ systemName: 'skymoni', footerHtml: '' })
})
afterEach(() => {
  client.clear()
  useSystemConfigStore.getState().setConfig(initialConfig)
  localStorage.clear()
})
it('shows user resources without the framework license entry', () => {
  render(
    <QueryClientProvider client={client}>
      <Footer />
    </QueryClientProvider>
  )
  expect(
    screen.getByRole('link', { name: 'skymoni user guide' })
  ).toHaveAttribute('href', '/about')
  expect(
    screen.queryByRole('link', { name: 'Open-source notices' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'User Agreement' })).toBeVisible()
  expect(screen.queryByText('New API')).not.toBeInTheDocument()
})

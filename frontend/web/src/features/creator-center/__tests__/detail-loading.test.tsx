import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorStore } from '@/stores/creator-store'

import { loadCreatorWork } from '../api'
import { CreatorDetails } from '../details'
import { emptyWork } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../api', () => ({
  loadCreatorWork: vi.fn(),
  loadPublicCreatorProfile: vi.fn(),
}))
const work = {
  ...emptyWork(),
  id: 'real',
  title: 'Real project',
  status: 'published' as const,
  description: 'Full description from the detail API',
}
let client: QueryClient
beforeEach(() => {
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useCreatorStore.setState({
    works: [],
    published: [{ ...work, description: '', images: [] }],
    saved: [],
  })
})
afterEach(() => {
  cleanup()
  client.clear()
})
function renderDetail() {
  render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        <CreatorDetails workId='real' />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}
test('opening a card fetches and renders the full project instead of its list projection', async () => {
  vi.mocked(loadCreatorWork).mockResolvedValue({ work, releases: [] })
  renderDetail()
  expect(await screen.findByText(work.description)).toBeInTheDocument()
})
test('a pending direct project request shows loading rather than a false not-found message', () => {
  useCreatorStore.setState({ published: [] })
  vi.mocked(loadCreatorWork).mockImplementation(() => new Promise(() => {}))
  renderDetail()
  expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  expect(screen.queryByText('Project not found')).not.toBeInTheDocument()
})
test('a failed detail request offers retry instead of rendering incomplete card content', async () => {
  vi.mocked(loadCreatorWork).mockRejectedValue(new Error('network unavailable'))
  renderDetail()
  expect(
    await screen.findByRole('button', { name: 'Retry' })
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Full description from the detail API')
  ).not.toBeInTheDocument()
})

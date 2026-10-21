import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SoftwareTestRouter } from '@/features/software-center/__tests__/router-fixture'
import { useCreatorStore } from '@/stores/creator-store'

import { githubImport, githubRepositories } from '../github-api'
import { GitHubRepositoryPicker } from '../github-connect'
import { emptyWork } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../github-api', async (original) => ({
  ...(await original<typeof import('../github-api')>()),
  githubRepositories: vi.fn(),
  githubImport: vi.fn(),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.mocked(githubRepositories).mockReset()
  vi.mocked(githubImport).mockReset()
  useCreatorStore.setState({ works: [] })
})
function view() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SoftwareTestRouter>
        <GitHubRepositoryPicker />
      </SoftwareTestRouter>
    </QueryClientProvider>
  )
}
const repo = {
  id: 1,
  name: 'board',
  full_name: 'author/board',
  description: 'A hardware project',
  language: null,
  fork: false,
  archived: false,
}
test('selection and optional subdirectory produce a private editable draft without downloading a package', async () => {
  vi.mocked(githubRepositories).mockResolvedValue([repo])
  const work = { ...emptyWork(), title: 'Board', status: 'draft' as const }
  vi.mocked(githubImport).mockResolvedValue({
    work,
    signals: ['hardware'],
    warnings: ['COVER_OPTIONAL'],
  })
  view()
  const importButton = screen.getByRole('button', {
    name: 'Import as private draft',
  })
  expect(importButton).toBeDisabled()
  fireEvent.click(await screen.findByRole('button', { name: /author\/board/ }))
  fireEvent.change(screen.getByLabelText('Project subdirectory (optional)'), {
    target: { value: 'boards/controller' },
  })
  fireEvent.click(importButton)
  expect(
    await screen.findByText('Your private draft is ready.')
  ).toBeInTheDocument()
  expect(githubImport).toHaveBeenCalledWith('author/board', 'boards/controller')
  expect(
    screen.getByRole('button', { name: 'Review and edit draft' })
  ).toHaveAttribute('href', `/creators/studio?edit=${work.id}`)
  expect(useCreatorStore.getState().works[0].status).toBe('draft')
  expect(importButton).toBeDisabled()
})
test('an import failure leaves retry available and does not add a fake draft', async () => {
  vi.mocked(githubRepositories).mockResolvedValue([repo])
  vi.mocked(githubImport).mockRejectedValue(new Error('GitHub offline'))
  view()
  fireEvent.click(await screen.findByRole('button', { name: /author\/board/ }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Import as private draft' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Import as private draft' })
    ).toBeEnabled()
  )
  expect(useCreatorStore.getState().works).toEqual([])
  expect(
    screen.queryByText('Your private draft is ready.')
  ).not.toBeInTheDocument()
})
test('an empty public repository list explains the state and leaves import disabled', async () => {
  vi.mocked(githubRepositories).mockResolvedValue([])
  view()
  expect(
    await screen.findByText('No matching public repositories on this page.')
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Import as private draft' })
  ).toBeDisabled()
})
test('repository request failure exposes a retry that loads the real results', async () => {
  vi.mocked(githubRepositories)
    .mockRejectedValueOnce(new Error('revoked'))
    .mockResolvedValueOnce([repo])
  view()
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('button', { name: /author\/board/ })
  ).toBeInTheDocument()
})
